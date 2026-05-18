---
'@gertsai-examples/m9s-example': patch
'@gertsai-examples/m9s-example-web': patch
'@gertsai-examples/m9s-example-api-types': patch
---

Wave 12.E-fix-2 Phase 1 — close 3 CRITICALs from EVID-053.

**CRIT-1 (CWE-613) — FR-003 Redis rotation store wired but never consumed.**
`examples/m9s-example/src/services/auth/src/actions/{login,refresh}.action.ts`
used static imports from `../rotation-store` (a module-level `Map`),
bypassing `infrastructure.rotationStore` (which picks `RedisRotationStore`
when `REDIS_URL` is set). Multi-instance prod deploys silently failed
reuse-detection across nodes; process restarts wiped the in-memory map.

Fix: actions now consume `service.rotationStore` (`IRotationStore` injected
by `services/auth/lifecycle.ts` from `composition/infrastructure.ts`).
Legacy module-level `Map` + functions removed from `rotation-store.ts`
(file kept with deprecation notice to anchor grep references).
`InMemoryRotationStore` class moved into `src/infrastructure/` so the
periodic pruner can be started exactly once in `buildInfrastructure()`.

**CRIT-4 — Generated `openapi-schema.d.ts` shipped contradicting reality.**
`IngestDocumentResponse` declared `{mode: 'sync' | 'queued', chunksIndexed?}`
but backend emits `{docId, jobId, mode: 'queued' | 'inline', chunkCount: number | null}`.
`SearchQueryResponse` declared `{results: [{docId, text, similarity}], took_ms}`
but backend emits `{results: [{docId, chunkIdx, text, score}]}`.

Fix: hand-aligned `examples/m9s-example-api-types/src/generated/openapi-schema.d.ts`
+ `openapi.json` to mirror typia-validated backend handler types. Same edit
shape as Wave 12.E-fix-1 `SearchHit` extraction (FR-013-style).

**CRIT-5 — Generator exported but unused — guaranteed drift.**
`examples/m9s-example-api-types/src/openapi/generator.ts` had a 683-LOC
`generateOpenAPISchema` function with NO first-party consumer. Backend
uses `buildOpenApiSchema()` in `m9s-example/src/openapi/schema.ts` instead.

Fix: deleted the dead generator (`generator.ts` 683 LOC + companion
`scripts/generate-openapi-contract.mjs` 436 LOC). Removed
`openapi-typescript` / `@samchon/openapi` / `typia` from `package.json`
deps (no longer used). README updated to document the hand-aligned
snapshot procedure.

Total: ~1,203 LOC removed, ~444 LOC modified. No `@gertsai/*` package
surface changes.

**Deferred to Wave 12.E-fix-2 Phase 2:** 10 HIGHs (backend H-1..H-4,
frontend H-5/H-6, cross-app H-8..H-13, security H-14..H-16) +
backend `m9s-example/src/openapi/schema.ts` static-schema realignment
(Teammate B flagged — `/openapi/schema.json` endpoint still serves
broken contract even though the api-types snapshot is now correct).

Refs: PRD-039, EVID-053 (CRIT-1, CRIT-4, CRIT-5 closures).
