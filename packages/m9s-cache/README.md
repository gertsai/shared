<div align="center">

# @gertsai/m9s-cache

### Moleculer-compatible cache abstraction with Redis/Valkey, tags, and optional locks

A pluggable cache layer for Node services. Drop-in `Cacher` for Moleculer, a typed
`CacheStore` you can use anywhere, tag-based invalidation, and opt-in Redlock locks.

[![npm](https://img.shields.io/badge/npm-%40gertsai%2Fm9s--cache-cb3837?style=flat-square)](https://www.npmjs.com/package/@gertsai/m9s-cache)
[![License: MIT](https://img.shields.io/badge/license-MIT-000.svg?style=flat-square)](LICENSE)
[![Status](https://img.shields.io/badge/status-alpha-orange?style=flat-square)](#status)
[![Tier](https://img.shields.io/badge/tier-1%20(no%20internal%20deps)-blue?style=flat-square)](#status)

</div>

---

## Why @gertsai/m9s-cache

<table>
<tr>
<td width="50%">

### Without it
- Each service rolls its own Redis wrapper
- Invalidation is "delete by prefix and pray"
- Moleculer's built-in cacher has no tags, no locks
- Stampedes hit the origin every TTL expiry
- Memory + Redis means two code paths

</td>
<td width="50%">

### With it
- One `CacheStore` API across memory and Redis/Valkey
- Tag-based invalidation via version bumps, no key scans
- Drop-in Moleculer `Cacher` plus a DB mixin
- Optional Redlock-backed `wrap()` for stampede control
- Same code in unit tests (memory) and prod (Redis)

</td>
</tr>
</table>

## Install

```bash
pnpm add @gertsai/m9s-cache ioredis moleculer
# Optional: distributed locks
pnpm add redlock
```

Peer deps (`ioredis`, `moleculer`, `redlock`) are optional — install what you use. Node `>=18`, ESM-only.

## Quickstart

### Memory driver (tests, single-process)

```ts
import { CacheStore, MemoryCacheDriver, JsonSerializer } from '@gertsai/m9s-cache';

const cache = new CacheStore({
  driver: new MemoryCacheDriver(),
  serializer: new JsonSerializer(),
  defaultTTL: 60,
});
await cache.set('user:42', { id: 42, name: 'Ada' });
const user = await cache.get<{ id: number; name: string }>('user:42');
```

### Redis / Valkey driver (Moleculer broker)

```ts
import { ServiceBroker } from 'moleculer';
import Redis from 'ioredis';
import {
  M9sCacheCacher,
  RedisCacheDriver,
  RedlockLockProvider,
} from '@gertsai/m9s-cache';

const redis = new Redis(process.env.REDIS_URL!);
const lockProvider = new RedlockLockProvider({ clients: [redis] });

const broker = new ServiceBroker({
  cacher: new M9sCacheCacher({
    driver: new RedisCacheDriver({ client: redis }),
    lockProvider,
    ttl: 60,
  }),
});
```

### Tag-based invalidation on an action

```ts
actions: {
  getUser: {
    cache: {
      keys: ['id'],
      tags: [
        { name: 'user', path: ['*'], idField: 'id', timestampField: 'updatedAt' },
      ],
    },
    handler(ctx) { /* ... */ }
  }
}
```

### Moleculer DB mixin (auto-invalidate on entity events)

```ts
import { moleculerDbCacheMixin } from '@gertsai/m9s-cache';

export default {
  name: 'users',
  mixins: [moleculerDbCacheMixin({ name: 'User' })],
};
```

## What you get

| | |
|:---|:---|
| **Drivers** | `MemoryCacheDriver` (LRU + TTL), `RedisCacheDriver` (single node, Sentinel, Cluster) |
| **Tag invalidation** | `generateTags()` + `CacheTagConfig` — version-based bumps, no `KEYS *` scans |
| **Locks** | `NoopLockProvider` (default), `RedlockLockProvider` for stampede protection in `wrap()` |
| **TTL** | Per-key, per-action, per-store; validated via `validateTTL` (`MIN`/`MAX_TTL_SECONDS`) |
| **Moleculer cacher** | `M9sCacheCacher` — drop-in replacement for the built-in cacher |
| **Moleculer DB mixin** | `moleculerDbCacheMixin` — auto-invalidate on `entityCreated/Updated/Removed` |
| **Serializers** | `JsonSerializer`, `TypedSerializer`, `BinarySerializer`, `PassthroughSerializer` |
| **Typed keys** | `CacheKey` brand, `validateCacheKey`, `createCacheKey`, `CacheKeyError` |
| **Errors** | `CacheError` + `CacheErrorCode` enum, `createCacheError` factory |
| **Envelope format** | `CacheEnvelope` with `isCacheEnvelope` guard for cross-version reads |

## API surface

Top-level exports from `@gertsai/m9s-cache`:

```ts
// Core + drivers
CacheStore
MemoryCacheDriver, RedisCacheDriver

// Lock providers + serializers
NoopLockProvider, RedlockLockProvider
JsonSerializer, TypedSerializer, BinarySerializer, PassthroughSerializer

// Moleculer integration
M9sCacheCacher, moleculerDbCacheMixin

// Tags, keys, errors, TTL, envelope
generateTags
validateCacheKey, isCacheKey, createCacheKey, CacheKeyError, DEFAULT_KEY_PATTERN
CacheError, CacheErrorCode, createCacheError
validateTTL, MIN_TTL_SECONDS, MAX_TTL_SECONDS
isCacheEnvelope
```

Plus types: `CachePayload`, `CacheDriver`, `CacheSerializer`, `CacheStoreOptions`,
`CacheSetOptions`, `CacheWrapOptions`, `CacheLockProvider`, `CacheTagConfig`,
`CacheTag`, `MoleculerCachedAction`, `MoleculerCacheOptions`, `CacheEnvelope`,
`EntityId`, `Identifiable`, and friends.

## Drivers

| Driver | Use for | Notes |
|---|---|---|
| **`MemoryCacheDriver`** | Tests, single-process apps, dev mode | LRU eviction + TTL sweep, no external deps |
| **`RedisCacheDriver`** | Production, multi-instance services | `ioredis` client; supports single node, Sentinel, and Cluster topologies (Valkey-compatible) |

### Redis Cluster / Valkey

```ts
const driver = new RedisCacheDriver({
  cluster: {
    nodes: [
      { host: '10.0.0.1', port: 6379 },
      { host: '10.0.0.2', port: 6379 },
    ],
  },
});
```

Notes:
- TTL values are in **seconds**.
- Lock TTL is in **milliseconds** (default 15 000).
- Tag keys are stored under the `TAG-` prefix (after the cache prefix).

## Status

- **Version**: `0.1.0` — alpha. Public API may shift before `1.0`.
- **Tier**: 1 (no internal `@gertsai/*` dependencies).
- **Runtime**: Node `>=18`, ESM-only.
- **Tests**: `vitest` — `CacheStore`, both drivers, Moleculer cacher, DB mixin, tags.

## License

MIT — see [LICENSE](LICENSE).
