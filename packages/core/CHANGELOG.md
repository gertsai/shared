# @gertsai/core

## 0.2.0

### Minor Changes

- 0755c6d: Initial OSS release of `@gertsai/*` first-wave packages (v0.1.0).

  Extracted with preserved git history from internal `gertsai_codex` monorepo
  into the public `gertsai/shared` repository, под Apache 2.0. 14 packages
  across 5 tiers per [ADR-009][adr-009] + [ADR-011][adr-011]:

  - **Tier 1** (zero internal deps): `fsm`, `fetch`, `collection`, `llm-costs`,
    `utils`, `m9s-cache`, `ws-rpc`
  - **Tier 2** (depends on Tier 1): `di` (→ utils), `flux` (→ collection)
  - **Tier 3**: `core` (→ llm-costs), `hsm`
  - **Tier 4**: `auth-openfga` (→ core), `api-core` (→ core + auth-openfga)
  - **Tier 5** (per ADR-011): `api-rlr` (→ api-core; database-agnostic
    `PgClient` interface — drop-in compat с Prisma/Drizzle/raw-pg)

  Highlights:

  - **`@gertsai/api-rlr`**: production-grade rate limit middleware для
    Moleculer.js. Sliding-Window + GCRA через Redis Lua scripts; PostgreSQL
    adapter accepts any client structurally compatible с Prisma's
    `$queryRawUnsafe` / `$executeRawUnsafe` / `$transaction` surface.
  - **`@gertsai/api-core`**: unified `APIError`/`ResponseCode` (RFC-053),
    `ApiController`, Moleculer mixins, OpenAPI merge.
  - **`@gertsai/core`**: identity, errors, response envelope, tracing primitives.
  - **`@gertsai/fsm`** / **`@gertsai/hsm`**: zero-dep finite & hierarchical state
    machines.

  See individual package READMEs for install + quickstart.

  [adr-009]: https://github.com/gertsai/shared/blob/main/.forgeplan/adrs/ADR-009-trivexdev-as-single-oss-umbrella-for-shared-packages-and-fluxis.md
  [adr-011]: https://github.com/gertsai/shared/blob/main/.forgeplan/adrs/ADR-011-first-wave-extension-to-14-packages-add-api-rlr-refines-adr-009.md

- 1d1e833: Sprint 2 — api-core decomposition Phase A (per ADR-003 + SPEC-002).

  **`@gertsai/api-core` v0.2.0** — three subpath exports без breaking changes:

  - `@gertsai/api-core/contracts` — pure types (APIError, ResponseCode, response envelope, OpenAPI helpers). Zero runtime side effects, zero peer deps на Moleculer/BullMQ/dotenv/GCP. Safe для browser, FastAPI clients, Rust ts-types.
  - `@gertsai/api-core/moleculer` — Moleculer-specific runtime (ApiController, queues, channels, OAuth, gateway, **workflows experimental stub**). Lazy-init.
  - `@gertsai/api-core/runtime/node` — Node.js-specific factories (`loadConfig`, `createGcpLoggerStream`). Opt-in side effects.

  Root `@gertsai/api-core` остаётся backward-compatible через deprecated reexports с JSDoc warnings — но **больше не экспортирует `loadConfig`** (move на `/runtime/node`).

  **`@gertsai/core` v0.2.0** — language-neutral workflow contracts:

  - `WorkflowDefinition`, `WorkflowRun`, `WorkflowSignal`, `WorkflowState`, `WorkflowStepResult`, `EventEnvelope` — single source of truth для всех runtime adapters (Moleculer сейчас, FastAPI/Go/Rust позже).

  **`@gertsai/api-rlr` v0.2.0** — migrated к `@gertsai/api-core/contracts` subpath. Per-package tsconfig override на ESNext+Bundler для resolver compatibility.

  **Migration guide для consumers**:

  ```typescript
  // BEFORE (v0.1.x)
  import { APIError, ResponseCode } from "@gertsai/api-core";
  import { ApiController } from "@gertsai/api-core";
  import { loadConfig } from "@gertsai/api-core"; // ← removed

  // AFTER (v0.2.x)
  import { APIError, ResponseCode } from "@gertsai/api-core/contracts";
  import { ApiController } from "@gertsai/api-core/moleculer";
  import { loadConfig } from "@gertsai/api-core/runtime/node";
  ```

  Root imports continue to work для `APIError`/`ApiController`/etc., но triggers JSDoc deprecation warning. `loadConfig` requires explicit subpath migration.

  **Breaking surface only**: `loadConfig` no longer reexported from root. Workaround — explicit subpath. All other v0.1.x APIs preserved через root reexports.

  Refs: PRD-001, ADR-003 (Platform Runtime Boundaries), SPEC-002 (Sprint 2 checklist), EVID-002 (smoke), EVID-003 (Sprint 2 evidence).

- 155d0c0: Sprint 3.0.1 — pre-publish hardening (audit-pre-sprint-3-2 convergent fixes)

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

- e830ae6: Sprint 3.1 — workflows full implementation + ESLint hex-layer enforcement

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

### Patch Changes

- Updated dependencies [0755c6d]
  - @gertsai/llm-costs@0.2.0
