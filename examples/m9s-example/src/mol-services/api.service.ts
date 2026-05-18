import { createApiService } from '@gertsai/api-core/moleculer';
import RLRMiddleware from '@gertsai/api-rlr';
import IORedis from 'ioredis';

import config from '../../project.config';
import { sseIngestAliasHandler } from './sse-ingest.handler';

// =============================================================================
// Wave 11.A FR-005 — CORS allow-list (env-driven).
//
// Default policy was `origin: '*'`, which is friction-free for local demos
// but a security smell for any non-toy deployment (open invitation for
// cross-site credentialed requests once cookies / Authorization are in
// play). The new policy:
//
//   - `CORS_ALLOWED_ORIGINS` set       → parsed comma-separated list.
//   - Unset AND NODE_ENV !== production → fall back to `'*'` + log a warning.
//   - Unset AND NODE_ENV === production → throw at module load (fail-fast).
//
// moleculer-web accepts `origin: string | string[]` and re-emits the
// matched origin in `Access-Control-Allow-Origin` (per spec — required
// once credentials are non-`'*'`). See node_modules/moleculer-web/src/index.js.
// =============================================================================

function parseCorsOrigins(): readonly string[] | '*' {
  const raw = process.env.CORS_ALLOWED_ORIGINS;
  if (typeof raw === 'string' && raw.trim().length > 0) {
    const list = raw
      .split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0);
    if (list.length > 0) {
      return list;
    }
  }
  // Unset or empty after trim — apply NODE_ENV-gated policy.
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      '[cors] CORS_ALLOWED_ORIGINS must be set in production — refusing to start with wildcard origin',
    );
  }
  // eslint-disable-next-line no-console
  console.warn(
    '[cors] wildcard origin in use — set CORS_ALLOWED_ORIGINS for prod',
  );
  return '*';
}

const corsOrigin = parseCorsOrigins();

// `package.json` is loaded at runtime and embedded into the response envelope
// by createApiService. Resolved relative to `process.cwd()` (set by `pnpm start`
// to the package directory) so the lookup works identically from `src/` (dev,
// ts-node-dev) and `dist/src/` (compiled, `node dist/src/index.js`) — earlier
// fixed-`require('../../package.json')` shifted by one level after compile.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pkg = require(`${process.cwd()}/package.json`) as Record<string, unknown>;

// =============================================================================
// Rate limiter (@gertsai/api-rlr) — pipeline pattern
//
// RLR sits as an Express-style middleware in moleculer-web's `settings.use`
// chain (BEFORE Moleculer routes). It's gated on REDIS_URL since the only
// shipped store is Redis-shaped. When disabled, the chain is empty and no
// throttling happens — useful for local single-process dev.
//
// See apps/pipeline/src/mol-services/api.service.ts for the production
// reference (per-route presets + tenant key extraction + IP fallback).
// =============================================================================

const rlrUseChain = config.RLR_ENABLED && config.REDIS_URL
  ? [
      RLRMiddleware({
        timeFrame: config.RLR_TIMEFRAME,
        limit: config.RLR_LIMIT,
        burst: config.RLR_BURST,
        // Cast to LimiterStrategy literal — env strings are validated at
        // import time but TS can't infer the union narrowing here.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        strategy: config.RLR_STRATEGY as any,
        prefix: config.RLR_PREFIX,
        store: () =>
          new IORedis(config.REDIS_URL, {
            maxRetriesPerRequest: 1,
            lazyConnect: true,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          }) as any,
        bucketKeyResolver: (req: { headers: Record<string, string | string[] | undefined> }) => {
          // Pipeline pattern: tenant-scoped bucket if X-Tenant-ID present;
          // otherwise fall back to client IP. Real apps should call
          // `validateTenantIdFormat()` from @gertsai/api-core to prevent
          // Redis-injection via raw header values.
          const rawTenant = req.headers['x-tenant-id'] ?? req.headers['x-tenant'];
          const tenantId = Array.isArray(rawTenant) ? rawTenant[0] : rawTenant;
          if (tenantId && /^[a-zA-Z0-9_-]{1,64}$/.test(tenantId)) {
            return `tenant:${tenantId}`;
          }
          // Lightweight IP extractor for example purposes — pipeline uses
          // `extractClientIp` from @gertsai/api-core for proxy-aware headers.
          const xff = req.headers['x-forwarded-for'];
          const ip = Array.isArray(xff) ? xff[0] : xff;
          return `ip:${((ip ?? 'unknown').split(',')[0] ?? 'unknown').trim()}`;
        },
      }),
    ]
  : [];

/**
 * API Gateway service — exposes the registered Moleculer actions over HTTP.
 *
 * Route layout:
 *   - `/api/v1/*`   — REST endpoints generated by ApiController autoAliases.
 *   - `/openapi`    — placeholder for the OpenAPI document. Wire a real
 *                     generator (typia.json.schema + generateOpenAPISchema)
 *                     once the example grows.
 *
 * CORS policy (Wave 11.A FR-005):
 *   - Default (no env): wildcard `*` in non-production, hard-fail in prod.
 *   - `CORS_ALLOWED_ORIGINS=https://a.example,https://b.example` to whitelist.
 *
 * Auth is still permissive (no gateway-level authn/authz) — tighten before
 * any non-toy deployment.
 */
