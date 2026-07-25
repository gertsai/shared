# Channels & SSE realtime

## What & why

m9s-example splits realtime into **two distinct mechanisms with different
guarantees** — do not conflate them.

1. **Server-Sent Events (SSE)** push per-document pipeline lifecycle frames
   (`started → embedding → persisted → done | error`) to the browser. The
   endpoint is a **bare `moleculer-web` `AliasFunction` `(req, res)`** (not a
   Moleculer action) backed by an **in-process `EventEmitter` pub/sub keyed by
   `docId`**. It is best-effort, single-process, and carries a **per-`docId`
   replay buffer** so a late `EventSource` subscriber still catches up to the
   already-emitted frames.

2. **`@moleculer/channels` (Redis Streams)** provides **durable, at-least-once,
   cross-service** events (`m9s-example.document.indexed`) published via
   `broker.sendToChannel` and consumed by a **thin channel-only Moleculer
   service**. This is the reliable backbone for backend sagas / side-effects /
   cache invalidation / audit that must not be lost.

The two are independent: **SSE is for live UI feedback** (ephemeral, in the same
process as the browser connection); **channels are for reliable backend
side-effects** (durable, decoupled from the synchronous HTTP response). The
channels middleware is **gated on `REDIS_URL`** — without it the channel service
still registers, but **no consumer groups form** and `broker.sendToChannel` is
undefined, so the producer must guard with `if (broker?.sendToChannel)`.

## How it works in m9s-example

### SSE as a bare moleculer-web AliasFunction (not an action)

- **What** — The SSE endpoint is a plain
  `(req: IncomingMessage, res: ServerResponse) => void` function registered under
  `aliases`, NOT a Moleculer action. It owns the long-lived response: sets
  `text/event-stream` headers, calls `res.flushHeaders()`, writes
  `data: <json>\n\n` frames, and NEVER calls `next()`.
- **Why** — Moleculer's request/response action model resolves a single payload
  and closes the connection — incompatible with a stream that stays open for the
  whole document lifecycle. A bare alias keeps the socket open; moleculer-web's
  outer route Promise resolves via `res.once('close')` when the handler calls
  `res.end()` during cleanup.
- **How** — Give the SSE path its own route object with `use:[]` (skip the
  rate-limit chain), `bodyParsers:false`, `authentication:false`,
  `authorization:false`, and `aliases:{ 'GET ingest': sseHandler }`. The handler
  sets `statusCode 200`, `Content-Type: text/event-stream; charset=utf-8`,
  `Cache-Control: no-cache, no-transform`, `Connection: keep-alive`,
  `X-Accel-Buffering: no`, then `res.flushHeaders?.()`.

### In-process EventEmitter pub/sub keyed by docId with swappable surface

- **What** — A module-singleton `node:events` `EventEmitter` fans out `SseEvent`
  objects keyed by `event.docId` plus a wildcard `'*'` topic. `emitSse(event)` is
  the publish side; `subscribe(docId, tenantId, fn)` returns an **idempotent
  teardown thunk**.
- **Why** — The reference app runs as a single Node process (gateway + workers in
  one broker), so multi-instance pub/sub (Redis/NATS) is intentionally out of
  scope. The emit/subscribe surface is deliberately small and stable so the
  `EventEmitter` can be swapped for a Redis subscriber in a **one-file change**
  without touching the handler.
- **How** — `emitSse` calls `emitter.emit(event.docId, event)` and
  `emitter.emit('*', event)`. `subscribe` registers `emitter.on(docId, fn)` and
  returns `() => emitter.off(docId, fn)` wrapped in a `removed` boolean for
  idempotency. `setMaxListeners(200)` lifts the node memory-leak warning ceiling;
  the real throttle is the per-tenant cap.

### Per-docId replay buffer for late subscribers

- **What** — `emitSse` records the last `REPLAY_LIMIT` (8) events per `docId` in a
  `Map` with a `BUFFER_TTL_MS` (5 min) eviction timer; on `subscribe` the buffer
  is flushed synchronously to the new listener **before** registering for live
  events, and if the buffer is already terminal (`done`/`error`) **NO live
  listener is registered**.
