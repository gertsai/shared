---
depth: standard
id: RFC-027
kind: rfc
last_modified_at: 2026-05-21T05:10:12.919256+00:00
last_modified_by: claude-code/2.1.145
status: draft
title: Wave 27 — typed Stage<TIn,TOut> pipeline + 5-PR phased landing
---

# RFC-027: Typed `Stage<TIn, TOut>` pipeline + 5-PR phased landing for Wave 27

| Field | Value |
|-------|-------|
| Status | Draft |
| Date | 2026-05-21 |
| Parent | PRD-065 |
| Decisions | ADR-015 (pattern); SPEC-021 (stage contracts) |

## Goal

Extract the 193-LOC `_createActionSchema` closure in `packages/api-core/src/lib/controller/ApiController.class.ts:722-915` into 13 separately-tested stage functions composed by a typed `PipelineRunner`. Preserve all externally-observable behaviour verbatim. Land in 5 small PRs to keep blast-radius per merge small.

## Non-goals (per PRD-065 §Out of Scope)

- Type-safety tightening (`any` / `@ts-ignore` preserved verbatim)
- Adding new stages (request-id, OTel span, rate-limit) — extraction only
- Refactoring queue / pubsub schemas (already done in Wave 15.A/B/C)
- Replacing typia or Moleculer

## Module layout

```
packages/api-core/src/lib/controller/
├── ApiController.class.ts         (post-extraction: ≤1000 LOC; _createActionSchema = 20 LOC orchestrator)
├── pipeline/
│   ├── index.ts                   (public re-exports: types, runner, default stages)
│   ├── types.ts                   (PipelineContext, Stage<TIn,TOut>, PipelineDeps, PipelineShortCircuit)
│   ├── runner.ts                  (PipelineRunner class)
│   ├── default-stages.ts          (ordered array of 13 default stages)
│   └── stages/
│       ├── extract-params.ts       (+ .test.ts)
│       ├── merge-multipart.ts      (+ .test.ts)
│       ├── coerce-query-string.ts  (+ .test.ts)
│       ├── inject-tenant-id.ts     (+ .test.ts)
│       ├── validate-request.ts     (+ .test.ts)
│       ├── establish-auth-session.ts (+ .test.ts)
│       ├── build-trace-context.ts  (+ .test.ts)
│       ├── invoke-handler.ts       (+ .test.ts)
│       ├── raw-response-shortcut.ts (+ .test.ts)
│       ├── validate-response.ts    (+ .test.ts)
│       ├── wrap-response.ts        (+ .test.ts)
│       ├── translate-error.ts      (+ .test.ts)
│       └── cleanup.ts              (+ .test.ts)
```

Public exports added to `packages/api-core/package.json`:

```jsonc
"exports": {
  ".": "./dist/index.js",
  "./pipeline": "./dist/pipeline/index.js",
  // ... existing subpath exports
}
```

`typesVersions` mirror per Sprint 3.0.1 F-4 pattern.

## Public surface (additive)

```ts
// @gertsai/api-core/pipeline

export interface PipelineDeps {
  readonly action: ApiControllerRegisteredAction;
  readonly controller: ApiController;
  readonly service: Moleculer.Service; // === `this` from the closure
  readonly logger: LoggerInstance | undefined;
}

export interface PipelineContext {
  readonly ctx: Moleculer.Context<unknown, ContextMeta>;
  readonly params?: unknown;
  readonly file?: unknown;
  readonly fileMeta?: object;
  readonly session?: OrchestraSession;
  readonly traceContext?: QueueTraceContext;
  readonly result?: { code?: ResponseCode; message?: string; data: unknown; raw?: boolean };
}

export type Stage<TIn extends PipelineContext, TOut extends PipelineContext> =
  (ctx: TIn, deps: PipelineDeps) => Promise<TOut>;

export class PipelineShortCircuit extends Error {
  constructor(public readonly data: unknown) { super('pipeline short-circuit'); }
}

export class PipelineRunner {
  constructor(private readonly stages: readonly Stage<PipelineContext, PipelineContext>[]);
  async run(initial: PipelineContext, deps: PipelineDeps): Promise<unknown>;
}

export const DEFAULT_STAGES: readonly Stage<PipelineContext, PipelineContext>[];

// Each individual stage exported by name for consumer composition
export { extractParams } from './stages/extract-params';
export { mergeMultipart } from './stages/merge-multipart';
// ... 11 more
```

`ApiController` gains one additional public method:

```ts
public setStageOverride(name: StageName, stage: Stage<PipelineContext, PipelineContext>): void;
```

`StageName` is a literal-union of the 13 default-stage names. Override replaces the stage in `DEFAULT_STAGES` at registration time.

## Runner semantics

```ts
class PipelineRunner {
  async run(initial: PipelineContext, deps: PipelineDeps): Promise<unknown> {
    let ctx: PipelineContext = initial;
    try {
      for (const stage of this.stages) {
        ctx = await stage(ctx, deps);
      }
      return (ctx.result?.code !== undefined)
        ? { success: true, code: ctx.result.code, message: ctx.result.message, data: ctx.result.data }
        : ctx.result?.data;
    } catch (err) {
      if (err instanceof PipelineShortCircuit) {
        return err.data;
      }
      throw translateError(err, ctx, deps); // stage 12, called directly here
    } finally {
      await cleanup(ctx, deps); // stage 13, always runs
    }
  }
}
```

Note: stages 12 (`translateError`) and 13 (`cleanup`) are NOT in the `stages` array — they're hard-wired into the runner's `catch` and `finally` because their semantics demand it. The `DEFAULT_STAGES` constant has 11 entries (stages 1–11). Stages 12 and 13 are exported individually for consumer use but not composable into the linear pipeline.

## Phased landing (5 PRs)

