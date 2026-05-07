---
"@gertsai/core": minor
"@gertsai/api-core": minor
---

Sprint 3.1 — workflows full implementation + ESLint hex-layer enforcement

**`@gertsai/core`** — additive `WorkflowDefinition.params?: object` field for
runtime adapter input validation (e.g. fastestValidator schemas in
`@moleculer/workflows`). Non-breaking; older definitions remain valid.

**`@gertsai/api-core`** — `controller.setWorkflows({...})` is now a
production-ready 4th surface alongside `actions`, `queues`, `channels`:

- `setWorkflows(controller, registration)` adapts language-neutral
  `WorkflowDefinition`s into Moleculer-flavoured workflow schemas via the new
  `adaptWorkflowDefinition()` helper, then registers them through an internal
  `_registerWorkflow` hook on `ApiController`.
- `ApiController._attachWorkflowsToServices` is invoked at synthesized-schema
  build time (per RFC-001 amendment 2026-05-05, Option (a)) so workflows are
  visible to the `@moleculer/workflows` middleware before broker start.
- `createMoleculerConfig({ workflows: { ... } })` now lazy-requires
  `@moleculer/workflows` and pushes its middleware. Lazy require keeps the
  peer-dep optional for consumers who do not need workflows.

**Repo** — `eslint-plugin-boundaries` config (flat) added for
`examples/m9s-example/src/**`, mirroring `.dependency-cruiser.cjs` rules with
deny-by-default semantics. Provides IDE-side feedback complementing the
existing CI dep-cruiser gate. 0 violations baseline.

**`examples/m9s-example`** migrated from a hand-rolled `IngestWorkflowService`
ServiceSchema to a pure `WorkflowDefinition` (`application/IngestProcessWorkflow.ts`)
registered through `controller.setWorkflows({ 'ingest.process': ... })`. The
runtime workflow name moved from `wf-ingest.ingest.process` →
`v1.ingest.process` (synthesized as `<svc.fullName>.<wf.name>`).

Refs: RFC-001 (active), SPEC-003, ADR-002, ADR-003.
