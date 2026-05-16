# @gertsai/collection

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
