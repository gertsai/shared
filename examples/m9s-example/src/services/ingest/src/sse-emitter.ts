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

// EVID-036 audit fix (P1 / U-4): per-docId replay buffer.
//
// The original implementation had a fatal race in inline mode: the ingest
// pipeline (memory adapter, no queue) ran synchronously inside the POST
// handler, emitting `started → embedding → persisted → done` BEFORE the
// client could even read the docId from the response and open EventSource.
// Subscribers registered after the terminal `done` saw nothing and stalled
// to the 30s idle timeout.
//
// Fix: buffer the last REPLAY_LIMIT events per docId. On subscribe, flush
// the buffer synchronously to the new listener so late subscribers can
// observe the lifecycle they missed. Buffers age out after BUFFER_TTL_MS
// (5 min) — long enough for a tab to reconnect, short enough to avoid
// permanent memory growth.
const REPLAY_LIMIT = 8;
const BUFFER_TTL_MS = 5 * 60 * 1_000;

interface DocBuffer {
  events: SseEvent[];
  /** node:timer handle used to evict after TTL; `unref()` so it doesn't
   *  keep the process alive in tests. */
  evictTimer: ReturnType<typeof setTimeout>;
  /** Whether the buffer has seen a terminal `done` / `error` event. Future
   *  subscribers receive the buffered tail and immediately close. */
  terminal: boolean;
}

const buffers = new Map<string, DocBuffer>();

function scheduleEviction(docId: string): ReturnType<typeof setTimeout> {
  const t = setTimeout(() => {
    buffers.delete(docId);
  }, BUFFER_TTL_MS);
  // .unref() keeps Vitest / test runners exit-clean; in real services the
  // event loop has other refs so this is a no-op.
  if (typeof t === 'object' && t !== null && 'unref' in t) {
    (t as { unref(): void }).unref();
  }
  return t;
}

function recordReplayEvent(event: SseEvent): void {
  const existing = buffers.get(event.docId);
  if (existing) {
    existing.events.push(event);
    if (existing.events.length > REPLAY_LIMIT) {
      existing.events.splice(0, existing.events.length - REPLAY_LIMIT);
    }
    if (event.kind === 'done' || event.kind === 'error') {
      existing.terminal = true;
    }
    // Reset the TTL on every new event so an active stream isn't evicted.
    clearTimeout(existing.evictTimer);
    existing.evictTimer = scheduleEviction(event.docId);
    return;
  }
  buffers.set(event.docId, {
    events: [event],
    evictTimer: scheduleEviction(event.docId),
    terminal: event.kind === 'done' || event.kind === 'error',
  });
}

/**
 * Fan out a lifecycle event to all subscribers of `event.docId` plus the
 * wildcard `'*'` channel. Synchronous — `EventEmitter.emit` runs listeners
 * inline, which is fine for the small (<10) listener counts we expect.
 *
 * Also appends to the per-doc replay buffer so a late subscriber can catch
 * up on missed events (EVID-036 P1 fix).
 *
 * @param event lifecycle event; payload is forwarded as-is.
 */
export function emitSse(event: SseEvent): void {
  recordReplayEvent(event);
  emitter.emit(event.docId, event);
  emitter.emit(WILDCARD_TOPIC, event);
}

/**
 * Subscribe to events for a specific document. On call, replays buffered
 * events synchronously (start-before-subscribe race fix, EVID-036 U-4) and
 * then registers a live listener. Returns an unsubscribe callback — the
 * caller must invoke it on connection close (client disconnect, idle
 * timeout, or `done`/`error` terminal events) to avoid stranded listeners.
 *
 * @param docId document identifier to listen for
 * @param fn    listener invoked once per event (replayed + live)
 * @returns     teardown function — idempotent in practice
 */
export function subscribe(docId: string, fn: (e: SseEvent) => void): () => void {
  // Replay first so the listener sees the lifecycle in source order. If the
  // stream already reached a terminal event, the listener still receives it
  // and can close synchronously without registering for live events.
  const buffered = buffers.get(docId);
  if (buffered) {
    for (const event of buffered.events) {
      fn(event);
    }
    if (buffered.terminal) {
      // No live listener registration — the stream is finished.
      return () => {
        /* no-op: nothing registered */
      };
    }
  }

  emitter.on(docId, fn);
  return () => {
    emitter.off(docId, fn);
  };
}

/**
 * Internal — test-only helper to reset replay state between specs.
 * Not exported via the package barrel; callers must import from the file
 * path directly.
 */
export function __resetSseReplayForTests(): void {
  for (const buf of buffers.values()) {
    clearTimeout(buf.evictTimer);
  }
  buffers.clear();
}
