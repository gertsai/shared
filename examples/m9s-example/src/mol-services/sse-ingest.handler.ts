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
 *   2. Wave 12.E-fix-2 Phase 2 (EVID-053 H-14 / CWE-639) — extracts the
 *      `auth_token` cookie, verifies it as a JWT access token, and
 *      cross-checks the claimed tenantId against the client-supplied
 *      `tenantId` query param. Unauthenticated streams are rejected with
 *      401; tenant mismatches with 403. Closes the IDOR vector where a
 *      session in tenant A could subscribe to docs under tenant B by
 *      flipping the query param.
 *   3. Sets the standard SSE headers + flushes them immediately so the
 *      browser switches into streaming mode before any event fires.
 *   4. Subscribes to in-memory pub/sub (`@/services/ingest/src/sse-emitter`),
 *      relaying every event as a single `data: <json>\n\n` frame.
 *   5. Closes on terminal `done` / `error` events, on client disconnect,
 *      and on a 30s idle-timeout (synthetic `error` with `detail: 'timeout'`).
 *   6. Never calls `next()` — moleculer-web's outer Promise resolves via
 *      `res.once('close')` when the connection ends. See alias.js + the
 *      route handler in moleculer-web/src/index.js (~line 425).
 *
 * Logging discipline: only `docId` + (optional) request id is logged; no
 * tenant ids, user ids, or PII per PRD-019 §Compliance.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';

import { verifyToken } from '../services/auth/src/jwt';
import { subscribe, type SseEvent } from '../services/ingest/src/sse-emitter';

/**
 * Permissible `docId` shape: lowercase alphanumerics + dashes, 8..64 chars.
 * Locks out CR/LF (header injection), quotes, semicolons, slashes, etc.
 * Matches the upload action's docId convention (UUID v4 lower-cased or
 * stable identifier the caller supplied).
 */
const DOC_ID_PATTERN = /^[a-z0-9-]{8,64}$/;

/**
 * Wave 11.A FR-004 — tenant id shape. Matches the project-wide convention
 * used by the RLR bucketKeyResolver in `api.service.ts` and the Wave 5
 * tenant-resolver middlewares: alphanumerics + dash/underscore, 1..64 chars.
 * Reject empty / oversized / CRLF-bearing values before passing the string
 * to the per-tenant subscriber registry (defence-in-depth even though the
 * registry is in-process).
 */
const TENANT_ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

/**
 * Project-default tenant id (matches `project.config.ts` TENANT_ID). Used as
 * a fallback when the SSE caller supplies neither a `tenant` query param
 * nor an `X-Tenant-ID` header — same UX as the single-tenant example flows.
 */
const DEFAULT_TENANT_ID = 'tenant-acme';

/**
 * Idle timeout — if no event has fired for this long, the server emits a
 * synthetic `error` frame and closes the stream. Prevents indefinitely-open
 * sockets from leaking when a producer crashes mid-pipeline.
 */
const IDLE_TIMEOUT_MS = 30_000;

/** SSE frame terminator — two LFs per the spec. */
const SSE_FRAME_END = '\n\n';

// ---------------------------------------------------------------------------
// Wave 12.E-fix-2 Phase 2 (EVID-053 H-15 / CWE-770) — in-process SSE rate
// limit. The route-level `use: []` chain skips the api-rlr token bucket
// because long-lived streams would otherwise be closed when their bucket
// ages out. We still need SOME throttle so a single bad actor (or a buggy
// client in a retry loop) cannot open thousands of EventSource connections
// and exhaust event-loop slots. Two complementary caps:
//
//   - Per-IP: max RATE_LIMIT_IP_BURST connection ATTEMPTS within
//     RATE_LIMIT_WINDOW_MS ms. Counts every request, not just successes.
//   - Per-tenant: max RATE_LIMIT_TENANT_OPEN concurrent OPEN streams
//     across the whole process for one tenant. Tracked via a Map updated
//     in the cleanup path so disconnects free a slot.
//
// Defaults intentionally permissive — generous browser concurrency (1-2
// tabs × Hot Module Reload) but hard ceilings on weaponised storms.
// Override via env if the demo needs different bounds.
// ---------------------------------------------------------------------------

const RATE_LIMIT_WINDOW_MS = Number(process.env.SSE_RATE_LIMIT_WINDOW_MS ?? 60_000);
const RATE_LIMIT_IP_BURST = Number(process.env.SSE_RATE_LIMIT_IP_BURST ?? 10);
const RATE_LIMIT_TENANT_OPEN = Number(process.env.SSE_RATE_LIMIT_TENANT_OPEN ?? 50);

interface IpAttempts {
  /** Monotonic timestamps of recent connect attempts, oldest first. */
  timestamps: number[];
}

const ipAttempts = new Map<string, IpAttempts>();
const tenantOpen = new Map<string, number>();

/**
 * Pull a connecting client IP off the request — prefers the leftmost
 * `X-Forwarded-For` value (set by the reverse proxy that strips inbound
 * `X-Tenant-ID`, see wave5-middlewares.ts), then falls back to the raw
 * socket address. Returns 'unknown' if nothing usable is present.
 */
