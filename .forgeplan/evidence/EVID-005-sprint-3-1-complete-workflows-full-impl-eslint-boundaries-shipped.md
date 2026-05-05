---
depth: standard
id: EVID-005
kind: evidence
last_modified_at: 2026-05-05T19:22:09.009875+00:00
last_modified_by: claude-code/2.1.128
links:
- target: SPEC-003
  relation: informs
- target: RFC-001
  relation: informs
- target: PRD-001
  relation: informs
- target: ADR-002
  relation: informs
- target: ADR-003
  relation: informs
status: active
title: Sprint 3.1 complete — workflows full impl + ESLint boundaries shipped
---

# EVID-005: Sprint 3.1 complete — workflows full impl + ESLint boundaries shipped

## Structured Fields

verdict: supports
congruence_level: 3
evidence_type: measurement

## Summary

Sprint 3.1 (SPEC-003) implementation завершён через AgentTeams pattern. 3 phases, 4 unique workers (3 parallel Phase A + 1 sequential Phase B), team-lead solo Phase C. All 8 W-items (W-1..W-8) acceptance met. RFC-001 amendment 2026-05-05 (Option a — schema-build seam, не addStartedHandler) implemented as designed.

**Branch**: `feat/api-core-decomposition` (Sprint 2 + Sprint 3.0 + Sprint 3.1 combined; 10 commits ahead of `main`).

## Measurement

| Check | Result |
|-------|--------|
| `pnpm install --frozen-lockfile` | ✅ clean (lockfile consistent) |
| `pnpm build` | ✅ 14 packages + m9s-example (dual ESM+CJS emit) |
| `pnpm test` | ✅ **4048 passed / 103 skipped** (= Sprint 3.0 baseline; 0 regression) |
| `pnpm typecheck` | ✅ green (all 14 + m9s-example) |
| `pnpm run lint` | ✅ All good (eslint --max-warnings 0) |
| `pnpm run publint` | ✅ All good (api-core, api-rlr, auth-openfga, hsm) |
| `pnpm run depcruise` | ✅ 0 violations (98 modules, 192 deps cruised) |
| `pnpm dlx eslint examples/m9s-example/src` | ✅ 0 errors (boundaries enforced) |
| `pnpm run attw` | ⚠️ known: `@gertsai/core` /rag /llm Node10 resolution failed — non-blocker, deferred (carried over from Sprint 3.0; tracked for Sprint 3.2+) |

## Implementation evidence per task

### W-1: `@gertsai/core` WorkflowDefinition.params (Phase A1, e830ae6)
`packages/core/src/workflow/types.ts`: added `readonly params?: object` to `WorkflowDefinition<TInput, TOutput>` interface. JSDoc explains intent (fastestValidator schema for runtime adapters). Non-breaking — older definitions remain valid.

### W-2: adapter.ts (Phase A1, e830ae6)
`packages/api-core/src/moleculer/workflow/adapter.ts` (NEW, 47 LOC): exports `MoleculerWorkflowSchema` interface + `adaptWorkflowDefinition<I,O>(name, def)`. Synthesized handler:
- extracts `runId` from `ctx.id` (deterministic stamp fallback),
- threads `AbortSignal` from `ctx.locals.abortSignal` (fresh `AbortController` fallback),
- forwards `ctx.params as I` into neutral handler.

### W-3: setWorkflows full impl (Phase A1, e830ae6)
`packages/api-core/src/moleculer/workflow/setWorkflows.ts` REWRITE: replaces experimental stub. Iterates registration map and feeds adapted schemas through controller's `_registerWorkflow` hook. Throws on null/non-object input. Old `console.warn('experimental')` removed.

Barrel `index.ts` extended: exports `setWorkflows`, `adaptWorkflowDefinition`, types `MoleculerWorkflowSchema`, `WorkflowRegistration`, `ApiControllerInternalHook`.

### W-4: ApiController hooks (Phase A1, e830ae6, RFC-001 amendment Option a)
`packages/api-core/src/lib/controller/ApiController.class.ts`:
- private `_pendingWorkflows: Map<string, MoleculerWorkflowSchema>` storage.
- public `_registerWorkflow(name, schema)` (annotated `@internal`).
- private `_attachWorkflowsToServices(synthSchema)` — appends `workflows` block to synthesized service schema.
- Wire-up: inside `generateServiceSchema()` return path (`ApiController.class.ts:1460`), adjacent to existing channels attachment site (`L1027-1029`). Tagged with `// RFC-001 amendment 2026-05-05: workflow attach (Option a)`.

Schema-build seam chosen over `addStartedHandler` — `@moleculer/workflows` middleware reads `schema.workflows` at `broker.createService(schema)`; handlers run after that, too late.

