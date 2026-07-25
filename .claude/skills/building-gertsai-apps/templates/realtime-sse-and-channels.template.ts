// @ts-nocheck — TEMPLATE skeleton: copy into your @gertsai/Moleculer app and adapt the TODOs.
// Imports (@gertsai/*, app-relative paths) resolve only inside a consuming app, not in this repo.
// Some skeletons concatenate several files under "// ===== FILE: <path> =====" banners — split on paste.
// Delete this header once pasted into a real, typed project.
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