function clientIp(req: IncomingMessage): string {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length > 0) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  } else if (Array.isArray(xff) && xff.length > 0) {
    const first = xff[0]?.split(',')[0]?.trim();
    if (first) return first;
  }
  const remote = req.socket?.remoteAddress;
  if (typeof remote === 'string' && remote.length > 0) return remote;
  return 'unknown';
}

/**
 * Returns `true` when the IP has exceeded `RATE_LIMIT_IP_BURST` attempts
 * within the rolling window. Records the current attempt regardless so
 * back-to-back retries inside the window still count toward the cap.
 */
function ipRateLimitExceeded(ip: string): boolean {
  const now = Date.now();
  const entry = ipAttempts.get(ip);
  if (entry === undefined) {
    ipAttempts.set(ip, { timestamps: [now] });
    return false;
  }
  // Drop expired timestamps. Window is short and the array stays small
  // (capped implicitly by the burst limit) so an O(n) splice is cheap.
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  while (entry.timestamps.length > 0 && (entry.timestamps[0] ?? 0) < cutoff) {
    entry.timestamps.shift();
  }
  entry.timestamps.push(now);
  // Periodic eviction so the Map doesn't grow without bound — drop the
  // entry once the window has cleared and there's nothing left to count.
  // Cheap heuristic: every ~100 attempts, sweep.
  if (entry.timestamps.length === 1 && ipAttempts.size > 1_000) {
    for (const [k, v] of ipAttempts) {
      if (v.timestamps.length === 0 || (v.timestamps[0] ?? 0) < cutoff) {
        ipAttempts.delete(k);
      }
    }
  }
  return entry.timestamps.length > RATE_LIMIT_IP_BURST;
}

/**
 * Try to claim a tenant open-stream slot. Returns `true` on success (the
 * caller MUST call `releaseTenantSlot(tenantId)` in the cleanup path); on
 * failure the cap is already at capacity for that tenant.
 */
function acquireTenantSlot(tenantId: string): boolean {
  const current = tenantOpen.get(tenantId) ?? 0;
  if (current >= RATE_LIMIT_TENANT_OPEN) return false;
  tenantOpen.set(tenantId, current + 1);
  return true;
}

function releaseTenantSlot(tenantId: string): void {
  const current = tenantOpen.get(tenantId) ?? 0;
  if (current <= 1) {
    tenantOpen.delete(tenantId);
  } else {
    tenantOpen.set(tenantId, current - 1);
  }
}

// ---------------------------------------------------------------------------
// Wave 12.E-fix-2 Phase 2 (EVID-053 H-14) — cookie parsing helper.
//
// moleculer-web does not parse `Cookie:` into a structured field on the
// alias request (the helpers for that live in moleculer-web's auth chain
// which this SSE alias intentionally bypasses). We do a minimal RFC-6265
// parse here — split on `;`, then on the first `=` per pair, decode the
// value via decodeURIComponent. Good enough for a single httpOnly auth
// cookie; for a richer flow consume a real cookie library.
// ---------------------------------------------------------------------------

