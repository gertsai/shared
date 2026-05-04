<div align="center">

# @gertsai/api-rlr

### Production-grade rate limit middleware for Moleculer.js APIs

Sliding-window и GCRA algorithms через Redis Lua scripts, PostgreSQL adapter
с structural-typed `PgClient` interface (Prisma/Drizzle/raw-pg drop-in), и
in-memory adapter для tests/dev. Draft-6 и Draft-7 IETF rate-limit headers
из коробки.

[![Tier](https://img.shields.io/badge/tier-5-red?style=flat-square)](#status)
[![Build](https://img.shields.io/badge/build-tsc-blue?style=flat-square)](#status)
[![Status](https://img.shields.io/badge/status-stable-green?style=flat-square)](#status)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue?style=flat-square)](#license)

</div>

---

`@gertsai/api-rlr` is a battle-tested rate limit middleware for Moleculer.js
HTTP services. It plugs into `moleculer-web` as a single middleware function,
chooses an algorithm and storage backend независимо, и emits standards-compliant
rate-limit headers — без зависимости от конкретного ORM или storage.

The PostgreSQL adapter is **database-agnostic by design** (per ADR-011): it
accepts any client structurally compatible с Prisma's `$queryRawUnsafe` /
`$executeRawUnsafe` / `$transaction` surface. Pass your `PrismaClient` and it
works; swap in Drizzle, Kysely, raw `pg`, or your own wrapper — same code path.

## Why @gertsai/api-rlr

- **Two algorithms, three storage backends** — Sliding-Window (precise count
  per time window) и GCRA (smooth bursts, RFC-2698 inspired); Redis (production,
  Lua-atomic), PostgreSQL (database-agnostic), MemoryAdapter (tests/dev).
- **Lua scripts for atomicity** — Redis path uses pre-compiled Lua scripts
  (sliding window + GCRA + leaky bucket) — single round-trip, atomic CAS-free
  rate decisions. Scripts shipped в `dist/scripts/*.lua` через `pnpm copy:lua`.
- **Database-agnostic PostgreSQL adapter** — local `PgClient` interface (3
  methods) means PrismaClient instances are drop-in compatible; Drizzle,
  Kysely, raw `pg`, or wrapper of your choice all work без code changes.
- **Standards-compliant headers** — IETF Draft-6 (`X-RateLimit-*`) и Draft-7
  (`RateLimit-*`) header writers; client-side parser (`updateFromHeaders`)
  for self-throttling clients.
- **Per-route presets** — `RateLimitPresets` (strict/lenient/burst/api-tier),
  `RoutePresets` for common path patterns, `withPreset()` for ergonomic
  composition.
- **Operational toolkit** — `RateLimitHealthCheck` (Redis ping, queue depth),
  `RateLimitDebugger` (per-key trace), `RateLimitTestUtils` (simulate burst
  patterns в unit tests), `ConfigValidator` (early failure for invalid configs).
- **Path normalization** — `PathNormalizer` collapses `/users/123` / `/users/456`
  into one bucket via configurable rules, preventing per-id key explosion.

## Install

```bash
pnpm add @gertsai/api-rlr ioredis
# peers (если используете Moleculer integration):
pnpm add moleculer moleculer-web
```

```jsonc
// package.json
{
  "dependencies": {
    "@gertsai/api-rlr": "^0.1.0",
    "ioredis": "^5.7.0"
  },
  "peerDependencies": {
    "moleculer": "^0.14.35",
    "moleculer-web": "^0.10.6"
  }
}
```

## Quickstart

### Moleculer middleware

```typescript
import { RLRMiddleware, LimiterStrategy } from '@gertsai/api-rlr';
import RedisClient from 'ioredis';

const redis = new RedisClient(process.env.REDIS_URL);

export const rlr = RLRMiddleware({
  redis,
  strategy: LimiterStrategy.SLIDING_WINDOW,
  windowMs: 60_000,           // 1-minute window
  max: 100,                   // 100 requests per window
  keyGenerator: (req) => req.ip,
  draftVersion: 7,            // Emit RateLimit-* headers (IETF Draft-7)
});

// Wire into moleculer-web
broker.createService({
  mixins: [ApiGateway],
  settings: {
    routes: [{ path: '/api', use: [rlr] }],
  },
});
```

### Direct adapter usage (no Moleculer)

```typescript
import { RedisAdapter, SlidingWindowStrategy } from '@gertsai/api-rlr';
import RedisClient from 'ioredis';

const adapter = new RedisAdapter({ redis: new RedisClient() });
const strategy = new SlidingWindowStrategy(adapter);

const result = await strategy.check({
  key: 'user:123:api',
  windowMs: 60_000,
  max: 100,
});

if (!result.allowed) {
  throw new Error(`Rate limited. Retry in ${result.resetMs}ms`);
}
```

### PostgreSQL adapter (Prisma/Drizzle/raw-pg)

```typescript
import { PrismaClient } from '@prisma/client';
import { PostgreSQLAdapter, GCRAStrategy } from '@gertsai/api-rlr';

const prisma = new PrismaClient();
const adapter = new PostgreSQLAdapter({ prisma, keyPrefix: 'rl:' });
const strategy = new GCRAStrategy(adapter);

// Same StorageAdapter contract as Redis — algorithms work unchanged
```

The `PostgreSQLAdapter` accepts any object matching the `PgClient` interface:

```typescript
interface PgClient {
  $queryRawUnsafe<T>(query: string, ...values: unknown[]): Promise<T>;
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>;
  $transaction<T>(fn: (tx: TransactionClient) => Promise<T>): Promise<T>;
}
```

## What you get

| Adapter | When to use | Backing store |
|---|---|---|
| **`RedisAdapter`** | Production, multi-node, hot path | Redis 6+ с Lua scripts |
| **`PostgreSQLAdapter`** | Single-DB stacks, no Redis ops budget | Any Prisma-shaped client |
| **`MemoryAdapter`** | Tests, single-process dev | In-process Map |

| Strategy | Behaviour | Best for |
|---|---|---|
| **`SlidingWindowStrategy`** | Precise count в скользящем окне | API quotas, fairness |
| **`GCRAStrategy`** | Generic Cell Rate Algorithm (smooth bursts) | Token-bucket-style limits |
| **`LeakyBucketStrategy`** | Token bucket с continuous drain | Smoothing burst traffic |

## API surface

```typescript
// Middleware factory (default export)
import RLRMiddleware from '@gertsai/api-rlr';

// Named exports — config & types
import {
  RLRMiddleware,
  LimiterStrategy,
  DraftVersionType,
  Methods,
  type RateLimitOptions,
  type RateLimitInfo,
  type RateLimitScope,
} from '@gertsai/api-rlr';

// Adapters & strategies
import {
  RedisAdapter,
  PostgreSQLAdapter,
  MemoryAdapter,
  SlidingWindowStrategy,
  GCRAStrategy,
  LeakyBucketStrategy,
  type StorageAdapter,
  type PostgreSQLAdapterConfig,
} from '@gertsai/api-rlr';

// Services & utilities
import {
  PathNormalizer,
  KeyGenerator,
  RouteResolver,
  RateLimitPresets,
  RoutePresets,
  withPreset,
  ConfigValidator,
  RateLimitHealthCheck,
  RateLimitDebugger,
  RateLimitTestUtils,
  RateLimitError,
  setDraft6Headers,
  setDraft7Headers,
} from '@gertsai/api-rlr';
```

## Status

- **Tier 5** of `@gertsai/*` first-wave packages (per [ADR-011][adr-011]).
- **Stable** — extracted from `gertsai_codex` с preserved git history;
  production-tested in the Hub Tenant Delivery API path.
- **Tests** — 35 test files; algorithmic unit tests pass без external infra.
  Redis-backed tests опционально run with `HAS_REDIS=1 pnpm test:redis`.
  PostgreSQL integration tests skipped в OSS extraction (depended on internal
  Prisma helpers — see [`KNOWN-ISSUES.md`](../../KNOWN-ISSUES.md#api-rlr)).
- **Database-agnostic** — `PgClient` interface (per ADR-011 invariants I-1, I-2):
  no dependency on `@gertsai/database` или any specific ORM.

## License

[Apache 2.0](./LICENSE) — same as the rest of `@gertsai/*`.

[adr-011]: https://github.com/gertsai/shared/blob/main/.forgeplan/adrs/ADR-011-first-wave-extension-to-14-packages-add-api-rlr-refines-adr-009.md
