---
depth: standard
id: PRD-039
kind: prd
last_modified_at: 2026-05-18T19:31:38.501363+00:00
last_modified_by: claude-code/2.1.142
links:
- target: EVID-053
  relation: based_on
status: active
title: Wave 12.E-fix-2 — close deferred 3 CRIT + 10 HIGH from EVID-053
---

## Problem Statement

EVID-053 (Wave 12.E aggregated audit) surfaced 5 CRITICAL + 14 HIGH findings across 3 example apps. Wave 12.E-fix-1 closed 4 (CRIT-2 + CRIT-3 + H-7 + H-17) manually after 3 parallel teammates stalled at 600 s watchdog. Wave 12.E-fix-2 closes the remaining 15.

## Goals

1. Close 3 CRITICAL findings: CRIT-1 (FR-003 Redis rotation wiring gap, CWE-613), CRIT-4 (openapi-schema.d.ts contradicts handler reality), CRIT-5 (dead 683-LOC generateOpenAPISchema generator).
2. Close 10 HIGH findings (4 backend + 2 frontend SvelteKit + 4 cross-app + others — security H-14/H-15/H-16 from EVID-053 §HIGH security).
3. Avoid the Wave 12.E-fix-1 teammate-stall regression — scope each teammate to one cohesive area (backend auth + queue + types + frontend) with explicit file lists and clear acceptance criteria.

## Functional Requirements

**FR-001** — CRIT-1 closure: replace static `import { registerJti, consumeJti, revokeUser } from '../rotation-store'` in `examples/m9s-example/src/services/auth/src/actions/{login,refresh}.action.ts` with DI'd `IRotationStore` resolved from `infrastructure.rotationStore`. Composition wires `RedisRotationStore` when `REDIS_URL` set. Acceptance: setting REDIS_URL routes refresh-token reuse detection through Redis (verify via integration test or log assertion).

**FR-002** — CRIT-4 closure: regenerate `examples/m9s-example-api-types/src/generated/openapi-schema.d.ts` from current backend handler types (typia-validated). `IngestDocumentResponse.mode` must be `'queued' | 'inline'` (not `'sync' | 'queued'`); `IngestDocumentResponse` must include `jobId` + `chunkCount`; `SearchQueryResponse.results` must include `chunkIdx + score` (not `similarity + took_ms`).

**FR-003** — CRIT-5 closure: delete dead `generateOpenAPISchema` function in `examples/m9s-example-api-types/src/openapi/generator.ts` (~683 LOC). Backend uses static `buildOpenApiSchema()` in `examples/m9s-example/src/openapi/schema.ts` instead. Remove from `index.ts` exports + update README to clarify seed-mode is removed.

**FR-004** — H-1 closure: `examples/m9s-example/src/services/auth/lifecycle.ts:26-31` must NOT log a "warning" then throw at first request — instead, fail-fast at boot if `JWT_SECRET` is missing (matches FR-002 backend contract).

**FR-005** — H-2 closure: `examples/m9s-example/src/services/ingest/src/queues/ingest-chunk.worker.ts:96-146` queue-mode worker MUST emit `embedding`/`persisted`/`done` SSE frames after each pipeline stage (not just `started` from the action handler). Acceptance: queued-mode ingest produces 4-frame lifecycle visible to UI panel.

**FR-006** — H-3 closure: worker `_destroyed` re-check after await (CWE Wave 12.D-fix L-5 contract violation) in `ingest-chunk.worker.ts:109-114,124-130`. Pattern matches existing Wave 12.D-fix idiom.

**FR-007** — H-4 closure: either wire `appErrorToHttpResponse` HTTP scrubber from `examples/m9s-example/src/composition/errors.ts:58-71` into the action-error path OR delete the dead export. Current state: scrubber declared, never invoked — handlers leak `userId/url/originalKind`.

**FR-008** — H-5 closure: `examples/m9s-example-web/src/routes/ingest/+page.svelte:122-123` XHR upload MUST include `X-Tenant-ID` + `Authorization: Bearer <token>` headers. Acceptance: cross-tenant XHR upload returns 401 / 403 per tenant-resolver.

**FR-009** — H-6 closure: `examples/m9s-example-web/src/lib/sse-client.ts:76` EventSource MUST include `X-Tenant-ID` header (via URL query string since EventSource ignores `headers` option) + auth token. SSE endpoint backend MUST validate.

**FR-010** — H-8 closure: `examples/m9s-example-api-types/src/index.ts` exports MUST include `LoginRequest/Response`, `RefreshRequest/Response`, `LogoutRequest/Response` types matching backend auth handlers.

**FR-011** — H-9 closure: `examples/m9s-example-api-types/src/openapi/types.ts:275-284` `OpenApiGeneratorOptions.schema: any` MUST be a specific OpenAPI 3.x schema type (use `@samchon/openapi`'s OpenApi.IDocument or equivalent).

**FR-012** — H-10 closure: dist of `examples/m9s-example-api-types` MUST NOT leak `typia` or `@samchon/openapi` types on the public surface. Either move generator types behind `/internal` subpath or use `type-fest`-style ergonomic re-exports.

**FR-013** — H-13 closure: `examples/m9s-example-web/src/lib/api/client.ts` PlaceholderPaths + `as never` casts MUST be removed (Wave-9 vestigial). Use real `api-types` paths instead.

**FR-014** — H-14 closure: `examples/m9s-example/src/services/sse/api.service.ts:216-217` SSE stream MUST validate session tenantId against backend-resolved tenantId (no client-supplied tenant override). CWE-639 IDOR vector closure.

**FR-015** — H-15 closure: `examples/m9s-example/src/services/sse/api.service.ts` SSE route MUST apply per-IP or per-session rate limit. CWE-770 DoS vector closure.

## Non-Functional Requirements

**NFR-001** — Build green: `pnpm build` + `pnpm typecheck` + `svelte-check` zero errors after all closures.

**NFR-002** — Test contract preserved: e2e tests (`tests/e2e.test.ts`) MUST continue passing post-fix. Add new e2e tests for FR-001 (Redis rotation), FR-008 (XHR auth), FR-014 (SSE tenant validation).

**NFR-003** — No published-API breaking changes outside the 3 example apps. All 38 `@gertsai/*` packages untouched.

**NFR-004** — Disjoint teammate scope to avoid Wave 12.E-fix-1 stall regression. Each teammate gets ≤6 file paths + verbatim EVID-053 finding text + acceptance criteria.

## Acceptance Criteria

- All 13 (FR-001..FR-015) findings closed with line-level fixes.
- EVID-055 documents closures with `## Structured Fields` (verdict, congruence_level, evidence_type).
- PR opens green; merge after user Y; Version Packages PR auto-created; user Y → publish to GH Packages.

## Out of Scope

- 20 MEDIUM + 15 LOW from EVID-053 §MEDIUM/LOW (Wave 12.E-polish or rolled into Wave 14).
- H-11/H-12 (handcurated `limit` vs `topK` schema drift — already touched in Wave 12.E-fix-1 frontend changeset; verifying coverage during this sprint).
- Cross-package consistency audit (Wave 12.F separate sprint).

Refs: EVID-053 (source), PRD-038 (Wave 12.E-fix-1 precedent), EVID-054 (partial closure).






