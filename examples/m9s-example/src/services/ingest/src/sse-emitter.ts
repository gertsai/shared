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
 * Listener cap (Wave 11.A FR-004):
 *   `setMaxListeners(200)` is a node-level safety net against the
 *   memory-leak warning when many tenants stream concurrently. The real
 *   throttle is the **per-tenant subscriber cap** below
 *   (`MAX_SUBSCRIBERS_PER_TENANT = 10`), which prevents a single tenant
 *   from monopolising stream slots / RAM. Exceeding the cap synchronously
 *   delivers a sentinel `error` frame so the handler can close cleanly —
 *   no listener is registered, so cap-exceeded connections cannot
 *   contribute to listener growth.
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
// Wave 11.A FR-004: lift the node-level cap to 200 since the *real* throttle
// is the per-tenant subscriber cap below. 200 leaves headroom for ~20 tenants
// at the cap (10 each) plus the wildcard channel without warnings.
emitter.setMaxListeners(200);

const WILDCARD_TOPIC = '*' as const;

// =============================================================================
// Wave 11.A FR-004 — per-tenant subscriber cap.
//
// One in-process Map keyed by tenantId; each value is the Set of docIds that
// tenant is currently subscribed to. A subscribe attempt that would push
// `subscribers.get(tenantId).size` past MAX_SUBSCRIBERS_PER_TENANT does NOT
// register a listener — instead it returns an `unsubscribe` thunk that
// synchronously delivers a sentinel `error` event to the caller so the SSE
// handler can write the frame + close the response.
//
// Rationale: prevents a single misbehaving tenant from holding 1k+ open SSE
// connections (one per browser tab × N attackers) and exhausting RAM /
// listener slots. The cap is intentionally generous (10 per tenant) — the
// realistic browser concurrency is 1-2 tabs per user.
// =============================================================================

const MAX_SUBSCRIBERS_PER_TENANT = 10;

const subscribers = new Map<string, Set<string>>();

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
 * Subscribe to events for a specific document. On call:
 *   1. Enforces the per-tenant subscriber cap (Wave 11.A FR-004): if the
 *      tenant has already reached `MAX_SUBSCRIBERS_PER_TENANT` live docs,
 *      the listener is NOT registered and the returned thunk synchronously
 *      delivers a sentinel `error` event with `detail: 'tenant subscriber
 *      cap exceeded'`. The caller (SSE handler) is expected to write the
 *      frame + close the response.
 *   2. Replays buffered events synchronously so late subscribers see the
 *      lifecycle in source order (EVID-036 U-4). If the buffer is already
 *      terminal (`done` / `error`), no live listener is registered.
 *   3. Otherwise registers a live `EventEmitter` listener and records the
 *      docId in the tenant's Set.
 *
 * The returned teardown is idempotent: it removes BOTH the listener AND
 * the docId from the tenant's Set, and drops the tenant from the registry
 * when its Set becomes empty (avoids unbounded Map growth).
 *
 * @param docId    document identifier to listen for
 * @param tenantId resolved tenant identifier (the SSE handler validates
 *                 the inbound shape — this function trusts the caller)
 * @param fn       listener invoked once per event (replayed + live, or
 *                 sentinel-only on cap-exceeded)
 * @returns        teardown function — idempotent in practice
 */
export function subscribe(
  docId: string,
  tenantId: string,
  fn: (e: SseEvent) => void,
): () => void {
  // -------------------------------------------------------------------------
  // 1. Per-tenant cap (Wave 11.A FR-004). Computed before the replay so a
  //    cap-exceeded caller sees ONLY the sentinel, never partial replay
  //    state from another browser tab.
  // -------------------------------------------------------------------------
  const tenantSet = subscribers.get(tenantId);
  const currentSize = tenantSet?.size ?? 0;
  if (currentSize >= MAX_SUBSCRIBERS_PER_TENANT) {
    // Synchronously deliver the sentinel; caller will end the response.
    // Returned thunk is a no-op (nothing to unregister).
    fn({
      kind: 'error',
      docId,
      ts: Date.now(),
      detail: 'tenant subscriber cap exceeded',
    });
    return () => {
      /* no-op: cap-exceeded subscriber never registered a listener */
    };
  }

  // -------------------------------------------------------------------------
  // 2. Replay buffered events first so the listener sees the lifecycle in
  //    source order. If the stream already reached a terminal event, the
  //    listener still receives it and can close synchronously without
  //    registering for live events.
  // -------------------------------------------------------------------------
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

  // -------------------------------------------------------------------------
  // 3. Register the live listener AND record this docId against the tenant.
  // -------------------------------------------------------------------------
  const updatedSet = tenantSet ?? new Set<string>();
  updatedSet.add(docId);
  if (!tenantSet) {
    subscribers.set(tenantId, updatedSet);
  }
  emitter.on(docId, fn);

  let removed = false;
  return () => {
    if (removed) return;
    removed = true;
    emitter.off(docId, fn);
    const set = subscribers.get(tenantId);
    if (set) {
      set.delete(docId);
      if (set.size === 0) {
        subscribers.delete(tenantId);
      }
    }
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

/**
 * Internal — test-only helper to reset the per-tenant subscriber registry
 * (Wave 11.A FR-004). Removes every recorded tenantId/docId pair. Does NOT
 * remove live EventEmitter listeners — callers should additionally invoke
 * the teardown thunks they captured from `subscribe()` to fully detach.
 */
export function __resetSseSubscribersForTests(): void {
  subscribers.clear();
}