- **Why** — In inline mode the pipeline runs synchronously inside the POST handler
  and emits `started → done` BEFORE the client can read the `docId` from the
  response and open `EventSource`. Without replay, a subscriber that connects
  after the terminal event sees nothing and stalls to the 30s idle timeout
  (EVID-036 P1 fix).
- **How** — `recordReplayEvent` pushes into a
  `DocBuffer { events, evictTimer, terminal }`, trims to `REPLAY_LIMIT`, marks
  terminal on `done`/`error`, and resets the TTL on each event. `scheduleEviction`
  uses `setTimeout(...).unref()` so test runners exit clean. `subscribe` replays
  buffered events via `fn(event)` in source order, then early-returns a no-op
  teardown if terminal.

### Defence-in-depth limits on the unauthenticated stream route

- **What** — Because the SSE route bypasses the api-rlr token bucket (`use:[]`)
  and gateway auth, the handler re-implements every guard inline: `docId`
  allow-list regex (no CRLF), `tenantId` regex, JWT cookie verification,
  `tenantId`-vs-claim cross-check (IDOR), per-IP connection burst limit, and a
  per-tenant concurrent-open-stream cap.
- **Why** — Long-lived streams would be killed when an api-rlr bucket ages out, so
  the token bucket is intentionally skipped — but a skipped throttle means a
  single bad actor could open thousands of `EventSource` connections and exhaust
  event-loop slots, or flip the tenant query param to read another tenant's docs
  (CWE-639 / CWE-770).
- **How** — Reject early: `ipRateLimitExceeded(ip)` → 429 with `Retry-After`;
  invalid `docId`/tenant → 400; missing/invalid `auth_token` cookie → 401 with
  `WWW-Authenticate`; `claims.tenantId !== query tenantId` → 403;
  `acquireTenantSlot(tenantId)` full → 429. Auth uses `verifyToken` (returns
  `JwtClaims | null`) and asserts `claims.kind === 'access'`. The client-supplied
  tenant is a **HINT**; the JWT claim is **authoritative**.

### Durable cross-service events via @moleculer/channels (Redis Streams)

- **What** — A thin Moleculer service declares ONLY a
  `channels: { 'topic': { group, maxRetries, deadLettering: { enabled, queueName }, async handler(this, payload) } }`
  property — no actions, no business lifecycle. Producers publish with
  `broker.sendToChannel(topic, payload)`.
- **Why** — SSE is best-effort and single-process; channels give at-least-once
  durable delivery, consumer-group load balancing across instances, NACK+retry,
  and a dead-letter queue — the correct tool for backend saga steps / cache
  invalidation / audit that must not be lost, decoupled from the synchronous HTTP
  response.
