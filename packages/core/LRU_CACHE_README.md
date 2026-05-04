# LRU Cache Implementation

High-performance O(1) LRU (Least Recently Used) cache with TTL, tenant isolation, and pattern-based invalidation.

## Overview

This implementation provides a production-ready LRU cache with the following characteristics:

- **O(1) time complexity** for get, set, delete operations
- **Per-entry TTL** (time-to-live) with lazy expiration
- **Tenant isolation** for multi-tenant applications
- **Pattern-based invalidation** using RegExp
- **Comprehensive statistics** tracking
- **Type-safe** with full TypeScript support
- **Zero dependencies** (pure TypeScript/JavaScript)

## Architecture

### Data Structures

The cache uses two complementary data structures for O(1) performance:

1. **Map**: Provides O(1) key-value lookups
2. **Doubly-linked list**: Maintains LRU order with O(1) reordering

```
Map<string, LRUNode<T>>
    ↓
[Head] ←→ [Node1] ←→ [Node2] ←→ [Tail]
 (MRU)                          (LRU)
```

### Key Components

#### LRUNode
Doubly-linked list node containing:
- `key`: Cache key
- `entry`: CacheEntry<T> with value and metadata
- `prev`, `next`: Pointers for linked list

#### CacheEntry
Value wrapper with metadata:
- `value`: Stored value
- `expiresAt`: Expiration timestamp (null = no expiration)
- `insertedAt`: Insertion timestamp

#### LRUCache
Main cache class with configurable options:
- `maxSize`: Maximum number of entries
- `defaultTTL`: Default time-to-live in milliseconds
- `tenantIsolation`: Enable tenant-prefixed keys
- `onEvict`: Callback for eviction events

#### TenantCache
Simplified wrapper for tenant-aware caching:
- Automatic tenant isolation
- Simplified API
- Tenant-scoped invalidation

## API Reference

### LRUCache<T>

```typescript
class LRUCache<T> {
  constructor(options?: LRUCacheOptions)

  // Core operations - O(1)
  get(key: CacheKey, options?: { tenantId?: TenantId }): T | undefined
  set(key: CacheKey, value: T, options?: { tenantId?: TenantId; ttl?: number }): void
  has(key: CacheKey, options?: { tenantId?: TenantId }): boolean
  delete(key: CacheKey, options?: { tenantId?: TenantId }): boolean

  // Batch operations
  invalidatePattern(pattern: RegExp): number  // O(n)
  clear(): void                                // O(n)
  evictExpired(): number                       // O(n)

  // Introspection
  getStats(): CacheStats
  resetStats(): void
  keys(): string[]
  get size(): number
}
```

### TenantCache<T>

```typescript
class TenantCache<T> {
  constructor(options?: Omit<LRUCacheOptions, 'tenantIsolation'>)

  // Simplified tenant-aware API
  get(tenantId: TenantId, key: CacheKey): T | undefined
  set(tenantId: TenantId, key: CacheKey, value: T, options?: { ttl?: number }): void
  has(tenantId: TenantId, key: CacheKey): boolean
  delete(tenantId: TenantId, key: CacheKey): boolean

  // Tenant-scoped operations
  invalidateTenant(tenantId: TenantId): number
  invalidatePattern(tenantId: TenantId, pattern: RegExp): number
}
```

## Usage Examples

### Basic LRU Cache

```typescript
import { LRUCache, toCacheKey } from '@gerts/core';

const cache = new LRUCache<string>({ maxSize: 100 });

// Set and get
cache.set(toCacheKey('user:123'), 'Alice');
const user = cache.get(toCacheKey('user:123')); // "Alice"

// Check existence
if (cache.has(toCacheKey('user:123'))) {
  console.log('User cached');
}

// Delete
cache.delete(toCacheKey('user:123'));
```

### TTL (Time-To-Live)

```typescript
// Cache with default 5-minute TTL
const cache = new LRUCache<string>({
  maxSize: 1000,
  defaultTTL: 5 * 60 * 1000
});

// Use default TTL
cache.set(toCacheKey('session:abc'), 'session-data');

// Override TTL for specific entry
cache.set(toCacheKey('temp:xyz'), 'temporary', { ttl: 10000 });

// No TTL (permanent until evicted)
cache.set(toCacheKey('config:app'), 'config', { ttl: undefined });

// Manual cleanup
const evicted = cache.evictExpired();
```

### Tenant Isolation

```typescript
import { TenantCache, toCacheKey, createTenantId } from '@gerts/core';

const tenant1 = createTenantId('acme-corp');
const tenant2 = createTenantId('widget-co');

const cache = new TenantCache<string>({ maxSize: 1000 });

// Isolated by tenant
cache.set(tenant1, toCacheKey('user:123'), 'Alice');
cache.set(tenant2, toCacheKey('user:123'), 'Bob');

cache.get(tenant1, toCacheKey('user:123')); // "Alice"
cache.get(tenant2, toCacheKey('user:123')); // "Bob"

// Invalidate all entries for tenant1
cache.invalidateTenant(tenant1);
```

