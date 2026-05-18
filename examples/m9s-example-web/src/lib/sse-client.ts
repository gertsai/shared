// SPDX-License-Identifier: Apache-2.0
/**
 * Wave 10.B (PRD-019 FR-002) — browser-side SSE consumer.
 *
 * Thin wrapper around the platform `EventSource` API. The backend exposes
 * `/api/stream/ingest?docId=...&tenantId=...` (see
 * m9s-example/src/mol-services/api.service.ts + sse-ingest.handler.ts).
 *
 * Why a wrapper over raw `EventSource`:
 *
 *   1. JSON decoding lives here — components stay declarative.
 *   2. Terminal kinds (`done` / `error`) auto-close the connection, mirroring
 *      the server's cleanup semantics. The caller does not have to remember
 *      to `.close()` on every terminal frame.
 *   3. The component receives a single `unsubscribe()` teardown which is
 *      idempotent and `$effect`-cleanup friendly (Svelte 5 reactive pattern).
 *   4. Wave 12.E-fix-2 Phase 2 (EVID-053 H-6) — base URL + tenant query
 *      string + `withCredentials` injected here so the consumer cannot
 *      accidentally hit the same-origin path without tenant scoping or
 *      auth cookie. EventSource does not support custom headers, so the
 *      tenant goes on the URL (validated server-side against the session).
 *
 * The `SseEvent` type is duplicated here (structural copy of the backend
 * type) on purpose — importing from `m9s-example` would couple the frontend
 * bundle to backend internals, breaking the OpenAPI contract boundary
 * established in Wave 9. If the wire shape ever needs to be shared, promote
 * it via the api-types package.
 */
import { apiConfig } from '$lib/api/config';

/**
 * Discriminator for SSE lifecycle events. Mirrors the backend
 * `SseEventKind` in `m9s-example/src/services/ingest/src/sse-emitter.ts`.
 * Keep the unions in sync across boundary changes.
 */
export type SseEventKind = 'started' | 'embedding' | 'persisted' | 'done' | 'error';

/** Wire shape of a single SSE frame — matches backend `SseEvent`. */
export interface SseEvent {
  readonly kind: SseEventKind;
  readonly docId: string;
  readonly ts: number;
  readonly detail?: string;
}

/**
 * Reason the stream was closed. Useful for UI distinctions (banner copy,
 * retry vs. final state). `manual` fires only when the caller invokes the
 * returned teardown function.
 */
export type SseCloseReason = 'done' | 'error' | 'timeout' | 'manual';

/** Callback shape for the {@link openSse} consumer. */
export interface SseHandlers {
  /** Invoked for every event frame the server sends. */
  readonly onEvent: (event: SseEvent) => void;
  /** Invoked exactly once when the stream ends. Optional. */
  readonly onClose?: (reason: SseCloseReason) => void;
}

/**
 * Open an SSE stream for `docId`. Returns an idempotent teardown function;
 * call it from `$effect` cleanup (Svelte 5) or component `onDestroy`.
 *
 * Error semantics:
 *   - Browser-side `EventSource` failures (network, 5xx, CORS) emit the
 *     `'error'` close reason and close the stream — no auto-retry. The UI
 *     surfaces a "connection lost — retry shortly" copy block; the user
 *     re-uploads to start a new stream. Auto-reconnect on docId-tied
 *     streams is out of scope per PRD-019 NFR-3.
 *   - Server-emitted `error` frames (synthetic or pipeline) are surfaced
 *     to `onEvent` first, then trigger close via the terminal-kind branch.
 *
 * @param docId    Validated document id (caller-side: regex matches the
 *                 server allow-list `/^[a-z0-9-]{8,64}$/`).
 * @param handlers Event + close callbacks.
 * @returns        Idempotent close-this-stream function.
 */
export function openSse(docId: string, handlers: SseHandlers): () => void {
  // Wave 12.E-fix-2 Phase 2 (EVID-053 H-6):
  //   - Build against `apiConfig.baseUrl` so the request hits the backend
  //     gateway directly (pre-fix it landed at the same-origin SvelteKit
  //     dev server with the gateway URL unset).
  //   - Forward `tenantId` as a query param — `EventSource` cannot set
  //     custom headers, and the backend handler now cross-checks this
  //     value against the authenticated session (H-14) before fanning
  //     events out to the per-tenant subscriber registry.
  //   - `withCredentials: true` so the browser ships the httpOnly
  //     `auth_token` cookie alongside; gateway Wave 5 middleware reads
  //     it as part of the same auth flow used by the REST routes.
  //
  // EventSource still URL-encodes the path; we encode each query param
  // value defensively (the UI should already pre-validate, but
  // defence-in-depth is cheap here).
  const tenantId = apiConfig.tenantId;
  const url =
    `${apiConfig.baseUrl}/api/stream/ingest` +
    `?docId=${encodeURIComponent(docId)}` +
    `&tenantId=${encodeURIComponent(tenantId)}`;
  const es = new EventSource(url, { withCredentials: true });

  let closed = false;
  const closeOnce = (reason: SseCloseReason): void => {
    if (closed) return;
    closed = true;
    es.close();
    handlers.onClose?.(reason);
  };

  es.onmessage = (msg: MessageEvent<string>): void => {
    // Defensive parse — a corrupted frame should not blow up the page.
    let data: SseEvent | null = null;
    try {
      // reason: SSE wire format is untyped JSON; we structurally validate
      // the discriminator below before forwarding to the consumer.
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      data = JSON.parse(msg.data) as SseEvent;
    } catch {
      return;
    }
    if (!data || typeof data.kind !== 'string') return;

    handlers.onEvent(data);

    if (data.kind === 'done' || data.kind === 'error') {
      // Distinguish timeout (synthetic detail) from generic error so the
      // UI can show a more specific banner when desired.
      const reason: SseCloseReason =
        data.kind === 'done'
          ? 'done'
          : data.detail === 'timeout'
            ? 'timeout'
            : 'error';
      closeOnce(reason);
    }
  };

  es.onerror = (): void => {
    // EventSource fires onerror both for transient (retrying) and fatal
    // states; we treat any error as fatal to keep the contract simple.
    closeOnce('error');
  };

  return () => closeOnce('manual');
}
