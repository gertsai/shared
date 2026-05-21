---
depth: standard
id: ADR-015
kind: adr
last_modified_at: 2026-05-21T05:08:29.559138+00:00
last_modified_by: claude-code/2.1.145
status: draft
title: ADR — pipeline pattern choice for ApiController extraction
---

# ADR-015: Pipeline pattern choice for ApiController extraction

| Field | Value |
|-------|-------|
| Status | Proposed |
| Date | 2026-05-21 |
| Deciders | gogocat (maintainer), team-lead orchestrator (planning phase) |
| Parent | PRD-065 (Wave 27) |

## Context

Extracting the 193-LOC `_createActionSchema` closure into testable units requires picking a composition pattern. Three viable options surveyed:

### Option A — Express-style middleware (`(ctx, next) => next()`)

Classical Connect/Express middleware: each stage receives `next` and decides whether to call it. Composable, well-understood, ubiquitous in Node.

**Pros**: zero learning curve; supports short-circuit (skip downstream stages); preserves the closure's `try/finally` cleanup pattern natively.
**Cons**: callback-of-callback typing is poor; `next` parameter introduces an extra indirection that obscures stage data flow; consumer must remember to call `next` (forgetting silently breaks the chain).

### Option B — Typed `Stage<TIn, TOut>` functional pipeline

Each stage is `(ctx: TIn, deps: Deps) => Promise<TOut>`. The runner `await`s stages sequentially, typing the output of stage N as input to stage N+1. No `next` callback — data flows by return value.

**Pros**: full TS inference of inter-stage types; impossible to forget invoking the next stage (it's the runner's job); explicit `try/finally` lives in the runner once, not duplicated in each stage; easier to mock individual stages for unit tests (no `next` to stub).
**Cons**: more boilerplate for short-circuit (must throw a sentinel error or return a discriminated union); type-system complexity scales with stage count (13 stages → 13 nested generic types).

### Option C — Class-based template method (`abstract handle(ctx)` + concrete subclasses)

`ActionPipeline` base class with `protected abstract` methods for each stage; runner walks them via `for...of stagesList`.

**Pros**: matches `ApiController`'s existing class-based shape (familiar); easy to subclass for full-pipeline replacement.
**Cons**: anti-pattern in modern Node (functional pipelines preferred over class hierarchies); subclassing requires consumers to extend a class, which couples downstream code to `@gertsai/api-core` internals; testing requires instantiation boilerplate per case.

## Decision

**Choose Option B (typed `Stage<TIn, TOut>` functional pipeline).**

The pipeline runner becomes:

```ts
type Stage<TIn, TOut> = (ctx: TIn, deps: PipelineDeps) => Promise<TOut>;

class PipelineRunner {
  constructor(private stages: readonly Stage<unknown, unknown>[]) {}
  async run(initial: unknown, deps: PipelineDeps): Promise<unknown> {
    let ctx = initial;
    try {
      for (const stage of this.stages) {
        ctx = await stage(ctx, deps);
      }
      return ctx;
    } catch (err) {
      // Stage 12 (translateError) is invoked here
      throw translateError(err);
    } finally {
      // Stage 13 (cleanup) is invoked here
      await cleanup(ctx, deps);
    }
  }
}
```

Each individual stage is a standalone exported function with its own JSDoc, unit tests, and (when relevant) reference to the verbatim `ApiController.class.ts:NNN-MMM` lines being preserved.

Public API: `@gertsai/api-core/pipeline` subpath exports `PipelineContext`, `Stage<TIn, TOut>`, `PipelineRunner`, plus all 13 default stages so consumers can re-compose with overrides.

## Consequences

### Positive
- **Type-safe stage composition**: stage N's output type must match stage N+1's input type, caught at compile time
- **Per-stage unit tests** without `next` callback mocking
- **Pure-function-friendly**: most stages have no side effects (extract, coerce, validate are pure); only stages 6 (auth/session), 7 (trace), 8 (invoke), 13 (cleanup) have I/O
- **Minor bump for `@gertsai/api-core`** (additive exports, no signature changes on public API)
- **Future stages** (request-id, OTel span, rate-limit, audit) become "add a function file + register in default stages list" — no Controller surgery

### Negative
- **Short-circuit verbosity**: stage that wants to bypass downstream (e.g., `raw-response-shortcut` at stage 9) must throw a sentinel (`PipelineShortCircuit extends Error`) that the runner catches and returns the carried result. ~10 LOC of runner glue.
- **Type-system complexity**: 13 stages threaded through `Stage<T1, T2> | Stage<T2, T3> | ...` produce nested type names in error messages. Mitigated by named intermediate types (`AfterExtractParams`, `AfterValidation`, etc.).
- **No native `next` for "around" middleware**: a stage that wants to wrap downstream (e.g., a tracing-span stage that opens before and closes after) can't directly. Mitigated by `PipelineRunner.runScoped(beforeStages, mainStages, afterStages)` overload if a future wave needs it — not built in Wave 27.

### Neutral
- **Naming**: stages live in `packages/api-core/src/lib/controller/pipeline/stages/<kebab-case>.ts`. Runner + types live in `pipeline/runner.ts` + `pipeline/types.ts`. Same nesting depth as the rest of `api-core`.

## Alternatives considered and rejected

- **Option A (Express middleware)**: rejected for poor type inference + risk of forgotten `next()`. Industry has been migrating away from this pattern (Hono, Elysia, Effect.js all use typed pipelines).
- **Option C (class template)**: rejected for downstream coupling + anti-pattern. We'd be putting `@gertsai/api-core` consumers into an OO-extension-of-internals shape we'd later regret.
- **Effect.ts / fp-ts pipelines**: rejected — adds heavy peer dependency on FP libraries for a single-purpose feature; the team has no documented FP convention; one-off use would create stylistic inconsistency.

## Rollback

Pipeline extraction can be **fully reverted** by re-inlining the 13 stages back into `_createActionSchema`. The `Stage<TIn, TOut>` exports become unused (`tsup` tree-shakes them out for consumers; we'd remove the subpath export in a minor bump back). No data migration, no schema change, no published-version constraint — pure code refactor.

## Refs

- PRD-065 (Wave 27 — parent)
- SPEC-021 (13-stage contract)
- RFC-027 (extraction strategy + phased landing)
- EVID-067 (Wave 15.A/B/C — queue/pubsub extraction precedent for pattern)
- ADR-003 (Platform Runtime Boundaries — subpath conventions)
- Hub-ADR-011 (api-core invariants preserved)


