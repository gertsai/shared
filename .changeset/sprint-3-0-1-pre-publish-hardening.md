---
"@gertsai/core": minor
"@gertsai/api-core": patch
---

Sprint 3.0.1 — pre-publish hardening (audit-pre-sprint-3-2 convergent fixes)

**`@gertsai/core`** (minor — additive):

- `WorkflowDefinition.params` is now `Readonly<Record<string, unknown>>` (was
  `object`), better representing fastestValidator-style schema literals
  (audit F-T-2).
- `WorkflowSignal.meta?: WorkflowSignalMeta` — additive optional field with
  `tenantId`, `userId`, `correlationId`. Forestalls Sprint 3.2 forced minor
  bump for tenant context propagation (audit F-S-1).
- `typesVersions` map added so `@gertsai/core/rag` and `@gertsai/core/llm`
  resolve cleanly under Node10/legacy `moduleResolution: "node"` consumers
  (audit F-T-4 + F-P-1).

**`@gertsai/api-core`** (patch — internal refactor + additive):

- `setWorkflows` is now generic `<M extends WorkflowRegistration>` so
  consumers' precise per-workflow `WorkflowDefinition<I, O>` types are
  preserved (audit F-T-3).
- The internal registration hook is now keyed by a `Symbol.for(...)` Symbol
  instead of a public underscore-prefixed method, so it does not surface in
  emitted `.d.ts` (audit F-T-1, the original critical leak).
- `ApiController` formally `implements ApiControllerInternalHook`; consumers
  no longer need `as unknown as Parameters<typeof setWorkflows>[0]` casts.
- `MoleculerWorkflowSchema.params` tightened to `Readonly<Record<string, unknown>>`.
- `adapter.ts` reads `WorkflowSignal.meta` from `ctx.meta` defensively and
  attaches it only when at least one string field is present.
- `as unknown as ServiceSchema` casts in `_attachWorkflowsToServices` and
  `generateServiceSchema` removed — `CoreServiceSchema` now declares optional
  `workflows?: Record<string, MoleculerWorkflowSchema>` (audit F-T-5).
- `typesVersions` map added so `@gertsai/api-core/contracts`,
  `@gertsai/api-core/moleculer`, and `@gertsai/api-core/runtime/node` resolve
  cleanly under Node10/legacy consumers (audit F-T-4 + F-P-1).
- `attw` exits clean across all subpaths (was 💀 Resolution failed in Sprint
  3.0).

**Repo-wide**:

- TypeScript pinned to `5.9.3` workspace-wide (single root devDep; per-package
  pins removed). Single resolved version verified via `pnpm why typescript`
  (audit F-CR-4).
- All 14 packages now have uniform `package.json` scripts: `build`, `clean`,
  `test`, `typecheck`, `lint`. `pnpm -r --parallel run typecheck` now covers
  15/15 workspaces (was silently skipping 5+) (audit F-CR-5).
- Legacy `.eslintrc.cjs` deleted (canonical config is the flat
  `eslint.config.mjs` since Sprint 3.0) (audit F-CR-1).
- `.forgeplan-web/` added to ESLint ignores to silence unrelated build-output
  warnings.
- m9s-example workflow registration: documentation explicitly notes that
  module-load registration is required (workflow attach happens during
  `controller.Start({services})` — `addStartedHandler` callbacks fire too
  late). Comment cites EVID-005 + audit F-CR-3 + RFC-001 amendment 2026-05-05.

**Out of scope**: Sprint 3.2 scope redesign (architect NO-GO findings F-A-1
observe→otel rename, F-A-2 database→pg-client, F-A-3 drop auth-moleculer)
will land as PRD-001 amendment + ADR-012 in a follow-up commit. v0.2.0 npm
publish remains gated on user approval after this hardening.

Refs: SPEC-005 (active), audit-pre-sprint-3-2 (5 reviewers, 6 convergent
findings + 3 architect scope critical, all addressed or routed).
