# @gertsai/di

## 0.3.1

### Patch Changes

- Updated dependencies [8de6205]
- Updated dependencies [739b3de]
  - @gertsai/utils@0.5.0

## 0.3.0

### Minor Changes

- f662fa5: Wave 12.C-fix-2+3 — close HIGH finding (EVID-048 H-9).

  **H-9 — DI memory leak via 'destroy' vs 'destroyed' event-name mismatch**

  DI's `ServicesRegistry.register()` subscribed to a `'destroy'` event on the consumer object, but `@gertsai/entity`'s `Model.$destroy()` emits `'destroyed'` (past-tense convention). Result: ServiceDirectory's `$destroy()` never fired for entity-derived consumers → services holding timers / open connections / metric handles leaked silently.

  **Fix:** DI now subscribes to `'destroyed'` (matching `@gertsai/entity.Model` contract).

  **Migration (soft breaking):** consumer classes that previously emitted `'destroy'` must rename to `'destroyed'`. Inside this monorepo: all DI test fixtures + the README example updated to emit `'destroyed'`. External consumers should verify their consumer-class implementations.

  **Tests:** +2 new tests (positive: `'destroyed'` triggers cleanup; negative: legacy `'destroy'` does NOT trigger cleanup, confirming the rename). 115/115 total pass.

  Refs: PRD-034, EVID-048 (H-9), entity Model.ts:46 (canonical event emit).

## 0.2.2

### Patch Changes

- Updated dependencies [a26b3d6]
  - @gertsai/utils@0.4.0

## 0.2.1

### Patch Changes

- Updated dependencies [4415a5f]
  - @gertsai/utils@0.3.0

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

- c19e12a: Sprint 3.4 enhancements (W-4A-4 per SPEC-007 / ADR-005 Decision B):

  - Added runtime type guards: `isDestroyable`, `isServiceIdentifier`,
    `assertServiceIdentifier` (new module `src/guards.ts`).
  - Added safe-destroy helpers: `safeDestroy`, `safeDestroyAll`, plus
    `SafeDestroyResult` type — formalises the failure-isolating cascade
    pattern used by `ServiceDirectory.$destroy()` for reuse by consumers
    tearing down ad-hoc {@link IDestroyable} collections (new module
    `src/destroy.ts`).
  - Added type-level inference helpers: `InferServiceFromIdentifier`,
    `AnyServiceIdentifier` (new module `src/inference.ts`) — pure
    compile-time aliases that simplify generic plumbing over service
    identifiers.

  Existing API surface unchanged. All 85 prior tests continue to pass; 29
  new tests cover the additions (114 total).

  Patterns cherry-picked from Orchestra orchlab/di v0.2.4 (Apache 2.0).
  Per ADR-005 R-3, deeper orchlab patterns (args-bearing
  `ServiceIdentifier<T, Args>`, `ServiceDirectory.getAll`) were deferred —
  they require modifying existing `ServiceIdentifier`, `ServiceFactory`,
  and `ServicesRegistry.create` signatures, which would not be strictly
  additive.

### Patch Changes

- Updated dependencies [0755c6d]
  - @gertsai/utils@0.2.0
