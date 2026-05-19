---
depth: standard
id: EVID-068
kind: evidence
last_modified_at: 2026-05-19T21:14:34.513488+00:00
last_modified_by: claude-code/2.1.142
links:
- target: PRD-050
  relation: informs
status: active
title: Wave 15.A — @gertsai/api-envelope Tier-1 extracted from api-core
---

## Summary

Wave 15.A extracts `@gertsai/api-core`'s envelope cluster (~1,901 LOC across 6 files) into a new Tier-1 `@gertsai/api-envelope@0.1.0` package per EVID-067 §15.A. Solo teammate (`typescript-pro`) under team-lead orchestration. 9 files moved via `git mv` (6 production + 3 co-located tests). Workspace grows from 38 to 39 packages. Build + typecheck + 379 tests green; 0 public-API break.

## Structured Fields

- **verdict**: supports
- **congruence_level**: CL3
- **evidence_type**: refactor_verification
- **linked_artifact**: PRD-050
- **summary**: ~1,901 LOC moved to new browser-safe Tier-1 pkg; 0 break; api-core shrinks ~9% (toward EVID-067's 33% Wave 15 total target).

## Closures (Teammate Q)

### New package scaffold (8 new files)

| Path | LOC | Purpose |
|---|---|---|
| `packages/api-envelope/package.json` | 53 | Tier-1 manifest. Deps: `typia ^9.7.0`, `@standard-schema/spec ^1.1.0`. NO `@gertsai/*` deps. |
| `packages/api-envelope/tsconfig.json` | 19 | Extends base; mirrors api-core (ESNext + Bundler) |
| `packages/api-envelope/tsup.config.ts` | 12 | Dual ESM+CJS + `UnpluginTypia({ cache: false })` |
| `packages/api-envelope/vitest.config.mts` | 25 | typia transform + tsconfig-paths |
| `packages/api-envelope/README.md` | 23 | Public README — Wave 15.A origin trace |
| `packages/api-envelope/LICENSE` | symlink | → `../../LICENSE` (Apache-2.0) |
| `packages/api-envelope/src/index.ts` | 135 | Barrel re-exports + new shim types |
| `packages/api-envelope/src/orchestra-shim.ts` | **41 NEW** | Structural counterparts of `OrchestraApiResponse<CODE>` / `ResponseCode` — solves type-only api-core dep without runtime coupling |

### Files moved (9 via git mv)

- `error.ts` (620), `response.ts` (361), `list.ts` (409), `types/index.ts` (41) → `packages/api-envelope/src/types/`
- `response-wrapper.ts` (422), `type-guards.ts` (450) → `packages/api-envelope/src/`
- `error.test.ts` (~380), `response.test.ts` (~270), `list.test.ts` (~360) → `packages/api-envelope/src/types/`

Total ~2,400 LOC moved.

### api-core changes

- `packages/api-core/src/lib/envelope/index.ts` → thin re-export shim. Preserves Doctor Strange #1 non-re-exports (`validationError`, `notFoundError`, `authError`, `rateLimitError`, `internalError`, `GertsProcessingStage`) via explicit named re-export instead of `export *`.
- `packages/api-core/package.json` → `+@gertsai/api-envelope: workspace:*` dep.
- 2 api-core test files import paths updated to `@gertsai/api-envelope`.
- `pnpm-lock.yaml` regenerated.

## Extraction-barrier finding (surfaced + solved)

Two envelope files (`response-wrapper.ts` + `type-guards.ts`) had type-only deps on api-core's `apiResponse/` subsystem (`OrchestraApiResponse` class type + `ResponseCode` enum). Both were used purely at type position (no runtime values referenced).

**Solution**: 41-LOC local `orchestra-shim.ts` defining structural counterparts:
- `OrchestraApiResponseLike<CODE>` — structural shape of `OrchestraApiResponse`
- `ResponseCodeLike` — structural shape of `ResponseCode` enum

Real api-core `OrchestraApiResponse<ResponseCode>` instances satisfy these via structural typing. Existing api-core callers + their tests compile and run unchanged. No cycle, no peer-dep on api-core, no logic change.

## Acceptance verification (all PASS)

| Scope | Build | Typecheck | Tests |
|---|---|---|---|
| `@gertsai/api-envelope` (new) | ✅ ESM 132KB + CJS 137KB + DTS 36KB | ✅ 0 errors | ✅ **95 pass** (3 files) |
| `@gertsai/api-core` | ✅ all subpaths | ✅ 0 errors | ✅ **284 pass** (12 files) |
| Workspace (`pnpm build`) | ✅ all 39 packages + 3 examples | — | — |
| Workspace (`pnpm typecheck`) | — | ✅ **0 errors** across 39 packages + 3 examples (incl. svelte-check 1078 files) | — |

**Test count preservation**: 284 + 95 = 379 (was 379 in api-core alone before extraction). Zero loss.

## Diff stats

22 files changed, 379 insertions, 35 deletions. Mostly scaffold for new pkg; moved files show as renames (git -M detected) with 0 line delta where unchanged, small -11/+11 deltas where apiResponse imports were swapped to shim imports.

## No public-API breaks

- `@gertsai/api-envelope`: new package, minor bump (0.0.0 → 0.1.0)
- `@gertsai/api-core`: patch bump (back-compat shim preserves all existing imports)
- 30 downstream consumers unaffected — transitive shim resolution

## Workspace size

Before: 38 packages + 3 examples
After: **39 packages + 3 examples**

## Toward Wave 15 cumulative goal

EVID-067 §Total Wave 15: api-core 9,772 → ~6,500 LOC (33% reduction) after 15.A+B+C. This PR delivers ~25% of that reduction.

## Remaining Wave 15

- **15.B**: BullMQ queue/worker extraction → `@gertsai/api-queue` Tier-2 (~530 LOC, ~2.5d)
- **15.C**: Pub/Sub extraction → `@gertsai/api-pubsub` Tier-2 (~250 LOC, ~1.5d)

## Refs

- PRD-050 (target)
- EVID-067 (Wave 15 audit source — §15.A)
- EVID-058 (Wave 12.G aggregate — top recommendation)
- ADR-002 (hex layering), ADR-003 (subpath strategy)



