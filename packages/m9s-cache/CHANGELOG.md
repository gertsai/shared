# @gertsai/m9s-cache

## 0.3.0

### Minor Changes

- cb29bb0: Wave 12.B-fix-1 — close CRITICAL external-type-leak (EVID-044 CRIT-1)
  per PRD-029. Split moleculer + ioredis integrations into dedicated
  subpaths so root `@gertsai/m9s-cache` becomes truly backend-agnostic.

  **Problem:** the prior root `dist/index.d.ts:1-2` did
  `import { ... } from 'ioredis'` AND `import { ... } from 'moleculer'`,
  and `moleculer-cacher.ts` did `require('moleculer')` at module top.
  Result: `import { CacheStore } from '@gertsai/m9s-cache'` **crashed at
  module-load** if `moleculer` wasn't installed — despite both being
  declared as optional peer-dependencies. The optional-peer contract was
  broken; consumers using only `MemoryCacheDriver` got a hard
  `MODULE_NOT_FOUND`.

  **Fix:**

  1. New `@gertsai/m9s-cache/moleculer` subpath. Exports `M9sCacheCacher`,
     `moleculerDbCacheMixin`, and all moleculer-coupled types.
  2. New `@gertsai/m9s-cache/redis` subpath. Exports `RedisCacheDriver`,
     `RedlockLockProvider`, `RedisLike`, and ioredis-coupled types.
  3. Root `dist/index.d.ts` now exports ONLY backend-agnostic primitives —
     `CacheStore`, `MemoryCacheDriver`, serializers, validators,
     `NoopLockProvider`, `generateTags`, and agnostic types.
  4. `moleculer-cacher.ts` refactored to lazy `getMoleculer()` +
     Proxy-construct pattern. `M9sCacheCacher` is now a `Proxy` whose
     `construct` trap resolves the underlying class on first
     instantiation. If `moleculer` isn't installed, the error is
     contextual: "moleculer is required for M9sCacheCacher. Install it
     as a peer dependency: pnpm add moleculer".

  **Migration (BREAKING — minor SemVer per pre-1.0 convention):**

  ```diff
  - import { M9sCacheCacher, MemoryCacheDriver, RedisCacheDriver } from '@gertsai/m9s-cache';
  - import type { RedisLike } from '@gertsai/m9s-cache';
  + import { MemoryCacheDriver } from '@gertsai/m9s-cache';
  + import { M9sCacheCacher } from '@gertsai/m9s-cache/moleculer';
  + import { RedisCacheDriver } from '@gertsai/m9s-cache/redis';
  + import type { RedisLike } from '@gertsai/m9s-cache/redis';
  ```

  `examples/m9s-example` is updated in this same PR — patch bump rolls
  through transitively.

  **Verification:**

  - `head -3 dist/index.d.ts` no longer imports from `'moleculer'` or
    `'ioredis'`
  - `head -3 dist/moleculer.d.ts` imports moleculer (correct — it's the
    bridge)
  - `head -3 dist/redis.d.ts` imports ioredis (correct)
  - No module-top `require('moleculer')` in `dist/index.js` (root
    decoupled). The lazy `require` in `dist/moleculer.js` lives only
    inside `getMoleculer()` function body.
  - Manual smoke check: simulating moleculer-missing → root import
    succeeds, subpath construction throws contextual error.
  - 106/106 tests pass; typecheck clean.

  Refs: PRD-029, RFC-020, EVID-044 CRIT-1.

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
