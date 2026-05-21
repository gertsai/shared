---
depth: standard
id: PRD-065
kind: prd
last_modified_at: 2026-05-21T05:07:43.334377+00:00
last_modified_by: claude-code/2.1.145
links:
- target: SPEC-021
  relation: refines
- target: RFC-027
  relation: refines
- target: ADR-015
  relation: refines
status: draft
title: Wave 27 — extract ApiController action pipeline into composable stages
---

# PRD-065: Wave 27 — extract ApiController action pipeline into composable stages

| Field | Value |
|-------|-------|
| Status | Draft |
| Depth | Deep |
| Created | 2026-05-21 |
| Parent | Wave 15.D (long-deferred from Wave 15 plan) |
| Risk | HIGH blast-radius (api-core consumed by all webapps + m9s-example) |
| Estimated effort | 1–2 days (extraction + tests + regression run) |

## Problem Statement

`packages/api-core/src/lib/controller/ApiController.class.ts` is a **1178-LOC class** with one anonymous-function method (`_createActionSchema`, lines 722–915 = **193 LOC** inside one closure) that does **13 sequential things**:

1. Extract `params` / `file` / `fileMeta` from `ctx.meta.$params` vs `ctx.params`
2. Merge `ctx.meta.$multipart` into params
3. Query-string coercion (`smartCoerce` / `coerceQueryParams` per legacy vs typia format)
4. Auto-inject `meta.tenantId` into params
5. Run typia validator + throw `APIError(BAD_REQUEST__INVALID_PARAMS)` on failure
6. Auth check + session creation (`auth: 'required' | 'optional' | 'none'`)
7. Build W3C trace context (`buildTraceparent`)
8. Invoke `action.options.handler` with the assembled deps
9. Early-return for raw streaming responses
10. Run response validator + maybe throw `APIError(BAD_REQUEST__INVALID_RESPONSE)` (strict mode)
11. Wrap result in `{ success, code, message, data }` envelope
12. Error translation: `APIError` passthrough, Orchestra-flagged error fromJSON, generic Error fromError, unknown → `INTERNAL_ERROR`
13. `finally` log + `session.$destroy()`

