# @gerts/api-rlr

## 0.3.1

### Patch Changes

- @gertsai/api-core@0.3.2

## 0.3.0

### Minor Changes

- 05258e5: Wave 12.D-fix Teammate A — close 1 CRITICAL + 4 HIGH findings per PRD-036.

  **CRIT-1 / FR-001 — moleculer peer-dep gap (Wave-13 pattern #4)**

  `dist/index.d.ts:4` imported `Errors` namespace from `moleculer` (because `RateLimitError extends MoleculerError`), but `moleculer` was declared ONLY in `devDependencies`. Consumers installing without moleculer got unresolved type imports. Fix: added `moleculer` to `peerDependencies` (`^0.14.0`) with `peerDependenciesMeta.moleculer.optional: true`.

  **FR-002 — `RequestContext` → `RlrRequestContext` rename**

  Resolved name collision with `@gertsai/runtime-context.RequestContext` (ADR-007 canonical composition root). Public canonical name: `RlrRequestContext`. Legacy `RequestContext` alias retained with `@deprecated` JSDoc — to be removed in next major.

  **FR-003 — `globalThis.__RLR_STORES__` → module-private SHA-256 fingerprint Map**

  Replaced the anti-pattern global store cache with module-private `Map<string, RLRRedis>` keyed by SHA-256 fingerprint of identity-affecting fields (mirrors ADR-012 + auth-openfga Wave 6.3 pattern). Eliminates: (a) ESM/CJS dual-build duplicate-state bugs (two factory instances seeing two globals), (b) Vitest worker-isolation issues, (c) serverless cold-start cross-tenant leakage. New `__resetStoreInstancesForTesting()` + `__getStoreInstancesSizeForTesting()` `@internal` helpers for test isolation. `assertSafeKey` rejects `__proto__`/`constructor`/`prototype` (CWE-1321 defense).

  **FR-012 / FR-013 / FR-014 — type tightenings**

  - `TypedLuaScript<TKeys, TArgs extends readonly any[]>` → `readonly unknown[]`. Same for `TypedScriptManager.register/get`.
  - `RateLimitTestUtils.testMiddleware` `next?: any` → `next?: NextFunction`.
  - `RateLimiter.checkLimit` removed `store: null as any` dead-code coupling (StrategyExecuteArgs lost the unused `store` field entirely).

  **Tests:** +9 new tests (3 export-rename, 5 fingerprint-Map behaviour, 3 type-tightenings). 298/298 pass. Wave-13 regression check: `head -3 dist/index.d.ts` confirms moleculer import is now backed by declared peer-dep.

  Refs: PRD-036, EVID-051 (CRIT-1, A-1, A-2, T-1, T-2, T-3), ADR-012.

### Patch Changes

- @gertsai/api-core@0.3.1

## 0.2.1

### Patch Changes

- Updated dependencies [2e111ed]
  - @gertsai/api-core@0.3.0

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

- Updated dependencies [0755c6d]
- Updated dependencies [1f8494e]
- Updated dependencies [1d1e833]
- Updated dependencies [155d0c0]
- Updated dependencies [e830ae6]
- Updated dependencies [c6896c4]
- Updated dependencies [56eb238]
  - @gertsai/api-core@0.2.0

## 0.1.3

### Patch Changes

- c08ad71: chore(deps): fixed ioredis dependencies

## 0.1.2

### Patch Changes

- chore(deps): updated ioredis & segment dependencies

## 0.1.1

### Patch Changes

- Fixed tests and build