### Pattern-Based Invalidation

```typescript
const cache = new LRUCache<string>();

// Set various entries
cache.set(toCacheKey('user:123:profile'), 'profile');
cache.set(toCacheKey('user:123:settings'), 'settings');
cache.set(toCacheKey('user:456:profile'), 'other-profile');
cache.set(toCacheKey('post:789'), 'post');

// Invalidate all user:123 entries
cache.invalidatePattern(/^user:123:/); // Returns 2

// Invalidate all user entries
cache.invalidatePattern(/^user:/); // Returns 1 (user:456:profile)
```

### Statistics Tracking

```typescript
const cache = new LRUCache<string>({ maxSize: 100 });

cache.set(toCacheKey('key1'), 'value1');
cache.get(toCacheKey('key1')); // hit
cache.get(toCacheKey('key2')); // miss

const stats = cache.getStats();
console.log(stats);
// {
//   hits: 1,
//   misses: 1,
//   evictions: 0,
//   size: 1,
//   maxSize: 100,
//   hitRate: 0.5
// }
```

### Eviction Callback

```typescript
const cache = new LRUCache<string>({
  maxSize: 100,
  onEvict: (key, value, reason) => {
    console.log(`Evicted: ${key} (${reason})`);
    // reason: 'capacity' | 'ttl' | 'manual' | 'pattern'
  }
});

cache.set(toCacheKey('key1'), 'value1');
cache.delete(toCacheKey('key1')); // Logs: "Evicted: key1 (manual)"
```

## Real-World Use Cases

### 1. User Session Cache

```typescript
interface UserSession {
  userId: string;
  email: string;
  roles: string[];
  lastActivity: Date;
}

const sessionCache = new LRUCache<UserSession>({
  maxSize: 10000,
  defaultTTL: 30 * 60 * 1000, // 30 minutes
  onEvict: (key, value, reason) => {
    if (reason === 'ttl') {
      const session = value as UserSession;
      console.log(`Session expired for user ${session.userId}`);
    }
  }
});
```

### 2. API Response Cache

```typescript
interface ApiResponse<T> {
  data: T;
  timestamp: number;
  etag: string;
}

const apiCache = new TenantCache<ApiResponse<unknown>>({
  maxSize: 5000,
  defaultTTL: 5 * 60 * 1000 // 5 minutes
});

// Cache API response per tenant
apiCache.set(tenantId, toCacheKey('api:/users'), {
  data: { users: [...] },
  timestamp: Date.now(),
  etag: 'abc123'
});
```

### 3. Database Query Cache

```typescript
interface QueryResult<T> {
  rows: T[];
  count: number;
  executionTime: number;
}

const queryCache = new LRUCache<QueryResult<unknown>>({
  maxSize: 1000,
  defaultTTL: 60 * 1000 // 1 minute
});

function executeQuery<T>(sql: string): QueryResult<T> {
  const cacheKey = toCacheKey(`query:${sql}`);
  const cached = queryCache.get(cacheKey);

  if (cached) {
    return cached as QueryResult<T>;
  }

  // Execute query and cache result
  const result = database.execute(sql);
  queryCache.set(cacheKey, result);
  return result;
}
```

### 4. GraphQL Field-Level Cache

```typescript
const fieldCache = new LRUCache<unknown>({
  maxSize: 10000,
  defaultTTL: 5 * 60 * 1000
});

function cacheField(typename: string, id: string, field: string, value: unknown) {
  const key = toCacheKey(`${typename}:${id}:${field}`);
  fieldCache.set(key, value);
}

function getCachedField(typename: string, id: string, field: string) {
  const key = toCacheKey(`${typename}:${id}:${field}`);
  return fieldCache.get(key);
}

// Invalidate all fields for a specific entity
fieldCache.invalidatePattern(/^User:123:/);
```

## Performance Characteristics

### Time Complexity

| Operation | Complexity | Notes |
|-----------|------------|-------|
| `get()` | O(1) | Map lookup + linked list reordering |
| `set()` | O(1) | Map insert + linked list manipulation |
| `delete()` | O(1) | Map delete + linked list removal |
| `has()` | O(1) | Map lookup only (no LRU update) |
| `invalidatePattern()` | O(n) | Must iterate all keys |
| `clear()` | O(n) | Clear Map + reset list |
| `evictExpired()` | O(n) | Iterate all entries |

### Space Complexity

- **O(n)** where n is the number of cached entries
- Each entry stores: value + metadata (24 bytes) + linked list pointers (16 bytes)
- Map overhead: ~64 bytes per entry

