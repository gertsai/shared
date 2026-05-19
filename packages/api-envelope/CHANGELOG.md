# @gertsai/api-envelope

## 0.2.0

### Minor Changes

- 20c748f: Wave 15.A — Extract envelope cluster from `@gertsai/api-core` into new Tier-1 `@gertsai/api-envelope` package per EVID-067 §15.A.

  **Rationale**: api-core's envelope cluster (~1,901 LOC across 6 files: `types/{error,response,list,index}.ts` + `response-wrapper.ts` + `type-guards.ts`) is pure typia tagged interfaces + helpers — browser-safe, zero Moleculer coupling. Its prior location in api-core (Tier-4) blocked consumption by FastAPI / Rust ts-types generators (already advertised in `contracts/index.ts` JSDoc).

  **New package**: `@gertsai/api-envelope@0.1.0` (Tier-1, browser-safe).

  - Deps: `typia ^9.7.0`, `@standard-schema/spec ^1.1.0`. NO `@gertsai/*` deps.
  - Includes 9 files moved via `git mv` (6 production + 3 co-located test files).
  - Plus new `orchestra-shim.ts` (41 LOC) — structural counterparts of api-core's `OrchestraApiResponse<CODE>` / `ResponseCode`. Solves the type-only cross-boundary dep that previously bound the envelope to api-core's `apiResponse/` subsystem. Real `OrchestraApiResponse` instances duck-type into the shim, so existing api-core callers compile and run unchanged.

  **api-core changes**:

  - `packages/api-core/src/lib/envelope/index.ts` → thin re-export shim from `@gertsai/api-envelope`. Preserves deliberate non-re-exports per EVID-067 §Doctor Strange #1 (`validationError`, `notFoundError`, `authError`, `rateLimitError`, `internalError`, `GertsProcessingStage` — fossil of incomplete RFC-030 migration).
  - `packages/api-core/package.json` → adds `@gertsai/api-envelope: workspace:*` dep.
  - 2 api-core test files updated to import directly from `@gertsai/api-envelope` (was `'../lib/envelope/...'`).

  **Behaviour**: zero change. All existing `import { ... } from '@gertsai/api-core/contracts'` / `'@gertsai/api-core'` continue resolving identically via shim.

  **Tests**: 95 envelope tests now run in api-envelope package; 284 + 95 = 379 total preserved across api-core + api-envelope (was 379 in api-core alone). Workspace typecheck 0 errors across 39 packages + 3 example apps.

  **Workspace size**: 38 packages + 3 examples → **39 packages + 3 examples**.

  Net diff: 22 files / +379 insertions / -35 deletions (mostly scaffold for new package; moved files show as renames with 0 line delta via git's rename-detection).

  Refs: PRD-050, EVID-067 (Wave 15 audit — §15.A recommendation), EVID-058 (Wave 12.G top-ranked action).
