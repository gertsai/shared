---
'@gertsai/m9s-cache': minor
'@gertsai-examples/m9s-example': patch
---

Wave 12.B-fix-1 — close CRITICAL external-type-leak (EVID-044 CRIT-1)
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