export function createDocumentsApiService() {
  return createApiService(
    {
      name: 'api',
      // OAuth mixin is not needed for the example; disabling it also frees
      // us from configuring an OAuth model.
      disableAuth: true,

      settings: {
        port: Number(process.env.WEB_SERVER_PORT ?? 3000),

        cors: {
          // Wave 11.A FR-005 — env-driven allow-list (see `parseCorsOrigins`).
          // moleculer-web accepts string | string[]; the readonly array from
          // `parseCorsOrigins` is widened with a spread copy since the gateway
          // mutates its settings shape internally.
          origin: corsOrigin === '*' ? '*' : [...corsOrigin],
          methods: ['GET', 'POST', 'OPTIONS'],
          allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-ID', 'X-Request-ID'],
          // Wave 12.E-fix-2 Phase 2 (EVID-053 H-5 + H-6) — the XHR upload
          // and SSE EventSource both run with `withCredentials: true`
          // so the browser ships the httpOnly `auth_token` cookie. CORS
          // refuses to expose the response unless we explicitly opt in to
          // credentialed mode. moleculer-web emits
          // `Access-Control-Allow-Credentials: true` when this is set
          // (see node_modules/moleculer-web/src/index.js around the
          // `route.cors.credentials === true` branch). Note: this is only
          // valid when `origin` is an explicit list, NOT '*' — the
          // wildcard-with-credentials combination is rejected by browsers
          // per fetch spec. In the non-prod wildcard fallback the browser
          // will simply ignore credentials; production deploys with the
          // CORS_ALLOWED_ORIGINS allow-list get the cookie correctly.
          credentials: true,
        },

        // -------------------------------------------------------------------
        // Express-style middleware chain. moleculer-web's built-in rate
        // limiter is disabled (rateLimit: null) so api-rlr is the only
        // throttling pass. See `rlrUseChain` above for gating.
        // -------------------------------------------------------------------
        rateLimit: null,
        use: rlrUseChain,

        routes: [
          {
            path: '/api/v1',
            // Auto-generate REST aliases from action `rest` strings.
            autoAliases: true,
            // Body parsing
            bodyParsers: {
              json: { strict: false, limit: '1MB' },
              urlencoded: { extended: true, limit: '1MB' },
            },
            // Allow access to all v1.* actions registered via ApiController.
            // Double-asterisk matches nested action names (v1.ingest.document
            // is "v1" + "ingest" + "document" — single-asterisk only matches
            // one segment). Pipeline uses the same `v1.<service>.**` shape.
            whitelist: ['v1.**'],
            // ApiController already wraps responses; no auth at the gateway.
            authentication: false,
            authorization: false,
          },
          {
            // Wave 9.0.1: route the broker-registered `v2.openapi.*` service
            // over HTTP via autoAliases. Replaces the static placeholder.
            // `createOpenApiService` (registered in src/index.ts) declares:
            //   - `v2.openapi.schema.aggregated` with rest: 'GET /schema.json'
            //   - `v2.openapi.schema.local`      with rest: 'GET /schema.local.json'
            // moleculer-web `autoAliases: true` picks up the rest field and
            // maps both into this `/openapi/*` route prefix.
            //
            // Full typia auto-derive (replacing the hand-curated
            // src/openapi/schema.ts literal) is deferred to Wave 9.0.2 —
            // it requires removing `: any` annotations from every action
            // export so typia can introspect their handler param/response
            // shapes (scope creep beyond Wave 9.0.1 maintenance).
            path: '/openapi',
            autoAliases: true,
            bodyParsers: {
              json: { strict: false, limit: '1MB' },
            },
            whitelist: ['v2.openapi.**'],
            authentication: false,
            authorization: false,
          },
          {
            // Wave 10.B (PRD-019 FR-002) — Server-Sent Events stream for
            // ingest pipeline lifecycle events. The alias handler is a
            // bare `(req, res)` function (not a Moleculer action) so we
            // can keep the connection open and write SSE frames directly.
            //
            //  - `use: []`  the api-rlr token bucket is bypassed because
            //               long-lived streams would otherwise be closed
            //               when their bucket ages out. Wave 12.E-fix-2
            //               Phase 2 (EVID-053 H-15 / CWE-770) added an
            //               SSE-specific rate-limit IN the handler:
            //                 * per-IP burst    (SSE_RATE_LIMIT_IP_BURST,
            //                                    default 10 /
            //                                    SSE_RATE_LIMIT_WINDOW_MS).
            //                 * per-tenant cap  (SSE_RATE_LIMIT_TENANT_OPEN,
            //                                    default 50 concurrent
            //                                    open streams).
            //  - `bodyParsers: false`   SSE is a GET with no body.
            //  - `authentication/authorization: false`   gateway-level
            //               authentication is OFF; the handler itself
            //               consumes the `auth_token` cookie + verifies
            //               the JWT (EVID-053 H-14 / CWE-639) before
            //               opening the stream.
            //
            // See `sse-ingest.handler.ts` for docId validation, JWT +
            // tenant cross-check, idle timeout, rate limit, and cleanup
            // semantics.
            path: '/api/stream',
            use: [],
            aliases: {
              'GET ingest': sseIngestAliasHandler,
            },
            authentication: false,
            authorization: false,
            bodyParsers: false,
          },
        ],
      },
    },
    pkg,
  );
}

export default createDocumentsApiService();