### W-5: createMoleculerConfig workflows option (Phase A1, e830ae6)
`packages/api-core/src/moleculer/moleculerConfig.template.ts`:
- `CreateMoleculerConfigOpts` exported with optional `workflows?: { eventLogStore?, redis?, [k:string]:unknown }`.
- Function gains optional 2nd arg `opts: CreateMoleculerConfigOpts = {}` (back-compat).
- Lazy `require('@moleculer/workflows')` only when `opts.workflows` is set; pushes its `Middleware(opts.workflows)` into config middlewares.

Optional peerDep behavior preserved: middleware not loaded when option absent.

### W-6: IngestProcessWorkflow application layer (Phase B, 7d20ae8)
`examples/m9s-example/src/application/IngestProcessWorkflow.ts` (NEW, 152 LOC): pure `WorkflowDefinition<IngestProcessInput, IngestProcessResult>` via DI factory `createIngestProcessWorkflow({useCase})`. ESLint boundaries forbid Moleculer/infrastructure imports — delegation goes through `IngestDocumentUseCase.execute(...)`. Behavioural parity preserved (chunking, persistence order, idempotency, `'completed' | 'skipped-empty'` status).

### W-7: m9s-example wires controller.setWorkflows (Phase B, 7d20ae8)
`services/ingest/lifecycle.ts`: imports `setWorkflows` from `@gertsai/api-core/moleculer`; constructs `ingestUseCase` once at module load (shared infrastructure singleton), registers `{ 'process': createIngestProcessWorkflow({useCase: ingestUseCase}) }` before lifecycle handler. Same useCase reused inside addStartedHandler — identical instance.

`src/index.ts`: removes `IngestWorkflowService` import + array entry. `services/workflows/ingest-process.workflow.ts` DELETED (-181 LOC); empty `services/workflows/` directory removed. Action `start-workflow.action.ts` updated: `broker.wf.run('v1.ingest.process', ...)` (was `'wf-ingest.ingest.process'`) — reflects new `<svc.fullName>.<wf.name>` composition.

### W-8: eslint-plugin-boundaries (Phase A3, e830ae6)
Root `eslint.config.mjs` (flat config) extended:
- Plugin `eslint-plugin-boundaries@6.0.2` (already devDep root from prior session).
- Scope `examples/m9s-example/src/**/*.{ts,tsx}` with TS parser (scoped — keeps Sprint 3.0 lint baseline green).
- Layer descriptors mirror `.dependency-cruiser.cjs`: domain / application / infrastructure / services / lib / mol-services / composition.
- `boundaries/dependencies` rule (v6 object-form selectors) deny-by-default. Layer matrix tightened vs SPEC-003 snippet to match actual dep-cruiser rules (e.g. `services` does NOT allow direct `infrastructure`; intra-layer self-allows added because boundaries is deny-by-default).
- Settings include `import/resolver.node.extensions` (.ts/.tsx/.js/.cjs/.mjs) — without explicit ext list, boundaries' default node resolver flags every TS dep `isUnknown:true` and rules silently pass.
- Sanity-checked actively enforced: synthetic `domain → infrastructure` and `services → infrastructure` violations both raised errors during validation.

## Convergent audit-pre-sprint-3-1 findings — ALL CLOSED

All 10 critical/major findings were resolved in Sprint 3.0 (EVID-004). Sprint 3.1 verifies no regression and adds the implementation that the audit assumed would land:

| Finding | Status after Sprint 3.1 |
|---------|--------------------------|
| F-3 ApiController hook integration gap | ✅ Implemented per RFC-001 amendment Option (a). Schema-build seam, not addStartedHandler. |
| F-3 contracts side-effect (diagnostics) | ✅ Stayed clean (registry size = 0 without explicit registration; 12 after `registerBuiltinDiagnostics()`). |
| F-1 missing `@moleculer/workflows` peerDep | ✅ Stayed declared; lazy `require` confirms optional behavior — middleware not loaded when `opts.workflows` is absent. |
| M-1 ESLint dead config | ✅ Now actively enforces hex-layer rules over m9s-example. |

## Decisions made during Sprint 3.1

- **Wire-up site**: chose `generateServiceSchema()` return path (schema-build) over `addStartedHandler`. RFC-001 amendment Option (a) was framed as "addStartedHandler-based attachment", but during W-4 implementation it became clear that handlers run after `broker.createService(schema)`, by which time `@moleculer/workflows` has already missed `schema.workflows`. Schema-build is the correct seam. Documented inline + in commit message.
- **m9s-example handler strategy**: pure delegation via DI factory (rather than ctx-coupled wrapper). ESLint boundaries enforce `application/` cleanliness. Two-step embed/store journaling (was `ctx.call('_embed')` / `ctx.call('_store')`) collapsed into single use-case execution — re-introduce when `WorkflowSignal` grows step API. Behavioural parity preserved.
- **`WorkflowRegistration` type ownership**: pre-existing `workflow/types.ts` had it; W-3 spec required declaration in `setWorkflows.ts`. Moved canonical declaration to `setWorkflows.ts` and reduced `types.ts` to placeholder (`export {}` + comment) to avoid duplicate-export collision in barrel. Net public surface unchanged.
- **W-8 layer matrix tightened**: SPEC-003 snippet allowed `services → infrastructure`, but `.dependency-cruiser.cjs` enforces `no-services-to-infrastructure-direct: error` (services wire infra via composition root). Boundaries config follows dep-cruiser, not SPEC snippet.