Each PR independently mergeable + reverts cleanly if regression appears.

### PR-1 — Pipeline scaffolding (no behaviour change)

**Branch**: `feat/wave-27-p1-pipeline-scaffolding`

- Add `pipeline/types.ts`, `pipeline/runner.ts`, `pipeline/index.ts`
- Add `pipeline/stages/translate-error.ts` and `pipeline/stages/cleanup.ts` (the hardwired ones)
- Add `pipeline/default-stages.ts` (empty array initially — placeholders)
- Add `PipelineRunner.test.ts` + `translate-error.test.ts` + `cleanup.test.ts`
- Wire `package.json` exports `./pipeline` subpath
- `ApiController._createActionSchema` UNCHANGED — runner is dormant
- Bump: **patch** (no behaviour change, new exports unused internally)

**AC**: typecheck green; `pnpm --filter @gertsai/api-core test` green; m9s-example unchanged.

### PR-2 — Stages 1–5 (pre-handler)

**Branch**: `feat/wave-27-p2-pre-handler-stages`

- Add 5 stage files + tests: `extract-params`, `merge-multipart`, `coerce-query-string`, `inject-tenant-id`, `validate-request`
- ≥5 unit tests per stage (~25 total)
- `_createActionSchema` REFACTORED: stages 1–5 replaced by `await runStagesSerially([stage1..stage5], ctx, deps)`; stages 6–13 still inline
- Add m9s-example smoke comparison: hash response of 5 reference endpoints before/after — assert byte-identical
- Bump: **patch** (no public surface change yet on default behaviour)

**AC**: typecheck + tests + m9s-example real-infra smoke all green; byte-identical reference endpoint responses.

### PR-3 — Stages 6–8 (handler invocation)

**Branch**: `feat/wave-27-p3-handler-stages`

- Add 3 stage files + tests: `establish-auth-session`, `build-trace-context`, `invoke-handler`
- ≥5 tests per stage (~15 total) — including auth-required negative path, traceparent format assertion, addJob trace-context injection
- `_createActionSchema` REFACTORED: stages 1–8 replaced; stages 9–13 still inline
- Re-run m9s-example smoke
- Bump: **patch**

**AC**: typecheck + tests + smoke; trace-context injection into queued jobs verified.

### PR-4 — Stages 9–11 (response handling) + PipelineRunner integration

**Branch**: `feat/wave-27-p4-response-stages`

- Add 3 stage files + tests: `raw-response-shortcut`, `validate-response`, `wrap-response`
- ≥5 tests per stage (~15 total) — including raw-mode shortcut, strict-vs-loose response validation, code-fallback chain
- `_createActionSchema` REFACTORED: full `new PipelineRunner(DEFAULT_STAGES).run(initial, deps)` orchestrator (≤20 LOC)
- Drop inline stages 9–13 from controller
- Drop `runStagesSerially` helper introduced in PR-2 (was a temporary bridge)
- Bump: **minor** (additive `@gertsai/api-core/pipeline` exports now reachable to consumers via the documented subpath)

**AC**: typecheck + tests + m9s-example smoke + perf benchmark within +2% p95.

### PR-5 — `setStageOverride` public API + cleanup

**Branch**: `feat/wave-27-p5-stage-override`

- Add `ApiController.setStageOverride(name, stage)` public method + test
- Document custom-pipeline composition in `packages/api-core/README.md`
- Remove `_createActionSchema`'s remaining `@ts-ignore` annotations that are no longer needed (only those whose targets moved into typed stages)
- Bump: **patch** (additive `setStageOverride` is the only public surface change; documented)

**AC**: typecheck + tests; README example compiles via tsx.

## Bench plan (PR-4 gate)

`packages/api-core/src/lib/controller/pipeline/__bench__/pipeline-runner.bench.ts`:
- Synthetic action that does `await new Promise(r => setTimeout(r, 0))` (zero-work handler)
- 100k iterations, measure p50/p95/p99 of `runner.run(...)`
- Pre-extraction baseline: capture in PR-1 (snapshot the current closure's iteration time via a temporary `closureBench.bench.ts` then delete in PR-4)
- Post-extraction gate: p95 ≤ baseline × 1.02

If p95 exceeds the gate: investigate, optimise stage glue (e.g., avoid re-allocating ctx object on no-op stages), do NOT merge PR-4 until passes.

## Migration / rollback

- Each PR independently revertible by `git revert <merge-sha>` — no schema, no migration, pure code.
- Published `@gertsai/api-core` versions after PR-1..3 (`patch` bumps): no semver risk, consumers unaffected.
- After PR-4 (`minor`): `@gertsai/api-core@<NEXT>.0` exports `/pipeline` subpath. To roll back: delete the subpath entry from `package.json` exports + publish `@gertsai/api-core@<NEXT+1>.0` with the subpath removed. Document in changeset.
- Bug discovered post-merge in production: hot-fix by `setStageOverride` to inject a patched stage, OR full revert via fresh patch release.

## Validation

- `pnpm typecheck` workspace-wide 0 errors after each PR
- `pnpm --filter @gertsai/api-core test` green per PR
- m9s-example `pnpm --filter @gertsai-examples/m9s-example test:real-infra` green after PR-2/3/4/5
- Manual curl spot-check on 3 reference endpoints after PR-4: identical responses (byte-compared via diff)
- Bench p95 gate after PR-4 (see above)

## Refs

- PRD-065 (parent — Wave 27 scope)
- SPEC-021 (13-stage contract — frozen behaviour)
- ADR-015 (pipeline pattern choice — typed Stage<TIn,TOut>)
- EVID-067 (Wave 15.A/B/C — queue/pubsub extraction precedent)
- `packages/api-core/src/lib/controller/ApiController.class.ts:722-915` (verbatim source)


