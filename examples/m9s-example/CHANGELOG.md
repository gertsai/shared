# @gertsai-examples/m9s-example

## 0.0.7

### Patch Changes

- Updated dependencies [05258e5]
- Updated dependencies [05258e5]
- Updated dependencies [05258e5]
- Updated dependencies [05258e5]
  - @gertsai/api-rlr@0.3.0
  - @gertsai/core@0.3.0
  - @gertsai/errors@0.3.0
  - @gertsai/logger-factory@2.0.0
  - @gertsai/auth-openfga@0.3.0
  - @gertsai/async-utils@0.3.0
  - @gertsai/session-guard@2.0.0
  - @gertsai/runtime-context@3.0.0
  - @gertsai/entity-storage@3.0.0
  - @gertsai/api-core@0.3.1
  - @gertsai/rest-request-manager@4.0.0
  - @gertsai/session@2.0.0
  - @gertsai/tenant-resolver@2.0.0
  - @gertsai/pg-client@2.0.0
  - @gertsai-examples/m9s-example-api-types@0.0.4
  - @gertsai/entity-audit@0.1.1

## 0.0.6

### Patch Changes

- Updated dependencies [f662fa5]
  - @gertsai/rest-request-manager@3.1.0
  - @gertsai/entity-storage@2.0.0
  - @gertsai/runtime-context@2.0.0
  - @gertsai/storage-core@2.0.0
  - @gertsai/pg-client@2.0.0

## 0.0.5

### Patch Changes

- Updated dependencies [4415a5f]
- Updated dependencies [4415a5f]
- Updated dependencies [4415a5f]
  - @gertsai/fetch@0.4.0
  - @gertsai/m9s-cache@0.4.0
  - @gertsai/pg-client@1.1.0
  - @gertsai/rest-request-manager@3.0.0
  - @gertsai/entity-storage@1.0.0
  - @gertsai/runtime-context@1.0.0
  - @gertsai/storage-core@1.0.0

## 0.0.4

### Patch Changes

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

- Updated dependencies [cb29bb0]
- Updated dependencies [cb29bb0]
  - @gertsai/fetch@0.3.0
  - @gertsai/m9s-cache@0.3.0
  - @gertsai/rest-request-manager@2.0.0

## 0.0.3

### Patch Changes

- Updated dependencies [2e111ed]
  - @gertsai/api-core@0.3.0
  - @gertsai-examples/m9s-example-api-types@0.0.3
  - @gertsai/api-rlr@0.2.1

## 0.0.2

### Patch Changes

- 782a3e0: Sprint 3.10 — m9s-example Wave 5 integration (canonical reference).

  Reference application now demonstrates Wave 5 stack composition canonically:

  - **`@gertsai/errors`** — domain throws use `ValidationError` (Document.id/text + zero-chunks + empty-query), `InternalError` (embedder count mismatch). Transport-level `wrapUnknownError(e, 'INTERNAL')` recommended at boundaries (documented in README §Wave 5).
  - **`@gertsai/tenant-resolver`** — `tenantMiddleware` in broker config; `HeaderStrategy({ headerName: 'X-Tenant-ID', trustProxy: true })` + `ChainTenantResolver` (mode `'optional'` for example; production should be `'strict'`).
  - **`@gertsai/runtime-context`** — `sessionMiddleware` registered in canonical order (`tenantMiddleware → sessionMiddleware`) via `buildWave5Middlewares()`. Auto-`$freeze()` before downstream handler per ADR-007 I-16.
  - **`@gertsai/session-guard`** — `assertAuthenticated(session)` + `assertSessionInTenant(session, tenantId)` invoked inside both use cases.

  Use-case input shape extended with **additive optional** `session?: Session` + `expectedTenantId?: string` fields — pre-Wave-5 callers (existing 16 tests) pass neither and skip the assertion branch entirely. ADR-010 I-2/I-3 regression invariant preserved (no required-arg signature change).

  NEW integration test `tests/wave5-integration.test.ts` (4 tests):

  1. Valid X-Tenant-ID header → resolver yields tenant → `RequestContext.$freeze` → use-case runs successfully.
  2. Missing header + strict chain → `UnauthorizedError`.
  3. Destroyed session → `AuthenticationRequiredError`.
  4. Cross-tenant attempt (session.tenantId !== expectedTenantId) → `TenantScopeViolationError`.

  ⚠️ SECURITY: `trustProxy: true` requires upstream proxy stripping inbound `X-Tenant-ID`. WITHOUT this infrastructure, any client can spoof tenant → CWE-639 cross-tenant data access. See `examples/m9s-example/README.md` §Wave 5 stack reference + `@gertsai/tenant-resolver` SECURITY section.

  Test count: 20 passed / 1 skipped (16 existing + 4 new). F+ regression invariant preserved.

  Refs ADR-010 §B + Amendment 1 §A1.6 (inline templates) + I-14 (SECURITY warning convention).

- Updated dependencies [0755c6d]
- Updated dependencies [1f8494e]
- Updated dependencies [1d1e833]
- Updated dependencies [155d0c0]
- Updated dependencies [e830ae6]
- Updated dependencies [782a3e0]
- Updated dependencies [782a3e0]
- Updated dependencies [782a3e0]
- Updated dependencies [23d088a]
- Updated dependencies [c19e12a]
- Updated dependencies [c19e12a]
- Updated dependencies [d295ee8]
- Updated dependencies [d295ee8]
- Updated dependencies [d295ee8]
- Updated dependencies [6debc97]
- Updated dependencies [6debc97]
- Updated dependencies [6debc97]
- Updated dependencies [6debc97]
- Updated dependencies [121cb7b]
- Updated dependencies [121cb7b]
- Updated dependencies [121cb7b]
- Updated dependencies [121cb7b]
- Updated dependencies [c6896c4]
- Updated dependencies [c6896c4]
- Updated dependencies [c6896c4]
- Updated dependencies [c6896c4]
- Updated dependencies [56eb238]
  - @gertsai/api-core@0.2.0
  - @gertsai/api-rlr@0.2.0
  - @gertsai/auth-openfga@0.2.0
  - @gertsai/core@0.2.0
  - @gertsai/fetch@0.2.0
  - @gertsai/m9s-cache@0.2.0
  - @gertsai/errors@0.2.0
  - @gertsai/tenant-resolver@1.0.0
  - @gertsai/runtime-context@1.0.0
  - @gertsai/entity-storage@1.0.0
  - @gertsai/rest-request-manager@1.0.0
  - @gertsai/async-utils@0.2.0
  - @gertsai/session@1.0.0
  - @gertsai/session-guard@1.0.0
  - @gertsai/pg-client@1.0.0
  - @gertsai/entity-audit@0.1.0
  - @gertsai/storage-core@1.0.0
  - @gertsai/logger-factory@1.0.0
  - @gertsai-examples/m9s-example-api-types@0.0.2
