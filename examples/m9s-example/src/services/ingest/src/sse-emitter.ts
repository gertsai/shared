// SPDX-License-Identifier: Apache-2.0
/**
 * Wave 10.B (PRD-019 FR-002) — in-process SSE event emitter.
 *
 * Backend-side pub/sub keyed by `docId`. Each open SSE connection in the API
 * gateway registers a per-doc listener; ingest actions/workers emit lifecycle
 * events that are fanned out to all subscribers of that doc.
 *
 * Why in-memory:
 *   The reference application runs as a single Node process (api gateway +
 *   workers in the same broker). Multi-instance pub/sub (Redis/NATS) is
 *   intentionally out of scope per PRD-019 NFR-6 — it lands with the real-infra
 *   work in Wave 10.C. Swapping the implementation is a single-file change:
 *   replace the `EventEmitter` with a Redis subscriber, keep this module's
 *   `emitSse` / `subscribe` surface identical.
 *
 * Listener cap:
 *   `setMaxListeners(50)` so concurrent uploads don't trigger Node's
 *   memory-leak warning. Each open SSE response is one listener; 50 is
 *   well above the example's expected concurrency (single user, browser tab).
 */
import { EventEmitter } from 'node:events';

/**
 * SSE event kind — discriminates pipeline lifecycle stages reported to the UI.
 * The set is closed (no string fallback) so the UI message map is exhaustive.
 */
export type SseEventKind = 'started' | 'embedding' | 'persisted' | 'done' | 'error';

/**
 * Wire shape of a single SSE event. Serialised to JSON inside an
 * `data: …\n\n` SSE frame; the browser side decodes it back via `JSON.parse`.
 *
 *   - `kind`    discriminator (see `SseEventKind`).
 *   - `docId`   target document — used by the server to route to subscribers.
 *   - `ts`      `Date.now()` at emit time; UI renders a relative timestamp.
 *   - `detail`  optional free-form payload (chunk count, error message). No
 *               PII allowed (logging policy per PRD-019 §Compliance).
 */
export interface SseEvent {
  readonly kind: SseEventKind;
  readonly docId: string;
  readonly ts: number;
  readonly detail?: string;
}

const emitter = new EventEmitter();
// Each open SSE connection registers one listener for its own docId plus one
// for the `'*'` (debug/admin) channel. 50 covers the expected example load.
emitter.setMaxListeners(50);

const WILDCARD_TOPIC = '*' as const;

/**
 * Fan out a lifecycle event to all subscribers of `event.docId` plus the
 * wildcard `'*'` channel. Synchronous — `EventEmitter.emit` runs listeners
 * inline, which is fine for the small (<10) listener counts we expect.
 *
 * @param event lifecycle event; payload is forwarded as-is.
 */
export function emitSse(event: SseEvent): void {
  emitter.emit(event.docId, event);
  emitter.emit(WILDCARD_TOPIC, event);
}

/**
 * Subscribe to events for a specific document. Returns an unsubscribe
 * callback — the caller must invoke it on connection close (client
 * disconnect, idle timeout, or `done`/`error` terminal events) to avoid
 * stranded listeners.
 *
 * @param docId document identifier to listen for
 * @param fn    listener invoked once per event
 * @returns     teardown function — idempotent in practice
 */
export function subscribe(docId: string, fn: (e: SseEvent) => void): () => void {
  emitter.on(docId, fn);
  return () => {
    emitter.off(docId, fn);
  };
}
