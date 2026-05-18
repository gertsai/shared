# @gertsai/flux

## 0.3.1

### Patch Changes

- Updated dependencies [739b3de]
  - @gertsai/collection@0.3.1

## 0.3.0

### Minor Changes

- f662fa5: Wave 12.C-fix-2+3 — close 2 HIGH logic findings (EVID-048 H-7 + H-8).

  **H-7 — DataStream.pipe() overwrites prior pipeline + leaks listeners**

  Previously every `pipe()` call:

  1. Unconditionally reassigned `_processItem` (single slot — silently overwrote prior pipe)
  2. Attached two persistent `on('end')` / `on('error')` listeners that were never cleaned up

  Calling `pipe()` twice silently discarded the first transformer; orphaned listeners persisted forever.

  **Fix (Option B — explicit single-pipe contract):** second call to `pipe()` throws `Error('DataStream.pipe(): only one pipe per stream is supported. Use multiple subscribe() calls for fan-out.')`. Listener refs are stored in `_pipeWiring` slot and removed via `_detachPipeListeners()` called from both `close()` and `destroy()`. After destroy, listener-count is 0.

  Reasoning for Option B over Option A (true fan-out): single `_processItem` slot is structurally consumed by `write()`, `_processNextItem()`, `end()`; backpressure loop pauses the upstream once; existing tests only ever chain-pipe on different returned streams (`a.pipe(f).pipe(g)`), never multi-pipe on the same source. Option A would require fan-out write coordination + per-pipe pause accounting — out of HIGH-severity scope.

  **H-8 — Once-listener removal by ListenerInfo reference identity**

  Previously the once-cleanup loop used `off(event, fn)` which calls `findIndex` matching the first registration by function identity. If a user called `emitter.once('x', fn)` and `emitter.on('x', fn)` (same fn), removing the once accidentally removed the persistent `on` registration.

  **Fix:** new private `_removeListenerInfo(event, info)` helper that splices by `ListenerInfo` reference identity. Once-cleanup in `emit()` and `emitAsync()` now uses this helper. Public `off(event, fn)` keeps function-identity semantics for backward compat.

  **Tests:** +5 new FR-007 tests (throw on double-pipe, chain-pipe regression, listener-count assertion on destroy, no orphaned wiring, close()/destroy() symmetry); +4 new FR-008 tests (once+on same fn both orders, double-once same fn, emitAsync parity). 362/362 total pass.

  Refs: PRD-034, EVID-048 (H-7, H-8).

## 0.2.1

### Patch Changes

- Updated dependencies [a26b3d6]
  - @gertsai/collection@0.3.0

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

### Patch Changes

- Updated dependencies [0755c6d]
  - @gertsai/collection@0.2.0
