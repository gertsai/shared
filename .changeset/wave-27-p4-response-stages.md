---
'@gertsai/api-core': minor
---

Wave 27 PR-4 — **integration milestone**: extract response-handling stages 9-11 + wire up full `PipelineRunner` orchestrator.

Stages 9-11 moved into standalone files (PRESERVED VERBATIM per SPEC-021 line-range contracts):

- **Stage 9 `rawResponseShortcut`** — throws `PipelineShortCircuit(data)` when handler returned `raw: true`. Runner catches outside the `translateError` path and returns data directly without wrapping.
- **Stage 10 `validateResponse`** — when `config.RESPONSE_VALIDATION === true`, validates handler result against `action.options.response`. Strict mode throws `APIError(BAD_REQUEST__INVALID_RESPONSE)`; loose mode logs error and passes through.
- **Stage 11 `wrapResponse`** — produces final `{code, message, data}` shape in `ctx.result` with fallback chain `result.code → action.responseCode → ResponseCode.SUCCESS`.

**`ApiController._createActionSchema`** now a **15-LOC orchestrator** (was 193 LOC in original closure). Full `new PipelineRunner(DEFAULT_STAGES).run(initialCtx, deps)` invocation. All 13 stages now extracted (11 in `DEFAULT_STAGES`; stages 12+13 hard-wired into runner's `catch`/`finally`).

**`ApiController.class.ts` size**: 1178 LOC → 1005 LOC (-173 LOC, -14.7%). The `_createActionSchema` method itself shrunk from 193 → 25 LOC including method scaffolding (the handler body is just 15 LOC).

**`PipelineDeps.strictResponseValidation`** added as **optional** field — captured at schema-build time from `ApiController._config.strictResponseValidation`. Chosen over runtime cast `(deps.controller as ...)._config` for type safety and to avoid silent `undefined` if controller shape ever changes.

**`PipelineRunner.run`** return-value semantics finalised: when `ctx.result.code !== undefined` (always after stage 11), returns `{ success: true, code, message, data }`; otherwise returns `ctx.result?.data` (partial-pipeline edge for tests with empty stages list).

**`runStagesSerially` retired** — was a temporary bridge during PR-2/3. Removed from `runner.ts`, `index.ts`, and its 2 tests dropped from `__tests__/runner.test.ts`.

**Minor bump rationale**: this PR makes `@gertsai/api-core/pipeline` subpath reachable as a documented public composition surface (additive). Consumer code can now `import { PipelineRunner, DEFAULT_STAGES, extractParams, ... } from '@gertsai/api-core/pipeline'`. PR-1..PR-3 were `patch` because the pipeline was dormant; PR-4 promotes it to a feature.

**Tests**: +19 new (6 raw-response-shortcut + 6 validate-response + 7 wrap-response). PipelineRunner tests updated to verify new envelope-return semantics. Total api-core: **376/376 passing**.

**Verification**:
- `pnpm --filter @gertsai/api-core build` — dual ESM+CJS green
- `pnpm --filter @gertsai/api-core typecheck` — 0 errors
- `pnpm --filter @gertsai/api-core test` — 376 passed (27 test files)
- `pnpm typecheck` workspace-wide — 0 errors

**Behaviour preservation**: zero changes to externally-observable behaviour. Same `APIError` codes, same `{success, code, message, data}` envelope, same `raw: true` short-circuit semantics, same response validation strict/loose paths.

**Deferred to PR-5**:
- Bench harness `__bench__/pipeline-runner.bench.ts` per RFC-027 §Bench plan (vitest bench config not yet wired)
- `setStageOverride` public API per RFC-027 §PR-5

Refs: PRD-065, SPEC-021 §Stages 9-11, RFC-027 §PR-4, ADR-015
