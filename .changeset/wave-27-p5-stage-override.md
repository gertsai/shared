---
'@gertsai/api-core': patch
---

Wave 27 PR-5 — **final PR**: `setStageOverride` public API + bench harness + README docs. Closes Wave 15.D extraction project.

**`ApiController.setStageOverride(name, stage)`** — public method to override a single named stage in the action pipeline. Override is captured at schema-build time (snapshot isolation); already-registered actions retain their original pipeline.

```ts
import { ApiController } from '@gertsai/api-core';
import type { Stage } from '@gertsai/api-core/pipeline';

const myAuthStage: Stage = async (ctx, deps) => {
  // custom auth logic, fall back to default behaviour
  return ctx;
};

const controller = ApiController.resolveController('v1', 'graph');
controller.setStageOverride('establishAuthSession', myAuthStage);
```

**`STAGE_NAMES`** constant — extracted to `pipeline/default-stages.ts` (11 entries aligned by index with `DEFAULT_STAGES`). Re-exported from `@gertsai/api-core/pipeline`.

**Bench harness** — `packages/api-core/src/lib/controller/pipeline/__bench__/pipeline-runner.bench.ts`. Runs via `pnpm --filter @gertsai/api-core exec vitest bench --run`. Two benches: full 11-stage zero-work pipeline + isolated `wrapResponse` stage. **No perf gate** in this PR — establishes harness only (RFC-027 §Bench plan baseline never captured pre-extraction). Future PRs may add p95 ≤+2% gate when baseline is recorded.

**README** — new `## Action pipeline (Wave 27)` section documenting:
- Default 11-stage order + role of each
- `setStageOverride` usage example with snapshot-isolation note
- Custom-runner composition example

**`@ts-ignore` cleanup**: 0 removals. All 5 remaining instances in `ApiController.class.ts` target code NOT extracted to typed stages (resolve-controller generic widening, subscribe-on-topic options spread, Orchestra duck-type checks in queue/subscriber schemas, Moleculer lifecycle `this.Promise`). Preserved verbatim.

**Tests**: +5 new (in `src/__test__/apiController-stage-override.test.ts`):
- AC-SO-1: override replaces named stage in new schemas
- AC-SO-1 variant: override on one stage does not affect other stages
- AC-SO-2: snapshot isolation — override after schema-build does not mutate closed handler
- AC-SO-3: already-registered actions retain original pipeline
- AC-SO-4: multiple overrides on different stages compose in `STAGE_NAMES` order

Total api-core: **381/381 passing**.

**Verification**:
- `pnpm --filter @gertsai/api-core build` — dual ESM+CJS green
- `pnpm --filter @gertsai/api-core typecheck` — 0 errors
- `pnpm --filter @gertsai/api-core test` — 381 passed (28 test files)
- `pnpm --filter @gertsai/api-core exec vitest bench --run` — functional (no perf gate)
- `pnpm typecheck` workspace-wide — 0 errors

**Wave 27 summary** (after all 5 PRs):

| Before | After |
|---|---|
| `ApiController.class.ts`: 1178 LOC | 1005 LOC (-14.7%) |
| `_createActionSchema`: 193-LOC closure | 25-LOC `PipelineRunner` orchestrator |
| Stages: 0 (monolith) | 13 typed `Stage<TIn, TOut>` functions |
| Stage tests: 0 (only e2e) | 75+ unit tests across 13 stages |
| Public composition surface: none | `@gertsai/api-core/pipeline` subpath + `setStageOverride` |

Refs: PRD-065, SPEC-021, RFC-027 §PR-5, ADR-015
