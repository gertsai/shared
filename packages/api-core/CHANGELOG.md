# @orchdev/api-core

## 0.3.4

### Patch Changes

- Updated dependencies [0f71f1d]
- Updated dependencies [7109c49]
  - @gertsai/core@0.5.0
  - @gertsai/auth-openfga@0.3.3

## 0.3.3

### Patch Changes

- 8f5533f: Wave 14.4 — Mark `GertsErrorResponse` `@deprecated` + add `toProblemDetails` migration helper per EVID-057 §Error Envelope.

  EVID-057 confirmed the 3-way drift between RFC 9457 `ProblemDetails` (canonical per ADR-006), m9s-example OpenAPI schema (matches canonical), and `@gertsai/api-core GertsErrorResponse` (RFC-030 hybrid outlier with ZERO external consumers). This wave marks the deprecation path without removing anything — removal is a v1.0.0 breaking change.

  **`@deprecated` markers added to**:

  - `GertsErrorResponse` interface
  - `createGertsError` function
  - `validateGertsError` typia validator
  - `validateGertsErrorEquals` typia validator
  - `assertGertsError` typia validator
  - `isGertsError` typia type-guard

  Each marker carries `@see` pointing to `appErrorToHttpResponse` from `@gertsai/errors/http` and a removal note for `@gertsai/api-core@1.0.0`.

  **New migration helper**: `toProblemDetails(error: GertsErrorResponse): ProblemDetailsLike`. Maps RFC-030 envelope → RFC 9457 ProblemDetails shape:

  - `error.type` → ADR-006 URN bucket (e.g. `validation_error` → `urn:gertsai:errors:validation`)
  - `error.message` → ProblemDetails.title + .detail
  - `error.code` + `error.param` + `error.stage` + `error.retryable` + `error.retry_after` → `ProblemDetails.details`
  - `request_id` → `details.requestId`; `trace_id` → `correlationId`; `tenant_id` → `details.tenantId`

  Local `ProblemDetailsLike` interface mirrors `@gertsai/errors/http.ProblemDetails` field-for-field — defined locally to avoid introducing a new dep from api-core. Consumers building real HTTP response bodies should prefer the canonical type at runtime.

  **Behaviour**: zero change. Existing consumers see TS deprecation hints (not errors); all 379 api-core tests continue passing. Build + typecheck green.

  **No public-API break.** Patch bump. Removal cycle:

  - v0.x.y (this PR): @deprecated marker + migration helper landed
  - v1.0.0 (Wave 14.6): `GertsErrorResponse` interface + `createGertsError`/`validateGertsError`/`isGertsError`/`toProblemDetails` removed; all `@gertsai/api-core` internal consumers migrated to ProblemDetails

  Refs: PRD-046, EVID-057 (Wave 12.F audit), ADR-006 (@gertsai/errors Shared Kernel + ProblemDetails canonical), EVID-062 (Wave 14.1+14.2 LRU precedent), EVID-063 (Wave 14.3+14.5 URL precedent).

- Updated dependencies [739b3de]
  - @gertsai/auth-openfga@0.3.2
  - @gertsai/core@0.4.1

## 0.3.2

### Patch Changes

- Updated dependencies [f0f6f26]
- Updated dependencies [7bc148b]
  - @gertsai/core@0.4.0
  - @gertsai/auth-openfga@0.3.1

## 0.3.1

### Patch Changes

- Updated dependencies [05258e5]
- Updated dependencies [05258e5]
  - @gertsai/core@0.3.0
  - @gertsai/auth-openfga@0.3.0

## 0.3.0

### Minor Changes