function readCookie(req: IncomingMessage, name: string): string | null {
  const raw = req.headers.cookie;
  if (typeof raw !== 'string' || raw.length === 0) return null;
  const target = `${name}=`;
  for (const segment of raw.split(';')) {
    const trimmed = segment.trim();
    if (trimmed.startsWith(target)) {
      try {
        return decodeURIComponent(trimmed.slice(target.length));
      } catch {
        return null;
      }
    }
  }
  return null;
}

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
  // 0. Wave 12.E-fix-2 Phase 2 (EVID-053 H-15 / CWE-770) — per-IP burst
  //    rate-limit at the front so storm-of-connections attempts cost the
  //    server nothing more than a Map lookup. Real auth and tenant logic
  //    run only for connection attempts within the burst budget.
  // ---------------------------------------------------------------------
  const ip = clientIp(req);
  if (ipRateLimitExceeded(ip)) {
    res.statusCode = 429;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Retry-After', String(Math.ceil(RATE_LIMIT_WINDOW_MS / 1_000)));
    res.end(JSON.stringify({ error: 'too_many_requests' }));
    return;
  }

  // ---------------------------------------------------------------------
  // 1. Parse + validate `docId` from the query string, plus extract the
  //    tenant id (Wave 11.A FR-004). `req.url` may be
  //    `/api/stream/ingest?docId=abc&tenantId=xyz&tenant=xyz`; we only
  //    need the search params, so a relative URL with a dummy base is
  //    sufficient.
  //
  //    Tenant precedence: `?tenantId=` (Wave 12.E-fix-2 Phase 2 frontend
  //    convention) wins, then legacy `?tenant=`, then `X-Tenant-ID`
  //    header. Falls back to `DEFAULT_TENANT_ID` when all are absent.
  //
  //    Note: the client-supplied tenant is treated as a HINT only —
  //    the authoritative scope is the `tenantId` claim inside the JWT
  //    cookie (step 2). When the two disagree we reject with 403.
  // ---------------------------------------------------------------------
  const rawUrl = req.url ?? '';
  let docId: string | null = null;
  let rawTenant: string | null = null;
  try {
    const parsed = new URL(rawUrl, 'http://localhost');
    docId = parsed.searchParams.get('docId');
    rawTenant =
      parsed.searchParams.get('tenantId') ?? parsed.searchParams.get('tenant');
  } catch {
    // Malformed URL — fall through to the 400 branch below.
  }

  if (!docId || !DOC_ID_PATTERN.test(docId)) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'invalid_doc_id' }));
    return;
  }

  // Header fallback when no query tenant — match the RLR resolver shape.
  if (!rawTenant) {
    const headerTenant = req.headers['x-tenant-id'];
    if (typeof headerTenant === 'string') {
      rawTenant = headerTenant;
    } else if (Array.isArray(headerTenant) && headerTenant.length > 0) {
      rawTenant = headerTenant[0] ?? null;
    }
  }

  // Reject malformed tenant ids outright (header-injection / DoS via huge
  // tenantId values that would inflate the in-process registry).
  let tenantId: string;
  if (rawTenant === null || rawTenant === '') {
    tenantId = DEFAULT_TENANT_ID;
  } else if (TENANT_ID_PATTERN.test(rawTenant)) {
    tenantId = rawTenant;
  } else {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'invalid_tenant_id' }));
    return;
  }

  // ---------------------------------------------------------------------
  // 1.5. Wave 12.E-fix-2 Phase 2 (EVID-053 H-14 / CWE-639) — authenticate
  //      the request and cross-check the supplied tenantId against the
  //      JWT claim. Pre-fix the SSE endpoint accepted the client-supplied
  //      tenantId verbatim, so a session in tenant A could subscribe to
  //      tenant B's documents by flipping the query parameter (IDOR).
  //
  //      The `auth_token` cookie is set by the SvelteKit login action
  //      (httpOnly, SameSite=Lax). EventSource ships it courtesy of
  //      `withCredentials: true` (see lib/sse-client.ts H-6 fix). When
  //      the cookie is missing or invalid we reject with 401 instead of
  //      streaming silently.
  // ---------------------------------------------------------------------
  const accessToken = readCookie(req, 'auth_token');
  if (accessToken === null) {
    res.statusCode = 401;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('WWW-Authenticate', 'Bearer realm="m9s-example"');
    res.end(JSON.stringify({ error: 'authentication_required' }));
    return;
  }
  const claims = verifyToken(accessToken);
  if (claims === null || claims.kind !== 'access') {
    res.statusCode = 401;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('WWW-Authenticate', 'Bearer realm="m9s-example"');
    res.end(JSON.stringify({ error: 'invalid_token' }));
    return;
  }
  if (claims.tenantId !== tenantId) {
    // The session belongs to a different tenant than the one being
    // streamed. Mirrors `assertSessionInTenant` semantics from the
    // ingest action (`AuthenticationRequiredError` / `TenantScopeViolationError`).
    res.statusCode = 403;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'tenant_scope_violation' }));
    return;
  }

  // ---------------------------------------------------------------------
  // 1.6. Wave 12.E-fix-2 Phase 2 (EVID-053 H-15 / CWE-770) — per-tenant
  //      open-stream cap. Distinct from the per-tenant SUBSCRIBER cap in
  //      `sse-emitter.ts` (FR-004) because that one is keyed by
  //      `tenantId × docId` Set; this one tracks every open HTTP
  //      connection so empty docs / replayed-and-closed listeners are
  //      still counted while their socket is live.
  // ---------------------------------------------------------------------
  if (!acquireTenantSlot(tenantId)) {
    res.statusCode = 429;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Retry-After', String(Math.ceil(RATE_LIMIT_WINDOW_MS / 1_000)));
    res.end(JSON.stringify({ error: 'tenant_stream_cap_exceeded' }));
    return;
  }
  let tenantSlotReleased = false;
  const releaseTenantSlotOnce = (): void => {
    if (tenantSlotReleased) return;
    tenantSlotReleased = true;
    releaseTenantSlot(tenantId);
  };

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
    // Wave 12.E-fix-2 Phase 2 (EVID-053 H-15): give back the tenant
    // open-stream slot so disconnect/done/error properly frees capacity
    // for the next subscriber.
    releaseTenantSlotOnce();
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

  // Wave 11.A FR-004: pass tenantId so the emitter enforces the per-tenant
  // subscriber cap. On cap-exceeded the callback is invoked synchronously
  // with `{kind: 'error', detail: 'tenant subscriber cap exceeded'}` BEFORE
  // `subscribe()` returns; the `kind === 'error'` branch below ends the
  // response. No listener is registered in that case, so other tenants'
  // streams (and this tenant's other already-open streams) remain healthy.
  const unsubscribe = subscribe(docId, tenantId, (event) => {
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
