# @gertsai/collection

## 0.3.1

### Patch Changes

- 739b3de: Wave 14.1+14.2 — LRU primitive consolidation per EVID-057.

  **Wave 14.1 — Cross-package consolidation (Teammate K).**

  EVID-057 surfaced 4 packages implementing the same insertion-order Map LRU pattern with identical eviction logic. Consolidated into `@gertsai/utils/lru` subpath:

  - **NEW**: `@gertsai/utils/lru` exports `LruMap<K,V>` (no TTL, `has()` non-touching) + `LruTtlMap<K,V>` (with TTL, `has()` touching — preserves Wave 7.4 auth-openfga semantics). Both classes support back-compat dual constructor signature: positional (`new LruMap(100)` legacy collection-style) OR options object (`new LruMap({ maxSize })`).
  - **NEW**: `LruMap.peek(key)` non-touching get for observability without perturbing eviction order.

  Migrated 4 consumers:

  - `@gertsai/auth-openfga/src/internal/lru-ttl-map.ts` → thin re-export shim from `@gertsai/utils/lru` (-127 LOC, public API preserved)
  - `@gertsai/rest-request-manager/src/circuit-breaker.ts` `hosts: Map<...>` → `LruMap<string, HostState>` (ADR-009 Amendment 1.2.1 `maxHosts: 1000` preserved). Used new `peek()` for `getState()` to avoid perturbing LRU order during observability.
  - `@gertsai/collection/src/utils/memoize.ts` `LRUCache<K,V>` → re-export shim `import { LruMap as LRUCache } from '@gertsai/utils/lru'` (-73 LOC, named export + `instanceof` semantics preserved)
  - `@gertsai/api-rlr/src/adapters/ResilientRedisAdapter.ts` private `LRUCache<K,V>` → consumes `LruMap` directly (-31 LOC, was module-private)

  **Wave 14.2 — Same-package consolidation (Teammate L).**

  - `@gertsai/core/src/deny-ledger/providers/memory.ts MemoryDenyLedger` previously inlined doubly-linked-list LRU logic that exactly duplicated `core/lru-cache.ts`. Refactored to consume the local `LRUCache<DenyEntry>` primitive (-63 LOC).
  - 3 behavioural deltas surfaced + preserved:
    1. Stats granularity kept at ledger level (not per-`get()`-probe level — `isDenied()` probes up to 4 lookup keys/call)
    2. TTL source of truth remains `DenyEntry.expiresAt`; `LRUCache` used without TTL
    3. `byId` secondary index synced via `onEvict` callback with race-guarded `byId.get(id) === entry` check

  **Net LOC**: 188 insertions / 434 deletions = **-246 net** across 6 packages (consumer reductions dominate). Source-only (excluding tests): -227 LOC consumers + ~+333 LOC kernel = +106 net source, but single source of truth means future bug fixes (CWE-770 hardening, etc.) land once.

  **Tests**: +38 new tests for kernel (20 LruMap + 18 LruTtlMap parity port). 1767 tests pass across the 5 packages (no regressions in 1195 core / 524 utils / 145 auth-openfga / 28 rest-rm / 772 collection / 298 api-rlr).

  **No public-API breaks**: utils minor bump (new exports added); 5 consumer packages patch bumps only. `auth-openfga LruTtlMap` import path unchanged via shim; `collection LRUCache` named export preserved; `rest-request-manager CircuitBreaker` external API unchanged; `api-rlr LRUCache` was module-private.

  Refs: PRD-044, EVID-057 (Wave 12.F audit source), ADR-009 Amendment 1.2.1, RFC-007.

- Updated dependencies [8de6205]
- Updated dependencies [739b3de]
  - @gertsai/utils@0.5.0

## 0.3.0

### Minor Changes

- a26b3d6: Wave 12.B-fix-3 — close 4 HIGH type-system findings (EVID-044) in
  `@gertsai/collection`.

  **1. Pervasive `any` in exported generic constraints**

  `Constructor<T>`, `memoize`, `memoizeMethod`, `memoizeCollectionOp`,
  `BatchMemoizer`, `defaultKeyGenerator`, `defineProtoMethod`,
  `PositionalAccess` mixins all had `(...args: any[]) => any` style
  escape hatches. Replaced with `(...args: never[]) => unknown`.

  **Why `never[]` not `unknown[]`:** under `--strictFunctionTypes`,
  function parameters are contravariant. `unknown[]` is too strict
  (callers' concrete `(x: number) => string` won't satisfy
  `(...args: readonly unknown[]) => unknown`). `never[]` IS
  contravariantly compatible with any specific tuple, AND
  `Parameters<T>` / `ReturnType<T>` still infer correctly at call sites.

  **2. Brand-bypass factories now validate**

  `createCacheKey`, `createCollectionId`, `createSeqOperationIndex`,
  `createHashCode` now throw a new `BrandValidationError` (additive
  public export) on invalid input. The brands actually mean something
  now — callers can't forge values by calling the factory with junk.

  **3. Subpath `typesVersions` for Node10 fallback**

  Added `typesVersions` block to `package.json` mirroring the
  `@gertsai/m9s-cache` pattern. Subpaths `./core/*`, `./mixins/*`,
  `./operations/*`, `./specialized/*` now resolve correctly under
  TypeScript `moduleResolution: 'node'` (legacy resolution still
  common with TS<5.0 or `module: 'commonjs'`).

  **4. Helper / operation return-type widening**

  - `entriesArray(value: unknown): Array<[PropertyKey, unknown]>` (was
    `Array<[any, any]>`)
  - `frequencies<K, V, F = V>(...)`: returns `Map<F, number>` (was
    `Map<any, number>`)
  - `duplicates<K, V, D = V>(...)`: returns parameterised iterable (was
    `Array<any>`)
  - `flatten(...)`: returns `Array<unknown>` (was `Array<any>`)

  **Tests:** +10 brand validation tests; +1 `memoize` narrowing
  regression test with `@ts-expect-error`. **772/772 pass** (1 pre-
  existing skipped).

  **New exports (additive):** `BrandValidationError`.

  **Consumer impact:** none for callers using `Parameters<T>` /
  `ReturnType<T>` at call sites — narrowing preserved. Callers who
  explicitly forged branded values via the bare factory (no validation)
  will now get a runtime throw — desired security fix.

  Refs: PRD-031, RFC-022, EVID-044.

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
