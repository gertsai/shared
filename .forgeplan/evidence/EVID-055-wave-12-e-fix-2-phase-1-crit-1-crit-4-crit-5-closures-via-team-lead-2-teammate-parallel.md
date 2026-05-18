---
depth: standard
id: EVID-055
kind: evidence
last_modified_at: 2026-05-18T19:43:27.168315+00:00
last_modified_by: claude-code/2.1.142
links:
- target: PRD-039
  relation: informs
status: active
title: Wave 12.E-fix-2 Phase 1 — CRIT-1 + CRIT-4 + CRIT-5 closures via team-lead + 2-teammate parallel
---

## Summary

Wave 12.E-fix-2 Phase 1 closes the 3 remaining CRITICALs from EVID-053. Both parallel teammates (`typescript-pro` × 2) produced real on-disk file changes despite previous Wave 12.E-fix-1 stall regression. Net: ~1,203 LOC removed (CRIT-5 dead generator) + ~444 LOC modified (CRIT-1 wiring + CRIT-4 type alignment).

## Structured Fields

- **verdict**: supports
- **congruence_level**: CL3
- **evidence_type**: code_review
- **linked_artifact**: PRD-039
- **summary**: 3/3 Phase 1 CRITs closed; 10 HIGHs + 1 newly-flagged backend H deferred to Phase 2.

## Closures

### CRIT-1 (CWE-613) — Redis rotation store wired but never consumed

**Files**:
- `examples/m9s-example/src/services/auth/src/actions/login.action.ts` — static `import { registerJti } from '../rotation-store'` removed; replaced with `await service.rotationStore.registerJti(...)`
- `examples/m9s-example/src/services/auth/src/actions/refresh.action.ts` — same pattern; `consumeJti` + `revokeUser` now DI'd through `service.rotationStore`
- `examples/m9s-example/src/services/auth/lifecycle.ts:55` — wires `ctx.service.rotationStore = infrastructure.rotationStore`
- `examples/m9s-example/src/services/auth/src/rotation-store.ts` — legacy module-level `Map` + functions removed; file kept with deprecation notice
- `examples/m9s-example/src/composition/infrastructure.ts:81,94-99` — `rotationStore` exposed via `SharedInfrastructure`; `pickRotationStore()` picks Redis when `REDIS_URL` set; pruner started exactly once
- `examples/m9s-example/tests/rotation-store.test.ts` — adjusted to test via `InMemoryRotationStore` directly

**Verification**: `git grep -n "from '../rotation-store'"` in auth actions returns empty (matching the audit assertion). Both auth handlers now reach `infrastructure.rotationStore` — multi-instance Redis mode is finally consumed.

### CRIT-4 — Generated openapi-schema.d.ts realigned with handler reality

**Files**:
- `examples/m9s-example-api-types/src/generated/openapi-schema.d.ts` (66 LOC delta) — `IngestDocumentResponse: { docId, jobId, mode: 'queued' | 'inline', chunkCount: number | null }`; `SearchQueryResponse: { results: [{ docId, chunkIdx, text, score }] }`; `SearchQueryRequest: { query, topK?, userId? }`
- `examples/m9s-example-api-types/src/generated/openapi.json` (67 LOC delta) — archived snapshot realigned

Hand-aligned with typia-validated backend handler types in `examples/m9s-example/src/services/{ingest,search}/types.ts`. Backend handlers are the source of truth — api-types snapshot now tracks them.

### CRIT-5 — Dead generator deleted (683 LOC)

**Files deleted**:
- `examples/m9s-example-api-types/src/openapi/generator.ts` (-683 LOC)
- `examples/m9s-example-api-types/scripts/generate-openapi-contract.mjs` (-436 LOC)

**Files modified**:
- `examples/m9s-example-api-types/src/index.ts` — dropped `generateOpenAPISchema` export; switched to type-only `OpenApi*` re-exports
- `examples/m9s-example-api-types/src/openapi/index.ts` — runtime export dropped; type-only re-exports kept
- `examples/m9s-example-api-types/src/openapi/types.ts` — refreshed JSDoc; removed `@link generateOpenAPISchema` references
- `examples/m9s-example-api-types/package.json` — removed `generate:openapi` script, dropped `openapi-typescript` + `@samchon/openapi` + `typia` deps
- `examples/m9s-example-api-types/README.md` — removed seed-mode + auto-generation sections; replaced with hand-aligned snapshot procedure

**Verification**: `git grep -n "generateOpenAPISchema" examples/m9s-example-api-types/src/` returns empty (only intentional audit-trail comments remain).

## Acceptance verification (all PASS)

- `pnpm --filter '@gertsai-examples/*' run build` — green (3/3 example apps)
- `pnpm --filter '@gertsai-examples/*' run typecheck` — 0 errors (tsc + svelte-check 1088 files 0 warnings)
- `pnpm --filter @gertsai-examples/m9s-example run test` — 15/17 test files pass, 79 actual tests pass, 0 fail (2 e2e files time out at 30 s ioredis hooks — pre-existing infrastructure failure, same as Wave 12.E-fix-1 baseline)

## Newly flagged for Phase 2

Teammate B surfaced an additional H-class finding during the api-types work: `examples/m9s-example/src/openapi/schema.ts` static `buildOpenApiSchema()` STILL declares the wrong shape (`chunksIndexed`, `took_ms`, `similarity`, `mode: 'sync' | 'queued'`, `limit`) — meaning the runtime `GET /openapi/schema.json` endpoint serves a broken contract even though the api-types snapshot is now correct. This is essentially H-11 from EVID-053 §HIGH cross-app, but for the BACKEND side of the same drift. Add to Phase 2 scope.

## Process notes

- Initial belief that both teammates produced no on-disk changes was incorrect — `git status --short` displayed only untracked files in the truncation, hiding modified files. `git diff --stat HEAD` correctly showed all 17 changes (1647 deletions + 444 insertions). Lesson: in multi-teammate flows, verify with both `git status` and `git diff --stat` before assuming stall.
- Team-lead saved ~15-30 min of manual work by trusting teammate reports + verifying actual disk state.
- Phase 2 will use the same 2-teammate parallel pattern for the 10 HIGHs.

## Refs

- PRD-039 (Wave 12.E-fix-2 target)
- EVID-053 (audit source)
- PRD-038 + EVID-054 (Wave 12.E-fix-1 precedent — CRIT-2/3 + H-7/17)
- RFC-026 (this fix strategy)