- 2e111ed: Wave 13 — close CRITICAL audit findings from EVID-043 (api-core Wave 12.A
  deep-audit). 6 surgical fixes shipped together as a minor version bump
  (some are behavior-changing, justified under 0.x SemVer).

  **Security (4 fixes):**

  - **CWE-347 (BYPASS_AUTH)**: `OAuth.authenticate` now hard-throws when
    `BYPASS_AUTH=true` AND `NODE_ENV === 'production'`. The env flag
    previously decoded Firebase JWT payload via `atob()` without
    verifying the signature — production deploys with this env set were
    trivially impersonatable.

  - **CWE-942 (CORS)**: `ALLOWED_ORIGINS` is now parsed as a comma-
    separated allowlist by a new `parseCorsOrigins()` helper.
    Production + unset/empty/`'*'` → throw at boot (combined with
    `credentials: true` this would be the textbook CSRF-amplifier).
    Non-prod + unset → wildcard `'*'` with a console.warn so local-dev
    works out of the box. Default of `ALLOWED_ORIGINS` env changed from
    legacy string sentinel `'none'` to empty string `''`.

  - **CWE-345 / CWE-770 (XFF rate-limit)**: API gateway rate limiter
    switched from raw `req.headers['x-forwarded-for']` to the hardened
    `extractClientIp()` helper (validates octet ranges, rejects CR/LF/NUL
    injection, selects last IP from XFF chain = trusted proxy hop).
    Previous code accepted any XFF value as-is — attackers rotating the
    header bypassed the limit trivially.

  - **CWE-532 (debug logging)**: `apiGateService.template` default
    `logRequestParams` + `logResponseData` changed from `'debug'` to
    `null`. At debug level the gateway dumped OAuth password-grant
    credentials, `client_secret`, freshly-minted access tokens into logs.
    Consumers can still opt in via `settings: { logRequestParams: 'debug' }`.

  **Logic (2 fixes):**

  - **OAuth stub methods** (`getUser`, `revokeToken`, `saveToken`,
    `getRefreshToken`, `validateScope`) now `throw new Error('Not
implemented')` instead of silently returning `undefined` via
    `console.log` no-op. Previous behavior caused `oauth2-server` to
    surface opaque 500s on any grant flow. Throw makes misuse loud.

  - **OAuth `authenticate` null-check** on `token.user` before
    dereferencing `token.user._uuid`. oauth2-server may return a token
    without an associated user object (e.g. client-credentials grant);
    previous code threw `TypeError: Cannot read properties of undefined`
    at runtime via `@ts-ignore`. Now throws a clear `InvalidTokenError`.

  **Type safety (2 improvements):**

  - **`defineAction()` generic** tightened from `(registration: unknown)
=> RegisteredAction` to `<T extends Record<string, unknown>>
(registration: T) => T & RegisteredAction`. Rejects
    `defineAction(undefined)`, `null`, primitives at compile time AND
    preserves the inferred shape of the input. Backward-compatible for
    consumers using `defineAction(controller.register(...))` —
    `controller.register` return satisfies the new constraint.

  - **`OAuthContextMeta` interface** + `setAuthenticatedMeta(ctx, user)`
    helper added. Eliminates four `@ts-ignore` lines on `ctx.meta` writes
    in `OAuth.authenticate` + firebase-auth path. Single typed cast at
    the helper boundary.

  **Tests:** new `define-action.test.ts` with 9 cases covers runtime
  identity, side-effect preservation, type contract, generic constraint
  rejection, and brand semantics. Closes EVID-043 Test C1 (defineAction
  was untested since Wave 11.B shipped).

  **Deferred (Wave 14):** god-class `ApiController` decomposition (1500
  LOC SRP/OCP/DIP violations per arch-reviewer), `/contracts` typia
  extraction (ADR-003 leak), `ActionOptions = any` defaults conversion
  to `unknown`, `OAuth` class proper typing, comprehensive test coverage
  for BullMQ workers + Pub/Sub + Diagnostics. See PRD-027 → Wave 14 PRD.

  Refs: PRD-027, EVID-043.

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

- 56eb238: Add `defineAction()` typed wrapper retiring `: any` annotations at every
  `controller.register(...)` call site. Exported from
  `@gertsai/api-core/moleculer`.

  Migration:

  ```ts
  // Before:
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const upload: any = controller.register('upload', { ... });

  // After:
  import { defineAction } from '@gertsai/api-core/moleculer';
  export const upload = defineAction(controller.register('upload', { ... }));
  ```

  `defineAction` returns the opaque `RegisteredAction` brand — the export
  type-erases the leaked Moleculer/typia shape (`ITypiaValidator` etc.)
  without losing handler-body typing. Side effect of registration is
  unchanged; the helper is a runtime no-op cast.

  Closes EVID-036 audit findings W-Type-1 / W-Type-2 at the package boundary
  instead of per-app shim (originally local in `examples/m9s-example/src/lib/`
  since Wave 10.E PRD-022).