### Benchmark Results

On modern hardware (M1/M2 MacBook):

```
Operations: 10,000 inserts + 1,000 random accesses
Duration: <100ms
Throughput: >100,000 ops/second
```

## Design Decisions

### Why Doubly-Linked List?

- **O(1) reordering**: Move accessed nodes to head in constant time
- **O(1) eviction**: Remove tail node in constant time
- **Minimal overhead**: Only 2 pointers per node

### Why Lazy TTL Expiration?

- **No background timers**: Avoids setInterval/setTimeout overhead
- **Memory efficient**: No timer objects
- **On-demand cleanup**: Expiration checked during access
- **Manual cleanup**: `evictExpired()` for batch cleanup

### Why Map + Linked List?

Alternative approaches considered:

| Approach | Get | Set | Evict | Notes |
|----------|-----|-----|-------|-------|
| Array-based | O(1) | O(1) | **O(n)** | Array splice for eviction |
| Map only | O(1) | O(1) | **O(n)** | Must iterate to find LRU |
| **Map + List** | O(1) | O(1) | **O(1)** | Chosen approach |

## Testing

The implementation includes 43 comprehensive tests covering:

- Basic operations (get, set, delete, has)
- LRU eviction behavior
- TTL expiration (with async tests)
- Tenant isolation
- Pattern-based invalidation
- Statistics tracking
- Edge cases (undefined values, single-element cache, etc.)
- Performance characteristics

Run tests:

```bash
pnpm --filter @gerts/core test lru-cache
```

## Type Safety

The cache leverages TypeScript's type system for compile-time safety:

### Branded Types

```typescript
type CacheKey = string & { __brand: 'CacheKey' };
type TenantId = string & { __brand: 'TenantId' };
```

### Generic Type Parameter

```typescript
const cache = new LRUCache<User>();
// TypeScript ensures only User objects are stored/retrieved
```

### Strict Null Checks

```typescript
const value = cache.get(key); // T | undefined
// TypeScript forces null checking
```

## Migration from Naive Array Implementation

If replacing an O(n) array-based cache:

### Before (Array-based - O(n) eviction)

```typescript
class NaiveCache<T> {
  private items: Array<{ key: string; value: T; timestamp: number }> = [];

  evictOldest() {
    // O(n) - must find oldest and splice array
    const oldestIndex = this.items.reduce((oldest, item, idx) =>
      item.timestamp < this.items[oldest].timestamp ? idx : oldest, 0);
    this.items.splice(oldestIndex, 1); // O(n)
  }
}
```

### After (LRU Cache - O(1) eviction)

```typescript
import { LRUCache, toCacheKey } from '@gerts/core';

const cache = new LRUCache<T>({ maxSize: 100 });
// Automatic O(1) eviction when capacity reached
```

## Integration with gerts.ai

The LRU cache is designed to integrate seamlessly with the gerts.ai platform:

### Memory System

```typescript
import { LRUCache, toCacheKey, type TenantId } from '@gerts/core';

class MemoryService {
  private cache = new TenantCache<Memory>({
    maxSize: 10000,
    defaultTTL: 60 * 60 * 1000 // 1 hour
  });

  async getMemory(tenantId: TenantId, memoryId: string): Promise<Memory> {
    const cached = this.cache.get(tenantId, toCacheKey(`memory:${memoryId}`));
    if (cached) return cached;

    const memory = await this.db.getMemory(memoryId);
    this.cache.set(tenantId, toCacheKey(`memory:${memoryId}`), memory);
    return memory;
  }
}
```

### Graph RAG

```typescript
class GraphRAGService {
  private entityCache = new TenantCache<Entity>({
    maxSize: 50000,
    defaultTTL: 30 * 60 * 1000 // 30 minutes
  });

  invalidateEntity(tenantId: TenantId, entityId: string) {
    this.entityCache.invalidatePattern(
      tenantId,
      new RegExp(`^entity:${entityId}:`)
    );
  }
}
```

## Future Enhancements

Potential improvements for future iterations:

1. **LRU-K**: Track K most recent accesses for better eviction
2. **Segmented LRU**: Separate cache into protected/probationary segments
3. **Adaptive TTL**: Adjust TTL based on access patterns
4. **Compression**: Compress large values to save memory
5. **Persistence**: Optional disk backing for large caches
6. **Metrics**: Integration with Prometheus/StatsD

## References

- [LRU Cache - Wikipedia](https://en.wikipedia.org/wiki/Cache_replacement_policies#Least_recently_used_(LRU))
- [Redis LRU Implementation](https://redis.io/docs/reference/eviction/)
- [TypeScript Advanced Types](https://www.typescriptlang.org/docs/handbook/2/types-from-types.html)

## License

Part of the gerts.ai monorepo - see root LICENSE file.