## Commits на feature branch (Sprint 3.1)

```
7d20ae8 feat(m9s-example): Sprint 3.1 Phase B — workflow migration to setWorkflows (W-6, W-7)
e830ae6 feat(core,api-core): Sprint 3.1 Phase A — workflows full impl + ESLint boundaries (W-1..W-5, W-8)
612b46b docs(forgeplan): Sprint 3.0 Phase 5 — EVID-004 + activations + state
2a3767d fix(api-core): Sprint 3.0 Phase 4 — convergent audit fixes (U-10..U-12)
a5897d6 chore(monorepo): Sprint 3.0 Phase 3 — license + files + CI gates (U-7, U-8, U-9)
b50b854 feat(monorepo): Sprint 3.0 Phase 1+2 — unified tsup dual ESM+CJS migration (U-1..U-6)
```

## AgentTeams metrics (Sprint 3.1)

- 3 phases (Phase A 3∥ + Phase B 1 sequential + Phase C team-lead solo).
- 4 unique workers: core-and-setworkflows-worker (W-1, W-2, W-3); controller-extender (W-4, W-5); eslint-boundaries-worker (W-8); m9s-workflow-migrator (W-6, W-7).
- Wall-clock ~30 минут (Phase A 3∥ ~7 min; Phase B ~7 min; Phase C verify+commits ~8 min).
- Disjoint file scope: 0 merge conflicts.
- Emergent worker decisions:
  - core-and-setworkflows-worker reduced `workflow/types.ts` to placeholder to avoid duplicate-export collision with `setWorkflows.ts` (justified, net surface unchanged).
  - controller-extender chose schema-build seam over addStartedHandler (justified, technically required for `@moleculer/workflows`).
  - eslint-boundaries-worker tightened layer matrix vs SPEC snippet to match `.dependency-cruiser.cjs` (justified, parity is the goal).
  - m9s-workflow-migrator collapsed two-step journaling into single use-case execution (justified, boundaries cleanliness; deferred re-introduction documented as TODO).

## Verdict rationale

`supports` SPEC-003 + RFC-001 + PRD-001 + ADR-002 + ADR-003:
- All 8 acceptance check-boxes (W-1..W-8) met.
- Zero test regressions (4048 passed = Sprint 3.0 baseline preserved).
- All CI gates green (lint/publint/depcruise/eslint/dep-cruiser/typecheck/build).
- RFC-001 amendment 2026-05-05 implementation strategy (Option a) realized correctly (schema-build seam, not addStartedHandler — clarified inline).
- ESLint boundaries actively enforces hex layers in m9s-example (was inactive per audit M-1, now closed).

`congruence_level: 3` (CL3): full repo measurements on real workspace, real tests, real CI gate runs, all 14 + m9s-example.

`evidence_type: measurement`: structured measurement (test counts, build outputs, commit hashes, CI gate exit codes, lint baselines), not synthetic experiment.

## Decisions driven by this evidence

- SPEC-003 ready to activate.
- RFC-001 amendment 2026-05-05 confirmed implemented; RFC-001 already active (Sprint 3.0 EVID-004).
- Sprint 3.2 (foundation libs extraction) теперь имеет clean foundation with workflows-as-4th-surface symmetry.
- attw finding for `@gertsai/core` /rag /llm Node10 — carried forward to Sprint 3.2+ (typesVersions fallback or accept).

## Related Artifacts

| Artifact | Type | Relation |
|----------|------|----------|
| SPEC-003 (Sprint 3.1 workflows full impl + ESLint boundaries) | Spec | informs (full implementation evidence) |
| RFC-001 (Moleculer workflows integration design) | RFC | informs (amendment Option a realized) |
| PRD-001 (Wave 2 — Clean Library Platform) | PRD | informs |
| ADR-002 (Hex layer enforcement) | ADR | informs (ESLint side complement to dep-cruiser) |
| ADR-003 (Platform Runtime Boundaries) | ADR | informs (workflow as 4th surface symmetry) |
| EVID-004 (Sprint 3.0 complete) | Evidence | informs (foundation context) |
| audit-pre-sprint-3-1 (5 reviewers) | external | informs (M-1 ESLint dead config closed; F-3 hook gap implemented) |