### Patch Changes

- 1f8494e: Sprint 1 hygiene fixes (SPEC-001) — preрequisite для first npm publish v0.1.0.

  **`@gertsai/api-core`**:

  - **H-1**: `private: true → false`, `license: "MIT" → "Apache-2.0"`, добавлен `publishConfig.access: "public"` (release-blocker fix).
  - **H-2**: убран `import 'dotenv/config'` side-effect из root `src/index.ts` — больше не загружает `.env` при импорте библиотеки.
  - **H-3**: Google Cloud Logger переведён на lazy factory `createGcpLoggerStream()` — больше нет MetadataLookupWarning к `169.254.169.254` при импорте moleculer config.
  - **H-4**: `@google-cloud/pubsub` перемещён в `peerDependencies` (`^4.0.0`, optional) — TypeScript consumers больше не получают unresolvable type reference на `PubSub`.

  **`@gertsai/api-rlr`**:

  - **H-5**: `ioredis` (`^5.7.0`) перемещён в `peerDependencies` — runtime import теперь корректно declared.
  - **H-6**: `moleculer-web` (`^0.10.8`) перемещён в `peerDependencies` — аналогично H-5.

  Все existing тесты остаются зелёными (api-core 370/370, api-rlr 289/337 — 48 Redis-required skipped).

  Source: docs/dd.md audit (2026-05-05). Refs: PRD-001, ADR-003, SPEC-001 в `.forgeplan/`.

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

- c6896c4: Initial release of @gertsai/rpc-proxy-builder (Tier 3). Type-safe RPC proxy generator.

  - `createRpcProxy<TActionMap>(transport, actions)` — Proxy with **3 traps** per ADR-009 I-15:
    - `get`: returns action fn or throws `Error('Unknown RPC action: ...')` per I-14 (CWE-1230 fail-open + namespace probing prevention).
    - `set`: returns false (TypeError in strict mode).
    - `deleteProperty`: returns false.
  - Module-private `Symbol('rpc-proxy')` brand markers per Sprint 3.8 I-11 reuse (CWE-1321 prototype pollution protection).
  - `isRpcProxy(value)` type guard with forgery resistance.
  - WeakMap-backed idempotent cache (same actions map → same proxy ref).
  - Type-only peer on `@gertsai/api-core/contracts` (consumes `ActionDefinition<I, O>`).
  - Generic over transport — implementable for Moleculer broker / WebSocket / HTTP / custom.

  @gertsai/api-core patch: NEW additive `ActionDefinition<TInput, TOutput>` type-only contract added to `/contracts` subpath per ADR-009 Amendment 1.1.1. Backward-compat preserved (additive only).

- Updated dependencies [0755c6d]
- Updated dependencies [1d1e833]
- Updated dependencies [155d0c0]
- Updated dependencies [e830ae6]
  - @gertsai/auth-openfga@0.2.0
  - @gertsai/core@0.2.0

## 0.5.33

### Patch Changes

- Updated dependencies [f8af2e3]
  - @orchdev/sdk@0.14.6

## 0.5.32

### Patch Changes

- Updated dependencies [69b367a]
  - @orchdev/sdk@0.14.5

## 0.5.31

### Patch Changes

- chore(deps): updated ioredis & segment dependencies
- Updated dependencies [64197cb]
  - @orchdev/sdk@0.14.4

## 0.5.30

### Patch Changes

- Updated dependencies [d538458]
- Updated dependencies [6c18169]
  - @orchdev/sdk@0.14.3

## 0.5.29

### Patch Changes

- Updated dependencies
  - @orchdev/sdk@0.14.2

## 0.5.28

### Patch Changes

- Updated dependencies
  - @orchdev/sdk@0.14.1

## 0.5.27

### Patch Changes