- **How** — Declare the channel service and register it **unconditionally** in
  `ApiController.Start({ services })`. Gate `ChannelsMiddleware` on `REDIS_URL` in
  `moleculer.config.ts` (it's the **DEFAULT** export of `@moleculer/channels`).
  `group` decides fan-out: same group = load-balanced; new group = independent
  full copy. The handler **MUST be idempotent** (check a processed-key in Redis
  with TTL > `maxRetries × interval`). Throwing in the handler → NACK → retry up
  to `maxRetries` → DLQ.

### Dual SSE emission paths (inline vs queued) producing the same frame sequence

- **What** — Both the inline action path and the BullMQ worker path emit the
  identical `started → embedding → persisted → done` (or terminal `error`)
  `SseEvent` sequence so the UI has one exhaustive message map regardless of
  execution mode.
- **Why** — `QUEUE_ENABLED` decides whether ingest runs synchronously in the
  request or is dispatched to a worker. Pre-fix, queue mode only emitted `started`
  from the action and the worker completed silently, so every queued ingest looked
  like a phantom 30s timeout to the UI (EVID-053 H-2).
- **How** — The action emits `started` (after auth), then for inline runs the
  4-frame sequence around `useCase.execute`; for queued it emits only `started`
  and the worker emits `embedding` (before useCase), `persisted` (with
  `detail=chunkCount=N`), `done` (after channel publish), or `error` in catch
  BEFORE the BullMQ rethrow. The worker re-reads a `_destroyed` flag after each
  await to abort cleanly mid-shutdown.

## Template

```ts
// SPDX-License-Identifier: Apache-2.0
// ============================================================================
// PART 1 — In-process SSE pub/sub (adapt from src/services/ingest/src/sse-emitter.ts)
// ============================================================================
import { EventEmitter } from 'node:events';

// Closed discriminator set — keep the UI message map exhaustive (no string fallback).
export type SseEventKind = 'started' | 'embedding' | 'persisted' | 'done' | 'error'; // TODO: your stages
export interface SseEvent {
  readonly kind: SseEventKind;
  readonly docId: string; // TODO: your routing key (entity id)
  readonly ts: number;
  readonly detail?: string; // NO PII — this is logged/streamed
}

const emitter = new EventEmitter();
emitter.setMaxListeners(200); // node-level safety net; real throttle is the per-tenant cap
const WILDCARD_TOPIC = '*' as const;

const MAX_SUBSCRIBERS_PER_TENANT = 10; // TODO: tune
const REPLAY_LIMIT = 8;
const BUFFER_TTL_MS = 5 * 60 * 1_000;

const subscribers = new Map<string, Set<string>>(); // tenantId -> Set<docId>
interface DocBuffer { events: SseEvent[]; evictTimer: ReturnType<typeof setTimeout>; terminal: boolean; }
const buffers = new Map<string, DocBuffer>();

function scheduleEviction(docId: string): ReturnType<typeof setTimeout> {
  const t = setTimeout(() => buffers.delete(docId), BUFFER_TTL_MS);
  if (typeof t === 'object' && t !== null && 'unref' in t) (t as { unref(): void }).unref();
  return t;
}
function recordReplayEvent(event: SseEvent): void {
  const existing = buffers.get(event.docId);
  const terminal = event.kind === 'done' || event.kind === 'error';
  if (existing) {
    existing.events.push(event);
    if (existing.events.length > REPLAY_LIMIT) existing.events.splice(0, existing.events.length - REPLAY_LIMIT);
    if (terminal) existing.terminal = true;
    clearTimeout(existing.evictTimer);
    existing.evictTimer = scheduleEviction(event.docId);
    return;
  }
  buffers.set(event.docId, { events: [event], evictTimer: scheduleEviction(event.docId), terminal });
}

/** Publish side — call from actions AND workers so both modes emit the same sequence. */
export function emitSse(event: SseEvent): void {
  recordReplayEvent(event);
  emitter.emit(event.docId, event);
  emitter.emit(WILDCARD_TOPIC, event);
}

/** Subscribe: enforce per-tenant cap -> replay buffer -> register live listener. Teardown is idempotent. */
export function subscribe(docId: string, tenantId: string, fn: (e: SseEvent) => void): () => void {
  const tenantSet = subscribers.get(tenantId);
  if ((tenantSet?.size ?? 0) >= MAX_SUBSCRIBERS_PER_TENANT) {
    fn({ kind: 'error', docId, ts: Date.now(), detail: 'tenant subscriber cap exceeded' });
    return () => {/* no-op: never registered */};
  }
  const buffered = buffers.get(docId);
  if (buffered) {
    for (const e of buffered.events) fn(e);
    if (buffered.terminal) return () => {/* no-op: stream finished */};
  }
  const set = tenantSet ?? new Set<string>();
  set.add(docId);
  if (!tenantSet) subscribers.set(tenantId, set);
  emitter.on(docId, fn);
  let removed = false;
  return () => {
    if (removed) return;
    removed = true;
    emitter.off(docId, fn);
    const s = subscribers.get(tenantId);
    if (s) { s.delete(docId); if (s.size === 0) subscribers.delete(tenantId); }
  };
}

// ============================================================================
// PART 2 — SSE handler (adapt from src/mol-services/sse-ingest.handler.ts)
// Register in the gateway under a route with use:[], bodyParsers:false,
// authentication:false, authorization:false, aliases:{ 'GET stream': handler }.
// ============================================================================
import type { IncomingMessage, ServerResponse } from 'node:http';
import { verifyToken } from '../services/auth/src/jwt'; // TODO: your JWT verifier -> claims | null

const DOC_ID_PATTERN = /^[a-z0-9-]{8,64}$/;      // no CRLF (header-injection)
const TENANT_ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;
const DEFAULT_TENANT_ID = 'tenant-acme';          // TODO
const IDLE_TIMEOUT_MS = 30_000;
const SSE_FRAME_END = '\n\n';

// In-handler rate limits (the route bypasses api-rlr because long streams age out of buckets).
const RATE_LIMIT_WINDOW_MS = Number(process.env.SSE_RATE_LIMIT_WINDOW_MS ?? 60_000);
const RATE_LIMIT_IP_BURST = Number(process.env.SSE_RATE_LIMIT_IP_BURST ?? 10);
const RATE_LIMIT_TENANT_OPEN = Number(process.env.SSE_RATE_LIMIT_TENANT_OPEN ?? 50);
const ipAttempts = new Map<string, { timestamps: number[] }>();
const tenantOpen = new Map<string, number>();
// TODO: copy clientIp(), ipRateLimitExceeded(), acquireTenantSlot(), releaseTenantSlot(), readCookie() verbatim.

export function sseAliasHandler(req: IncomingMessage, res: ServerResponse): void {
  // 0. per-IP burst guard (cheap Map lookup before any auth work)
  // if (ipRateLimitExceeded(clientIp(req))) { res.statusCode = 429; ... return; }

  // 1. parse + validate docId and tenant from the query string
  let docId: string | null = null, rawTenant: string | null = null;
  try {
    const parsed = new URL(req.url ?? '', 'http://localhost');
    docId = parsed.searchParams.get('docId');
    rawTenant = parsed.searchParams.get('tenantId') ?? parsed.searchParams.get('tenant');
  } catch { /* fall through to 400 */ }
  if (!docId || !DOC_ID_PATTERN.test(docId)) { res.statusCode = 400; res.end(JSON.stringify({ error: 'invalid_doc_id' })); return; }
  // header fallback + TENANT_ID_PATTERN validation -> tenantId (else 400 invalid_tenant_id)
  const tenantId = rawTenant && TENANT_ID_PATTERN.test(rawTenant) ? rawTenant : DEFAULT_TENANT_ID; // TODO: full branch

  // 2. authenticate via httpOnly cookie + cross-check tenant (IDOR guard)
  const token = /* readCookie(req, 'auth_token') */ null as string | null;
  if (token === null) { res.statusCode = 401; res.setHeader('WWW-Authenticate', 'Bearer'); res.end(JSON.stringify({ error: 'authentication_required' })); return; }
  const claims = verifyToken(token);
  if (claims === null || claims.kind !== 'access') { res.statusCode = 401; res.end(JSON.stringify({ error: 'invalid_token' })); return; }
  if (claims.tenantId !== tenantId) { res.statusCode = 403; res.end(JSON.stringify({ error: 'tenant_scope_violation' })); return; }

  // 3. claim a per-tenant open-stream slot (release in cleanup)
  // if (!acquireTenantSlot(tenantId)) { res.statusCode = 429; ... return; }

  // 4. switch into SSE streaming mode — flushHeaders BEFORE first event
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering
  res.flushHeaders?.();

  // 5. subscribe + relay frames; cleanup on terminal frame / disconnect / idle
  let closed = false;
  let idleTimer: NodeJS.Timeout | null = null;
  const cleanup = (): void => {
    if (closed) return; closed = true;
    if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
    unsubscribe();
    // releaseTenantSlotOnce();
    if (!res.writableEnded) res.end();
  };
  const resetIdleTimer = (): void => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (!closed && !res.writableEnded) {
        const synthetic: SseEvent = { kind: 'error', docId: docId as string, ts: Date.now(), detail: 'timeout' };
        res.write(`data: ${JSON.stringify(synthetic)}${SSE_FRAME_END}`);
      }
      cleanup();
    }, IDLE_TIMEOUT_MS);
  };
  const unsubscribe = subscribe(docId, tenantId, (event) => {
    if (closed || res.writableEnded) return;
    res.write(`data: ${JSON.stringify(event)}${SSE_FRAME_END}`);
    resetIdleTimer();
    if (event.kind === 'done' || event.kind === 'error') cleanup();
  });
  req.on('close', cleanup);
  res.on('close', cleanup); // NOTE: never call next()
  resetIdleTimer();
}

// ============================================================================
// PART 3 — Durable channel consumer (adapt from src/services/channels/document-events.channel.ts)
// ============================================================================
import type { ServiceSchema, Service } from 'moleculer';

export const DOCUMENT_INDEXED_CHANNEL = 'myapp.document.indexed' as const; // TODO: <app>.<entity>.<event>
export interface DocumentIndexedEvent { docId: string; chunkCount: number; userId: string; indexedAt: number; jobId?: string; }

const ChannelService: ServiceSchema = {
  name: 'channel-document-events',
  channels: {
    [DOCUMENT_INDEXED_CHANNEL]: {
      group: 'document-events-readers', // same group = load-balanced; new group = independent fan-out copy
      maxRetries: 5,
      deadLettering: { enabled: true, queueName: 'myapp:document.indexed:dlq' },
      async handler(this: Service, payload: DocumentIndexedEvent) {
        // AT-LEAST-ONCE: this handler MUST be idempotent. Throwing -> NACK -> retry -> DLQ.
        if (!payload || typeof payload.docId !== 'string') {
          throw new Error(`[document.indexed] invalid payload: ${JSON.stringify(payload)}`);
        }
        // TODO: idempotent side-effect (check processed-key in Redis w/ TTL > maxRetries*interval,
        //       publish next saga step via this.broker.sendToChannel(...), bump a metric, etc.)
        this.logger?.info(`[channel:document.indexed] doc=${payload.docId} chunks=${payload.chunkCount}`);
      },
    },
  },
};
export default ChannelService;

// ============================================================================
// PART 4 — Producer (adapt from worker queues/ingest-chunk.worker.ts)
// Publish the durable event; guard on sendToChannel so it no-ops without Redis.
// ============================================================================
// const broker = this.broker as unknown as {
//   sendToChannel?: (topic: string, payload: Record<string, unknown>) => Promise<void>;
// };
// if (broker?.sendToChannel) {
//   await broker.sendToChannel(DOCUMENT_INDEXED_CHANNEL, {
//     docId, chunkCount, userId, indexedAt: Date.now(), jobId: String(job.id ?? ''),
//   });
// }

// ============================================================================
// PART 5 — Channels middleware registration (adapt from moleculer.config.ts)
// ============================================================================
// import { Middleware as ChannelsMiddleware } from '@moleculer/channels'; // DEFAULT export
// if (config.REDIS_URL) {                 // gate on Redis — without it handlers register but never fire
//   middlewares.push(
//     ChannelsMiddleware({
//       adapter: {
//         type: 'Redis',
//         options: {
//           redis: parseRedisUrlForChannels(config.REDIS_URL), // honour password/db/TLS
//           maxRetries: 3,
//           deadLettering: { enabled: true, queueName: 'myapp:dlq' },
//         },
//       },
//     } as unknown as Parameters<typeof ChannelsMiddleware>[0]) as unknown as BrokerMiddleware,
//   );
// }
// Register the channel service unconditionally: ApiController.Start({ services: [ApiService, ChannelService] });
```

## Best practices

- Keep `SseEventKind` a closed union (no string fallback) so the UI message map is
  exhaustive; emit the SAME frame sequence
  (`started → embedding → persisted → done | error`) from BOTH the inline action
  path and the queued worker path so the consumer has one code path regardless of
  execution mode.
- Always emit a terminal frame (`done` or `error`). The handler closes the stream
  on `done`/`error`; without it the client dangles until the 30s idle timeout. In
  the producer's catch block, emit the `error` frame BEFORE rethrowing/mapping the
  domain error so the wire frame fires even if the framework intercepts the throw.
- Buffer the last N events per `docId` and replay them synchronously on
  `subscribe` — inline pipelines finish before the browser can open `EventSource`,
  so late subscribers must catch up or they stall (EVID-036 P1).
- Register the SSE alias as a bare moleculer-web `(req,res)` `AliasFunction` on its
  OWN route with `use:[]` (skip the api-rlr token bucket), `bodyParsers:false`,
  `authentication:false`, `authorization:false`; never call `next()` —
  moleculer-web resolves via `res.once('close')` after you call `res.end()`.
- Set the full SSE header set and call `res.flushHeaders?.()` before any event so
  the browser switches into streaming mode: `Content-Type: text/event-stream;
  charset=utf-8`, `Cache-Control: no-cache, no-transform`, `Connection:
  keep-alive`, `X-Accel-Buffering: no` (disables nginx buffering).
- Because the SSE route bypasses gateway auth and the token bucket, re-implement
  guards IN the handler: `docId`/`tenantId` allow-list regex (reject CRLF), JWT
  cookie verification, `tenantId`-vs-claim cross-check (IDOR), per-IP connection
  burst, and a per-tenant concurrent-open-stream cap. Treat the client-supplied
  tenant as a hint; the JWT claim is authoritative.
- Make every channel handler idempotent — `@moleculer/channels` is at-least-once,
  never exactly-once. Use a processed-key in Redis with TTL greater than
  `maxRetries × retry interval`. Throwing in the handler is the correct NACK
  signal: it retries up to `maxRetries` then routes to the DLQ.
- Keep channel services thin: ONLY a `channels` property, no actions and no
  business lifecycle — the durable handler is a side-effect sink for events
  produced elsewhere.
- Choose channel group names deliberately: the same group across instances
  load-balances messages (each message to exactly one consumer); a new group gets
  an independent full copy of every message (fan-out).
- Always enable `deadLettering` with a named queue on durable channels so poison
  messages are inspectable instead of lost or infinitely retried.
- Make all teardown idempotent and guarded by a `closed` boolean: idle timeout,
  client disconnect (req/res `'close'`), and terminal frames can all race to clean
  up the same connection. Release any acquired tenant slot exactly once.
- Use `setTimeout(...).unref()` for buffer-eviction and idle timers so Vitest /
  test runners exit cleanly; expose test-only reset helpers (e.g.
  `__resetSseReplayForTests`) imported by file path, not via the package barrel.

## Pitfalls

- The in-process `EventEmitter` pub/sub is SINGLE-PROCESS ONLY. If you scale the
  gateway horizontally, a frame emitted on instance A is invisible to a subscriber
  connected to instance B. The emit/subscribe surface is intentionally swappable
  for a Redis/NATS subscriber — do that before multi-instance deployment.
  (Channels, by contrast, ARE multi-instance via Redis Streams.)
- Forgetting to emit a terminal `done`/`error` frame leaves every stream hanging
  for the full `IDLE_TIMEOUT_MS` (30s). This is exactly the queue-mode bug
  (EVID-053 H-2) where the worker completed silently and every queued ingest
  looked like a phantom timeout.
- `@moleculer/channels` exports the middleware as the DEFAULT export
  (`import { Middleware as ChannelsMiddleware } from '@moleculer/channels'`),
  whereas `@moleculer/workflows` uses a NAMED `Middleware` export — easy to get
  the import asymmetry wrong.
- Channel handlers fire ONLY when the `ChannelsMiddleware` is loaded, which is
  gated on `REDIS_URL`. Without Redis the channel service still registers (no
  error) but no consumer groups form and `broker.sendToChannel` is undefined — so
  the producer must guard with `if (broker?.sendToChannel)`. Silent no-op is by
  design but surprising in local dev.
- `@moleculer/channels` declares its adapter/`deadLettering` options as an
  AMQP-skewed intersection type (`exchangeName`, `exchangeOptions`,
  `queueOptions`). The Redis adapter accepts the simpler
  `{ redis, maxRetries, deadLettering: { enabled, queueName } }` shape at RUNTIME
  but the types reject it — m9s casts through
  `as unknown as Parameters<typeof ChannelsMiddleware>[0]`, isolated to one named
  local for auditability.
- Parsing `REDIS_URL` by hand/regex silently drops the password and downgrades
  `rediss://` (TLS) to plaintext. m9s uses `new URL()`
  (`parseRedisUrlForChannels`) to honour userinfo, db index, and the TLS scheme —
  copy that, do not regex.
- The SSE route MUST skip the api-rlr token bucket (`use:[]`); otherwise
  long-lived streams get killed when their bucket ages out. But skipping it
  removes ALL rate limiting, so you MUST add in-handler per-IP and per-tenant caps
  or a single client can exhaust event-loop slots (CWE-770).
- Accepting the client-supplied `tenantId` query param verbatim is an IDOR
  (CWE-639): a session in tenant A can subscribe to tenant B's docs by flipping
  the param. You must cross-check it against the `tenantId` claim inside the
  verified JWT cookie and reject mismatches with 403.
- The per-tenant SUBSCRIBER cap in `sse-emitter.ts` (keyed by `tenantId × docId`
  Set) is DISTINCT from the per-tenant OPEN-STREAM cap in the handler (counts
  every live HTTP connection). They are not redundant: an empty-doc or
  replayed-and-closed listener registers no emitter listener but still holds a
  socket, so only the handler-side cap counts it.
- `EventSource` does not send credentials by default — the cookie-based auth only
  works if the browser client sets `withCredentials:true`, and the gateway CORS
  config must allow credentials. A handler that reads `auth_token` will 401 every
  stream if the client omits this.
- BullMQ worker handlers must be non-arrow functions because api-core binds the
  Moleculer service instance to `this` (`handler.call(service, ctx)`); an arrow
  function loses access to `this.broker` / `this.useCase` / `this.logger`.
- Replay buffers grow unbounded if you don't evict — m9s caps to `REPLAY_LIMIT`
  events and a 5-min TTL per `docId`. Skipping eviction leaks memory; not
  resetting the TTL on new events evicts active streams mid-flight.

## Canonical files

- [`examples/m9s-example/src/mol-services/sse-ingest.handler.ts:208`](../../../examples/m9s-example/src/mol-services/sse-ingest.handler.ts) —
  SSE endpoint. moleculer-web `AliasFunction` `(req,res)` for `GET
  /api/stream/ingest`: validates `docId`, authenticates `auth_token` JWT cookie,
  cross-checks `tenantId` (IDOR guard), sets SSE headers + `flushHeaders`,
  subscribes to the in-process emitter, relays `data: <json>\n\n` frames, handles
  idle timeout / disconnect / terminal-frame cleanup, and applies per-IP burst +
  per-tenant open-stream rate limits.
- [`examples/m9s-example/src/services/ingest/src/sse-emitter.ts:153`](../../../examples/m9s-example/src/services/ingest/src/sse-emitter.ts) —
  In-process SSE pub/sub. `emitSse(event)` fans out via `node:events`
  `EventEmitter` keyed by `docId` (+ wildcard), records a per-`docId` replay buffer
  (`REPLAY_LIMIT=8`, `BUFFER_TTL_MS=5min`); `subscribe(docId, tenantId, fn)`
  enforces a per-tenant subscriber cap (`MAX_SUBSCRIBERS_PER_TENANT=10`), replays
  buffered events synchronously, registers a live listener, and returns an
  idempotent teardown thunk.
- [`examples/m9s-example/src/services/channels/document-events.channel.ts:49`](../../../examples/m9s-example/src/services/channels/document-events.channel.ts) —
  Durable channel consumer. Thin Moleculer `ServiceSchema` with ONLY a
  `channels: { 'topic': { group, maxRetries, deadLettering, async handler } }`
  property. Subscribes to `m9s-example.document.indexed` with consumer-group load
  balancing + DLQ. Handler is idempotency-critical (at-least-once).
- [`examples/m9s-example/src/services/ingest/src/queues/ingest-chunk.worker.ts:132`](../../../examples/m9s-example/src/services/ingest/src/queues/ingest-chunk.worker.ts) —
  Producer. BullMQ worker emits the queue-mode SSE frame sequence (`emitSse`
  `embedding`/`persisted`/`done`/`error`) AND publishes the durable channel event
  via `broker.sendToChannel(DOCUMENT_INDEXED_CHANNEL, {...})` guarded by
  `if (broker?.sendToChannel)` so it no-ops without Redis.
- [`examples/m9s-example/src/services/ingest/src/actions/ingest-document.action.ts:128`](../../../examples/m9s-example/src/services/ingest/src/actions/ingest-document.action.ts) —
  Producer (inline path). Synthesises the `started`/`embedding`/`persisted`/`done`
  frames via `emitSse` around the synchronous useCase boundary; emits `started`
  only after auth assertions pass; emits terminal `error` in catch before mapping
  the domain error to transport.
- [`examples/m9s-example/src/mol-services/api.service.ts:212`](../../../examples/m9s-example/src/mol-services/api.service.ts) —
  Gateway wiring. Registers the SSE alias as a separate moleculer-web route with
  `path:'/api/stream'`, `use:[]` (bypass api-rlr token bucket),
  `bodyParsers:false`, `authentication/authorization:false` (handler does its own
  JWT auth), `aliases: { 'GET ingest': sseIngestAliasHandler }`.
- [`examples/m9s-example/moleculer.config.ts:189`](../../../examples/m9s-example/moleculer.config.ts) —
  Channels middleware registration. Gated on `config.REDIS_URL`; constructs
  `ChannelsMiddleware({ adapter: { type:'Redis', options:{ redis, maxRetries, deadLettering } } })`
  (DEFAULT export from `@moleculer/channels`) and pushes it into broker
  middlewares. Includes `parseRedisUrlForChannels()` to honour password/db/TLS.
- [`examples/m9s-example/src/index.ts:167`](../../../examples/m9s-example/src/index.ts) —
  Service registration. `DocumentEventsChannelService` is loaded unconditionally
  in `ApiController.Start({ services: [...] })`; comment notes the channels
  middleware (gated on `REDIS_URL`) is what actually activates the handlers.

## @gertsai packages used

- `@gertsai/api-core/moleculer` — `QueueHandlerCtx` type for the BullMQ producer;
  `ApiController.Start` to register the channel service; `registerWorker` for the
  producer worker.
- `moleculer` — `ServiceSchema` and `Service` types for the channel service;
  `broker.sendToChannel` publish surface; moleculer-web `AliasFunction` route for
  the SSE endpoint.
- `@moleculer/channels` — DEFAULT export `Middleware` → `ChannelsMiddleware`;
  Redis Streams adapter providing at-least-once delivery, consumer groups,
  NACK+retry, DLQ — registered in `moleculer.config.ts` gated on `REDIS_URL`.
- `@moleculer/workflows` — named `Middleware` export, registered alongside
  channels in the same `REDIS_URL` gate — adjacent realtime/durable infra.
- `node:events` — `EventEmitter` — the in-process SSE pub/sub backbone keyed by
  `docId`.
- `node:http` — `IncomingMessage` / `ServerResponse` — the bare SSE
  `AliasFunction` signature.
- `@gertsai-examples/m9s-example-api-types` — `JwtClaims` type returned by
  `verifyToken` and used for the SSE tenant cross-check.
