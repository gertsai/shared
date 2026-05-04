# @gerts/m9s-cache

Moleculer-compatible cache abstraction with Redis/Valkey driver support, tags, and optional locks.

## Install

```bash
pnpm add @gerts/m9s-cache ioredis moleculer
# Optional: for distributed locks
pnpm add redlock
```

## Usage (Moleculer)

```ts
import { ServiceBroker } from 'moleculer';
import { M9sCacheCacher, RedisCacheDriver, RedlockLockProvider } from '@gerts/m9s-cache';
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);
const lockProvider = new RedlockLockProvider({ clients: [redis] });

const broker = new ServiceBroker({
  cacher: new M9sCacheCacher({
    driver: new RedisCacheDriver({ client: redis }),
    lockProvider,
    ttl: 60,
  }),
});
```

## Tag-based invalidation

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

## Moleculer DB mixin

```ts
import { moleculerDbCacheMixin } from '@gerts/m9s-cache';

export default {
  name: 'users',
  mixins: [moleculerDbCacheMixin({ name: 'User' })],
};
```

## Redis Cluster / Valkey

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

## Notes

- TTL values are in **seconds**.
- Lock TTL is in **milliseconds** (default 15s).
- Tag keys are stored under `TAG-` prefix (after cache prefix).