- Updated dependencies [a6b0c47]
- Updated dependencies [dac86c8]
  - @orchdev/sdk@0.14.0

## 0.5.26

### Patch Changes

- Updated dependencies [d121757]
  - @orchdev/sdk@0.13.4

## 0.5.25

### Patch Changes

- Updated dependencies [82c0496]
  - @orchdev/sdk@0.13.3

## 0.5.24

### Patch Changes

- Updated dependencies
  - @orchdev/sdk@0.13.2

## 0.5.23

### Patch Changes

- Updated dependencies
  - @orchdev/sdk@0.13.1

## 0.5.22

### Patch Changes

- Updated dependencies [3deb0a1]
- Updated dependencies [0db56d2]
  - @orchdev/sdk@0.13.0

## 0.5.21

### Patch Changes

- Updated dependencies
  - @orchdev/sdk@0.12.3

## 0.5.20

### Patch Changes

- Updated dependencies [8c603b3]
- Updated dependencies [764c604]
  - @orchdev/sdk@0.12.2

## 0.5.19

### Patch Changes

- Updated dependencies
- Updated dependencies [dc86b84]
- Updated dependencies
  - @orchdev/sdk@0.12.1

## 0.5.18

### Patch Changes

- Updated dependencies [3c29b9f]
- Updated dependencies [382154b]
- Updated dependencies [3bc73da]
  - @orchdev/sdk@0.12.0

## 0.5.17

### Patch Changes

- Updated dependencies [e59f10e]
- Updated dependencies
  - @orchdev/sdk@0.11.3

## 0.5.16

### Patch Changes

- Updated dependencies
  - @orchdev/sdk@0.11.2

## 0.5.15

### Patch Changes

- Updated dependencies [8247a8b]
- Updated dependencies [59e3142]
  - @orchdev/sdk@0.11.1

## 0.5.14

### Patch Changes

- Updated dependencies [d04a02d]
  - @orchdev/sdk@0.11.0

## 0.5.13

### Patch Changes

- Updated dependencies [7182ce9]
  - @orchdev/sdk@0.10.3

## 0.5.12

### Patch Changes

- Updated dependencies [742230a]
  - @orchdev/sdk@0.10.2

## 0.5.11

### Patch Changes

- Updated dependencies [93d85aa]
- Updated dependencies [93d85aa]
  - @orchdev/sdk@0.10.1

## 0.5.10

### Patch Changes

- Updated dependencies [166378b]
  - @orchdev/sdk@0.10.0

## 0.5.9

### Patch Changes

- Updated dependencies [19bb939]
  - @orchdev/sdk@0.9.7

## 0.5.8

### Patch Changes

- Updated dependencies [0136379]
  - @orchdev/sdk@0.9.6

## 0.5.7

### Patch Changes

- Updated dependencies [b0ad9ce]
- Updated dependencies [cba609d]
  - @orchdev/sdk@0.9.5

## 0.5.6

### Patch Changes

- 7f4603e: Implemented custom fields in messages, used by support bot
- Updated dependencies [7f4603e]
  - @orchdev/sdk@0.9.4

## 0.5.5

### Patch Changes

- Fixed memory leak in Api
- Updated dependencies
  - @orchdev/sdk@0.9.3

## 0.5.4

### Patch Changes

- Updated dependencies [662d6fa]
  - @orchdev/sdk@0.9.2

## 0.5.3

### Patch Changes

- Updated dependencies
  - @orchdev/sdk@0.9.1

## 0.5.2

### Patch Changes

- Fixed tests and build

## 0.5.1

### Patch Changes

- Updated dependencies [dc17255]
- Updated dependencies [de29341]
- Updated dependencies [49d0c53]
- Updated dependencies [b70f6ab]
  - @orchdev/sdk@0.9.0

## 0.5.1-rc.1

### Patch Changes

- Updated dependencies
  - @orchdev/sdk@0.9.0-rc.1

## 0.5.1-rc.0

### Patch Changes

- Updated dependencies [de29341]
- Updated dependencies
- Updated dependencies [b70f6ab]
  - @orchdev/sdk@0.9.0-rc.0
