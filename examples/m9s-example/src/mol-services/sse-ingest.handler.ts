// SPDX-License-Identifier: Apache-2.0
/**
 * Wave 10.B (PRD-019 FR-002) — SSE handler for `GET /api/stream/ingest`.
 *
 * Lives as a moleculer-web `AliasFunction` outside the regular action
 * lifecycle: SSE needs a long-lived response, which conflicts with
 * Moleculer's request/response action model. The handler:
 *
 *   1. Validates `docId` from the query string (allow-list regex, no
 *      newlines — header-injection prevention per PRD-019 §Security).
 *   2. Sets the standard SSE headers + flushes them immediately so the
 *      browser switches into streaming mode before any event fires.
 *   3. Subscribes to in-memory pub/sub (`@/services/ingest/src/sse-emitter`),
 *      relaying every event as a single `data: <json>\n\n` frame.
 *   4. Closes on terminal `done` / `error` events, on client disconnect,
 *      and on a 30s idle-timeout (synthetic `error` with `detail: 'timeout'`).
 *   5. Never calls `next()` — moleculer-web's outer Promise resolves via
 *      `res.once('close')` when the connection ends. See alias.js + the
 *      route handler in moleculer-web/src/index.js (~line 425).
 *
 * Logging discipline: only `docId` + (optional) request id is logged; no
 * tenant ids, user ids, or PII per PRD-019 §Compliance.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';

import { subscribe, type SseEvent } from '../services/ingest/src/sse-emitter';

/**
 * Permissible `docId` shape: lowercase alphanumerics + dashes, 8..64 chars.
 * Locks out CR/LF (header injection), quotes, semicolons, slashes, etc.
 * Matches the upload action's docId convention (UUID v4 lower-cased or
 * stable identifier the caller supplied).
 */
const DOC_ID_PATTERN = /^[a-z0-9-]{8,64}$/;

/**
 * Idle timeout — if no event has fired for this long, the server emits a
 * synthetic `error` frame and closes the stream. Prevents indefinitely-open
 * sockets from leaking when a producer crashes mid-pipeline.
 */
const IDLE_TIMEOUT_MS = 30_000;

/** SSE frame terminator — two LFs per the spec. */
const SSE_FRAME_END = '\n\n';

/**
 * moleculer-web `AliasFunction` for SSE — typed against bare Node http
 * primitives (the `IncomingRequest` / `GatewayResponse` subtypes from
 * moleculer-web add no surface we need here).
 */
export function sseIngestAliasHandler(
  req: IncomingMessage,
  res: ServerResponse,
): void {
  // ---------------------------------------------------------------------
  // 1. Parse + validate `docId` from the query string.
  //    `req.url` may be `/api/stream/ingest?docId=abc`; we only need the
  //    search params, so a relative URL with a dummy base is sufficient.
  // ---------------------------------------------------------------------
  const rawUrl = req.url ?? '';
  let docId: string | null = null;
  try {
    const parsed = new URL(rawUrl, 'http://localhost');
    docId = parsed.searchParams.get('docId');
  } catch {
    // Malformed URL — fall through to the 400 branch below.
  }

  if (!docId || !DOC_ID_PATTERN.test(docId)) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'invalid_doc_id' }));
    return;
  }

  // ---------------------------------------------------------------------
  // 2. Switch the connection into SSE streaming mode. `flushHeaders` is
  //    required so the browser hands the response to the EventSource
  //    polyfill BEFORE the first event arrives.
  // ---------------------------------------------------------------------
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  // Disables Nginx response buffering — harmless when no proxy is in front.
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  // ---------------------------------------------------------------------
  // 3. Subscribe to in-process events for this `docId`. The `closed` guard
  //    prevents double-cleanup races between idle timeout, client
  //    disconnect, and terminal `done`/`error` frames.
  // ---------------------------------------------------------------------
  let closed = false;
  let idleTimer: NodeJS.Timeout | null = null;

  const cleanup = (): void => {
    if (closed) return;
    closed = true;
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
    unsubscribe();
    if (!res.writableEnded) {
      res.end();
    }
  };

  const resetIdleTimer = (): void => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      // Synthetic timeout event — keep the wire format identical to a real
      // SseEvent so the UI doesn't need a special code path.
      if (!closed && !res.writableEnded) {
        const synthetic: SseEvent = {
          kind: 'error',
          docId: docId as string,
          ts: Date.now(),
          detail: 'timeout',
        };
        res.write(`data: ${JSON.stringify(synthetic)}${SSE_FRAME_END}`);
      }
      cleanup();
    }, IDLE_TIMEOUT_MS);
  };

  const unsubscribe = subscribe(docId, (event) => {
    if (closed || res.writableEnded) return;
    res.write(`data: ${JSON.stringify(event)}${SSE_FRAME_END}`);
    resetIdleTimer();
    if (event.kind === 'done' || event.kind === 'error') {
      cleanup();
    }
  });

  // ---------------------------------------------------------------------
  // 4. Lifecycle hooks — both `req.close` (TCP disconnect) and `res.close`
  //    (Node 18+ end-of-write) trigger cleanup. We do NOT call `next()`:
  //    moleculer-web's outer route handler resolves via `res.once('close')`
  //    once we call `res.end()` inside `cleanup`.
  // ---------------------------------------------------------------------
  req.on('close', cleanup);
  res.on('close', cleanup);

  resetIdleTimer();
}