This shape is the **single largest source of cognitive load** in `@gertsai/api-core`. Symptoms surfaced during prior audits (EVID-044 §api-core, EVID-051 §api-core, EVID-067 §15.A/B/C):
- New cross-cutting concerns (e.g., observability spans, request-context binding, rate-limiting hooks) require editing the 193-LOC closure — high regression risk per change
- The closure has **no unit tests** — only end-to-end tests through m9s-example exercise it
- The closure shadows `this` (it's a Moleculer service runtime context), forcing `_createActionSchema` to use a `function () { ... }` literal — modern arrow-style stages would let us preserve typed scope explicitly
- The closure intermingles ApiController-private state (`_config`, `_logger`, `_options`) with per-request lookups, making blast-radius hard to reason about

Wave 15.A/B/C already extracted queue/pubsub/workflow concerns into sibling packages (`@gertsai/api-queue`, `@gertsai/api-pubsub`). The action pipeline is the last untouched piece of the original Wave 15 plan — hence "15.D".

## Target Audience

- **Primary**: `@gertsai/api-core` maintainers (gertsai/shared). The extraction simplifies all future API-side feature work — adding a new stage (e.g., per-action OTel span, request-id propagation, rate-limit gate) becomes "add a new stage file" rather than "edit the 193-LOC closure and pray nothing regresses".
- **Secondary**: downstream consumers of `@gertsai/api-core` (m9s-example today; arbitrary future webapps tomorrow). They get a documented, testable contract on each stage they can override via composition.
- **Tertiary**: external OSS reviewers reading the codebase pre-v1.0. The current 193-LOC closure is a notable rough edge that reflects the codebase's pre-extraction history; cleaning it up signals maturity.

## Goals / Success Criteria

- Extract the 193-LOC `_createActionSchema` closure into **13 named stage functions** in `packages/api-core/src/lib/controller/pipeline/`
- Provide a **typed `PipelineRunner`** that orchestrates stages in order, threading a typed `PipelineContext` through them
- Preserve **identical externally-observable behaviour** — same `APIError` codes, same response envelope shape, same trace-context propagation, same finally-cleanup
- Add **per-stage unit tests** (currently zero) — target ≥5 tests per stage = ~65 new test cases
- Keep `ApiController` public API **unchanged** (`register`, `registerQueue`, `subscribe`, `generateServiceSchema`, lifecycle handlers) — internal-only refactor
- Workspace-wide `pnpm typecheck` 0 errors
- m9s-example **real-infra smoke** (Postgres+Redis+NATS+OpenFGA) passes — confirms end-to-end behaviour preserved
- Apply patch-bump-compatible scope (no exported symbol renames, no signature changes on public API) — `@gertsai/api-core` minor bump only because of new exported `Stage<T>` / `PipelineContext<T>` types (additive)

## Functional Requirements

### Public surface (additive, no breaks)

- **FR-1** — `@gertsai/api-core` exports a new submodule `@gertsai/api-core/pipeline` with:
  - `interface PipelineContext` — carries per-request mutable state through stages
  - `type Stage<TIn, TOut>` — `(ctx: PipelineContext, deps: Deps) => Promise<PipelineContext>` signature
  - `class PipelineRunner` — `.run(stages: Stage[], initial: PipelineContext) → Promise<Result>`
  - Re-exports of the 13 default stages so consumers can compose custom pipelines
- **FR-2** — `ApiController._createActionSchema` becomes a 1-line `new PipelineRunner(DEFAULT_STAGES).run(...)` orchestrator
- **FR-3** — `ApiController.setStageOverride(name, stage)` — public method to override a single named stage (e.g., consumer wants to inject a request-id header stage before validation)

### Stage extraction (private, per-stage)

Each FR-S-N matches one of the 13 stages identified in Problem Statement. Per stage:

- Move closure body to `pipeline/stages/<stage-name>.ts`
- Export named function with typed `Stage<PipelineContextBeforeStage, PipelineContextAfterStage>` signature
- Add JSDoc explaining the stage's contract + cross-references to EVID-080 hardening notes (where applicable)
- Add ≥5 unit tests per stage in `pipeline/stages/<stage-name>.test.ts`

Stages (FR-S-1..FR-S-13):

1. **FR-S-1** — `extractParams` (lines 730–746): params/file/fileMeta resolution from `ctx.meta.$params` vs `ctx.params`
2. **FR-S-2** — `mergeMultipart` (lines 748–750): `Object.assign(params, ctx.meta.$multipart)`
3. **FR-S-3** — `coerceQueryString` (lines 753–774): legacy `coerceQueryParams` vs new typia `smartCoerce` per rest method
4. **FR-S-4** — `injectTenantId` (lines 779–782): auto-pop tenantId from meta into params
5. **FR-S-5** — `validateRequest` (lines 785–790): typia validator + APIError throw
6. **FR-S-6** — `establishAuthSession` (lines 792–806): auth-required check + sessionFactory call
7. **FR-S-7** — `buildTraceContext` (lines 808–820): W3C traceparent via `@gertsai/otel`
8. **FR-S-8** — `invokeHandler` (lines 821–848): the central `action.options.handler.call(...)` with assembled deps
9. **FR-S-9** — `raw-response-shortcut` (lines 850–852): early-return for streaming responses
10. **FR-S-10** — `validateResponse` (lines 854–880): config.RESPONSE_VALIDATION + strict mode
11. **FR-S-11** — `wrapResponse` (lines 882–890): final envelope construction
12. **FR-S-12** — `translateError` (lines 892–908): APIError / Orchestra-flagged / generic / unknown
13. **FR-S-13** — `cleanup` (lines 909–913): finally log + `session.$destroy()`

### Pipeline contract

- **FR-4** — Each stage receives the prior stage's `PipelineContext` and returns a new (or mutated-with-care) `PipelineContext`. Type-system enforces stage ordering.
- **FR-5** — Stage failure throws — pipeline runner catches via outer try/finally, hands to `translateError` stage, then cleanup. Identical behaviour to current monolith.
- **FR-6** — Stages are **pure with respect to their inputs** except for explicitly-marked I/O stages (`buildTraceContext`, `invokeHandler`). Easier to unit-test.

## Non-functional Requirements

- **Performance**: extracted pipeline must NOT add measurable latency. Target: p95 increase ≤2% on m9s-example synthetic load test (matches Wave 11.A perf baseline EVID-038).
- **Bundle size**: `@gertsai/api-core` dist size delta ≤+5% (extraction adds named exports; tsup tree-shakes unused).
- **Test coverage**: ≥65 new unit tests (≥5 per stage × 13 stages). End-to-end via m9s-example real-infra smoke unchanged.
- **Type safety**: stage signatures must compile under `strict: true`. No `any` introduced; existing `any` in legacy closure (e.g., `@ts-ignore` on `__ORCHESTRA_ERROR__` duck-type) is preserved verbatim per Wave 27 non-goal (don't tighten types as part of extraction — separate wave).
- **Versioning**: `@gertsai/api-core` **minor bump** (additive public exports). All consumers stay binary-compatible.

## Acceptance Criteria

- [ ] All 13 stages extracted into separate files under `packages/api-core/src/lib/controller/pipeline/stages/`
- [ ] `PipelineContext` + `Stage<TIn, TOut>` + `PipelineRunner` exported from `@gertsai/api-core/pipeline`
- [ ] `ApiController._createActionSchema` reduced from 193 LOC to ≤20 LOC orchestrator
- [ ] ≥65 new unit tests (≥5 per stage) — all green
- [ ] m9s-example real-infra smoke (`pnpm --filter @gertsai-examples/m9s-example test:real-infra`) — all green
- [ ] m9s-example REST endpoint suite — manual curl spot-check on 3 endpoints (GET auth/me, POST content/create, GET stream/events) — identical responses pre vs post
- [ ] `pnpm typecheck` 0 errors
- [ ] Bundle-size delta verified `pnpm --filter @gertsai/api-core build` then `wc -c dist/index.js` before vs after — ≤+5%
- [ ] Changeset with **minor** bump for `@gertsai/api-core` + comprehensive behaviour-preservation note
- [ ] EVID-083 (proof) created + linked `informs` PRD-065 + activated with R_eff > 0.5

## Out of Scope

- **Type-safety tightening** — `any` and `@ts-ignore` in legacy closure preserved verbatim. Separate Wave 29+ deals with this.
- **Adding new stages** (request-id, OTel spans, rate-limit gates) — extraction-only. New stages come in future waves once the pipeline contract is stable.
- **Refactoring `_createQueueSchema` / `_createSubscriberSchema`** — already extracted to sibling packages in Wave 15.B/C. No action.
- **Refactoring lifecycle handlers** (`addStartedHandler` / `addStoppedHandler`) — these are a separate "service lifecycle" concern, not part of the action pipeline.
- **Replacing typia with another validator** — typia stays.
- **Replacing Moleculer** — Moleculer stays (extraction targets the action handler shape, not the underlying broker).

## Risks

- **HIGH blast radius**: api-core is consumed by all webapps + m9s-example. A subtle behaviour change (e.g., trace-context ordering, error envelope shape) would cascade.
  - **Mitigation 1**: per-stage unit tests catch behaviour drift at the stage level before integration.
  - **Mitigation 2**: m9s-example real-infra smoke catches integration drift end-to-end.
  - **Mitigation 3**: extracted stages get JSDoc with `// PRESERVED VERBATIM from ApiController.class.ts:NNN-MMM` line ranges so future-self knows what NOT to "improve".
- **MEDIUM `this`-binding loss**: current closure uses `function () { ... }` to capture Moleculer's `this`-bound service. Extracted stages will receive `this` via explicit `deps.service` instead. Risk: a consumer that relied on a custom binding shape breaks.
  - **Mitigation**: extracted `invokeHandler` stage preserves the original `handler.call(this, deps)` invocation shape verbatim; only the surrounding orchestrator changes.
- **LOW perf regression**: stage-function calls + context-object copying could in theory add overhead. In practice: V8 inlines + the request path is I/O-bound (broker dispatch, DB calls).
  - **Mitigation**: benchmark via m9s-example synthetic load test; reject if p95 > +2%.
- **LOW changeset confusion**: minor bump (not patch) because new exports are additive. Consumers reading "@gertsai/api-core@0.6.0 → 0.7.0" might expect breaking changes; changeset body explicitly clarifies additive-only.

## Decision Points (require user review before code phase)

- **DP-1**: Approve minor bump for `@gertsai/api-core` (additive new exports). Alternative: keep stages module-internal (not exported) → patch bump, but locks out consumers from custom pipeline composition.
- **DP-2**: Approve "preserve all `any` / `@ts-ignore` verbatim" non-goal. Alternative: opportunistic type-tightening during extraction → adds risk surface (each `any` removal could change behaviour).
- **DP-3**: Approve "no new stages this wave" non-goal. Alternative: bundle request-id + OTel span stages → larger scope, higher risk per landing.
- **DP-4**: Approve "single PR" vs "phased landing" (5 PRs: P1 PipelineRunner + types, P2 stages 1-5 extract, P3 stages 6-10 extract, P4 stages 11-13 extract, P5 cleanup ApiController). Phased landing reduces blast-radius per merge but increases total churn (more changesets, more CI runs). Recommended: **phased**.

## Related Artifacts

| Artifact | Relation |
|----------|----------|
| SPEC-020 | based_on (scope freeze for Wave 27) |
| RFC-027 | refines (extraction strategy + stage interface design) |
| ADR-015 | refines (architectural decision: middleware vs typed-stage pipeline) |
| EVID-067 | informs (Wave 15.A/B/C precedent — queue/pubsub extraction baseline) |
| EVID-044 | informs (api-core audit baseline) |
| EVID-051 | informs (api-core post-Wave-12 audit) |
| ADR-003 | informs (Platform Runtime Boundaries — subpath conventions) |
| Hub-ADR-011 | informs (api-core invariants — preserved) |




