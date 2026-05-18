---
'@gertsai-examples/m9s-example': patch
'@gertsai-examples/m9s-example-web': patch
'@gertsai-examples/m9s-example-api-types': patch
---

Wave 12.E-fix-2 Phase 2 — close all 13 remaining HIGHs + 1 newly-flagged backend H from EVID-053.

**Backend (Teammate C):**

- **H-1** — `services/auth/lifecycle.ts`: JWT_SECRET now hard-fails at boot (matches `examples/m9s-example-web/src/lib/server/jwt.ts:43-46` contract). Pre-fix the lifecycle emitted a "warning" then threw on first request — fail-fast guarantee was missed.
- **H-2** — `services/ingest/src/queues/ingest-chunk.worker.ts`: queued ingest now emits the same 4-frame SSE lifecycle as inline (`started` → `embedding` → `persisted` → `done`). Pre-fix queued mode emitted only `started`; UX looked like phantom timeout.
- **H-3** — `ingest-chunk.worker.ts`: `_destroyed` re-check after every significant `await` (Wave 12.D-fix L-5 contract). `ingest/lifecycle.ts` flips `_destroyed = true` on stop so workers short-circuit mid-await on broker shutdown.
- **H-4** — `composition/errors.ts` HTTP scrubber: wired `appErrorToHttpResponse` into the catch blocks of `ingest-document.action.ts` + `delete-document.action.ts` for `AuthenticationRequiredError` + `TenantScopeViolationError` + defensive `isAppError` fallback. Pre-fix scrubber was declared, never invoked — handlers leaked `userId/url/originalKind`.
- **Newly-flagged backend openapi/schema.ts realignment** — backend static `buildOpenApiSchema()` was still declaring the broken shape (`chunksIndexed`, `took_ms`, `similarity`, `mode: 'sync' | 'queued'`, `limit`). `GET /openapi/schema.json` now serves the same contract as the typia-validated handlers (mirrors Wave 12.E-fix-2 Phase 1 CRIT-4 api-types snapshot).

**Frontend + cross-app (Teammate D):**

- **H-5** — `routes/ingest/+page.svelte`: XHR upload now hits `${apiConfig.baseUrl}/api/v1/ingest/upload` with `X-Tenant-ID` header + `withCredentials = true`. Pre-fix XHR bypassed tenant scope + auth.
- **H-6** — `lib/sse-client.ts`: `EventSource` now uses `apiConfig.baseUrl` + `tenantId` query param + `withCredentials: true`. EventSource doesn't support custom headers, so tenantId rides query string.
- **H-8** — new `m9s-example-api-types/src/auth-types.ts` exports canonical `AuthUser`, `LoginRequest/Response`, `RefreshRequest/Response`, `LogoutRequest/Response`. Frontend `login/+page.server.ts` now imports `LoginResponse` instead of inline duplicate.
- **H-9** — `m9s-example-api-types/src/openapi/types.ts`: tightened `OpenApiGeneratorOptions.schema: any` to `Record<string, unknown>` + added `OpenApiServerEntry` for `servers[]` array.
- **H-10** — dist of `m9s-example-api-types` no longer leaks `typia` + `@samchon/openapi` types (CRIT-5 deletion + `pnpm run clean && run build` for stale artifacts).
- **H-13** — `m9s-example-web/src/lib/api/client.ts` + `routes/{ingest,search}/+page.server.ts`: dropped `PlaceholderPaths` alias + `as never` casts. Frontend imports real `paths` + canonical types from `@gertsai-examples/m9s-example-api-types`.

**Security (Teammate D):**

- **H-14** — `mol-services/sse-ingest.handler.ts`: SSE handler now reads `auth_token` cookie, calls `verifyToken`, rejects 401 on missing/invalid + 403 on tenant mismatch. Closes CWE-639 IDOR (client-supplied tenantId without session cross-check).
- **H-15** — `sse-ingest.handler.ts`: per-IP burst (`SSE_RATE_LIMIT_IP_BURST=10/min`) + per-tenant concurrent open-stream cap (`SSE_RATE_LIMIT_TENANT_OPEN=50`). Closes CWE-770 SSE DoS. Slots released in cleanup path.

**Browser-safe `apiConfig` extraction** — new `m9s-example-web/src/lib/api/config.ts` so `node:async_hooks` (pulled in by api client's ALS) doesn't bleed into the client bundle. Required by H-5 (XHR import path).

**Deferred:** H-16 (bcryptjs → native bcrypt) deferred — requires native module which complicates cross-platform builds; revisit in Wave 13 or beyond. H-11/H-12 alignment already covered between Wave 12.E-fix-1 + Phase 1 (handler/api-types) + this Phase 2 (backend openapi/schema.ts).

Total: 17 files modified + 2 new files, +630/-132 LOC. No `@gertsai/*` package surface changes. All 3 example apps build/typecheck green. m9s-example baseline tests unchanged (15/17 test files pass, 79 tests pass, 0 fail — e2e ioredis hook timeout pre-existing).

Refs: PRD-039, RFC-026, EVID-053, EVID-055 (Phase 1 precedent).
