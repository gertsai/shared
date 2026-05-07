/**
 * LRU Cache Examples
 *
 * Demonstrates usage patterns for high-performance O(1) LRU cache
 */

import { LRUCache, TenantCache, toCacheKey } from './lru-cache';
import { createTenantId } from './ids';

// =============================================================================
// Example 1: Basic LRU Cache Usage
// =============================================================================

function basicUsageExample() {
  console.log('\n=== Basic LRU Cache Usage ===\n');

  // Create cache with max 100 entries
  const cache = new LRUCache<string>({ maxSize: 100 });

  // Set values
  cache.set(toCacheKey('user:123'), 'Alice');
  cache.set(toCacheKey('user:456'), 'Bob');

  // Get values
  const user = cache.get(toCacheKey('user:123'));
  console.log('User:', user); // "Alice"

  // Check existence
  if (cache.has(toCacheKey('user:789'))) {
    console.log('User exists');
  } else {
    console.log('User not found');
  }

  // Delete entry
  cache.delete(toCacheKey('user:456'));

  // Clear all
  cache.clear();
}

// =============================================================================
// Example 2: LRU Eviction Behavior
// =============================================================================

function lruEvictionExample() {
  console.log('\n=== LRU Eviction Example ===\n');

  const cache = new LRUCache<string>({
    maxSize: 3,
    onEvict: (key, value, reason) => {
      console.log(`Evicted: ${key} = ${value} (${reason})`);
    },
  });

  // Fill cache
  cache.set(toCacheKey('key1'), 'value1'); // Order: [1]
  cache.set(toCacheKey('key2'), 'value2'); // Order: [2, 1]
  cache.set(toCacheKey('key3'), 'value3'); // Order: [3, 2, 1]

  // Access key1 to make it most recently used
  cache.get(toCacheKey('key1')); // Order: [1, 3, 2]

  // Add key4 - should evict key2 (least recently used)
  cache.set(toCacheKey('key4'), 'value4'); // Order: [4, 1, 3], evicts key2

  console.log('Has key1:', cache.has(toCacheKey('key1'))); // true
  console.log('Has key2:', cache.has(toCacheKey('key2'))); // false (evicted)
  console.log('Has key3:', cache.has(toCacheKey('key3'))); // true
  console.log('Has key4:', cache.has(toCacheKey('key4'))); // true
}

// =============================================================================
// Example 3: TTL (Time-To-Live) Cache
// =============================================================================

// eslint-disable-next-line no-unused-vars -- example referenced via commented-out runExamples() call (line ~399); kept as live documentation
async function ttlExample() {
  console.log('\n=== TTL Cache Example ===\n');

  // Cache with default 5-second TTL
  const cache = new LRUCache<string>({ defaultTTL: 5000 });

  // Use default TTL
  cache.set(toCacheKey('session:abc'), 'user-session-data');

  // Override TTL for specific entry (30 seconds)
  cache.set(toCacheKey('token:xyz'), 'auth-token', { ttl: 30000 });

  // No TTL (permanent until evicted)
  cache.set(toCacheKey('config:app'), 'config-data', { ttl: undefined });

  console.log('Session:', cache.get(toCacheKey('session:abc'))); // exists

  // Wait 6 seconds
  await new Promise((resolve) => setTimeout(resolve, 6000));

  console.log('Session after 6s:', cache.get(toCacheKey('session:abc'))); // undefined (expired)
  console.log('Token after 6s:', cache.get(toCacheKey('token:xyz'))); // exists (30s TTL)
  console.log('Config after 6s:', cache.get(toCacheKey('config:app'))); // exists (no TTL)

  // Manually evict expired entries
  const evicted = cache.evictExpired();
  console.log('Evicted entries:', evicted);
}

// =============================================================================
// Example 4: Tenant-Isolated Cache
// =============================================================================

function tenantIsolationExample() {
  console.log('\n=== Tenant Isolation Example ===\n');

  const tenant1 = createTenantId('acme-corp');
  const tenant2 = createTenantId('widget-co');

  // Option 1: Manual tenant isolation
  const cache = new LRUCache<string>({ tenantIsolation: true });

  cache.set(toCacheKey('user:123'), 'Alice', { tenantId: tenant1 });
  cache.set(toCacheKey('user:123'), 'Bob', { tenantId: tenant2 });

  console.log('Tenant1 user:', cache.get(toCacheKey('user:123'), { tenantId: tenant1 })); // "Alice"
  console.log('Tenant2 user:', cache.get(toCacheKey('user:123'), { tenantId: tenant2 })); // "Bob"

  // Option 2: TenantCache wrapper (recommended)
  const tenantCache = new TenantCache<string>();

  tenantCache.set(tenant1, toCacheKey('user:456'), 'Charlie');
  tenantCache.set(tenant2, toCacheKey('user:456'), 'Diana');

  console.log('Tenant1 user:', tenantCache.get(tenant1, toCacheKey('user:456'))); // "Charlie"
  console.log('Tenant2 user:', tenantCache.get(tenant2, toCacheKey('user:456'))); // "Diana"

  // Invalidate all entries for tenant1
  const invalidated = tenantCache.invalidateTenant(tenant1);
  console.log('Invalidated tenant1 entries:', invalidated);
}

// =============================================================================
// Example 5: Pattern-Based Invalidation
// =============================================================================

function patternInvalidationExample() {
  console.log('\n=== Pattern Invalidation Example ===\n');

  const cache = new LRUCache<string>();

  // Set various entries
  cache.set(toCacheKey('user:123:profile'), 'profile-data');
  cache.set(toCacheKey('user:123:settings'), 'settings-data');
  cache.set(toCacheKey('user:123:preferences'), 'prefs-data');
  cache.set(toCacheKey('user:456:profile'), 'other-profile');
  cache.set(toCacheKey('post:789'), 'post-data');

  // Invalidate all user:123 entries
  const invalidated = cache.invalidatePattern(/^user:123:/);
  console.log('Invalidated entries:', invalidated); // 3

  console.log('Has user:123:profile:', cache.has(toCacheKey('user:123:profile'))); // false
  console.log('Has user:456:profile:', cache.has(toCacheKey('user:456:profile'))); // true
  console.log('Has post:789:', cache.has(toCacheKey('post:789'))); // true

  // Invalidate all user entries
  cache.invalidatePattern(/^user:/);
  console.log('Has user:456:profile:', cache.has(toCacheKey('user:456:profile'))); // false
}

// =============================================================================
// Example 6: Statistics Tracking
// =============================================================================

function statisticsExample() {
  console.log('\n=== Statistics Example ===\n');

  const cache = new LRUCache<string>({ maxSize: 100 });

  // Simulate cache operations
  cache.set(toCacheKey('key1'), 'value1');
  cache.set(toCacheKey('key2'), 'value2');
  cache.set(toCacheKey('key3'), 'value3');

  cache.get(toCacheKey('key1')); // hit
  cache.get(toCacheKey('key1')); // hit
  cache.get(toCacheKey('key2')); // hit
  cache.get(toCacheKey('nonexistent')); // miss
  cache.get(toCacheKey('also-missing')); // miss

  // Get statistics
  const stats = cache.getStats();
  console.log('Cache Statistics:');
  console.log('  Hits:', stats.hits); // 3
  console.log('  Misses:', stats.misses); // 2
  console.log('  Hit Rate:', (stats.hitRate * 100).toFixed(1) + '%'); // 60%
  console.log('  Evictions:', stats.evictions); // 0
  console.log('  Size:', stats.size); // 3
  console.log('  Max Size:', stats.maxSize); // 100

  // Reset statistics
  cache.resetStats();
  console.log('Stats reset:', cache.getStats().hits); // 0
}

// =============================================================================
// Example 7: Real-World User Session Cache
// =============================================================================

interface UserSession {
  userId: string;
  email: string;
  roles: string[];
  lastActivity: Date;
}

function userSessionCacheExample() {
  console.log('\n=== User Session Cache Example ===\n');

  // Session cache with 30-minute default TTL
  const sessionCache = new LRUCache<UserSession>({
    maxSize: 10000,
    defaultTTL: 30 * 60 * 1000, // 30 minutes
    onEvict: (key, value, reason) => {
      if (reason === 'ttl') {
        const session = value as UserSession;
        console.log(`Session expired for user ${session.userId}`);
      }
    },
  });

  // Store session
  const session: UserSession = {
    userId: 'user-123',
    email: 'alice@example.com',
    roles: ['user', 'admin'],
    lastActivity: new Date(),
  };

  sessionCache.set(toCacheKey('session:abc-def-ghi'), session);

  // Retrieve session
  const retrievedSession = sessionCache.get(toCacheKey('session:abc-def-ghi'));
  if (retrievedSession) {
    console.log('Session found:', retrievedSession.email);
  }

  // Invalidate all sessions for a user
  sessionCache.invalidatePattern(/^session:.*user-123/);
}

// =============================================================================
// Example 8: Multi-Tenant API Response Cache
// =============================================================================

interface ApiResponse<T> {
  data: T;
  timestamp: number;
  etag: string;
}

function apiResponseCacheExample() {
  console.log('\n=== API Response Cache Example ===\n');

  const tenant1 = createTenantId('tenant1');
  const tenant2 = createTenantId('tenant2');

  const apiCache = new TenantCache<ApiResponse<unknown>>({
    maxSize: 5000,
    defaultTTL: 5 * 60 * 1000, // 5 minutes
  });

  // Cache API response for tenant1
  const response: ApiResponse<{ users: string[] }> = {
    data: { users: ['Alice', 'Bob'] },
    timestamp: Date.now(),
    etag: 'abc123',
  };

  apiCache.set(tenant1, toCacheKey('api:/users'), response);

  // Retrieve cached response
  const cached = apiCache.get(tenant1, toCacheKey('api:/users'));
  if (cached) {
    console.log('Cached response:', cached.data);
    console.log('Cache age:', Date.now() - cached.timestamp, 'ms');
  }

  // Invalidate all API cache entries for tenant1
  apiCache.invalidatePattern(tenant1, /^api:\//);

  // Invalidate all cache entries for tenant2
  apiCache.invalidateTenant(tenant2);
}

// =============================================================================
// Example 9: Database Query Result Cache
// =============================================================================

interface QueryResult<T> {
  rows: T[];
  count: number;
  executionTime: number;
}

function databaseCacheExample() {
  console.log('\n=== Database Query Cache Example ===\n');

  const queryCache = new LRUCache<QueryResult<unknown>>({
    maxSize: 1000,
    defaultTTL: 60 * 1000, // 1 minute for read queries
  });

  // Simulate expensive query
  function executeQuery<T>(sql: string): QueryResult<T> {
    const start = Date.now();

    // Check cache first
    const cacheKey = toCacheKey(`query:${sql}`);
    const cached = queryCache.get(cacheKey);

    if (cached) {
      console.log('Cache HIT:', sql);
      return cached as QueryResult<T>;
    }

    console.log('Cache MISS:', sql);

    // Simulate database query
    const result: QueryResult<T> = {
      rows: [] as T[],
      count: 0,
      executionTime: Date.now() - start,
    };

    // Cache result with 1-minute TTL
    queryCache.set(cacheKey, result);

    return result;
  }

  // Execute queries
  executeQuery('SELECT * FROM users WHERE status = "active"'); // MISS
  executeQuery('SELECT * FROM users WHERE status = "active"'); // HIT
  executeQuery('SELECT * FROM posts WHERE published = true'); // MISS

  // Invalidate all query cache when data changes
  queryCache.invalidatePattern(/^query:/);
}

// =============================================================================
// Example 10: GraphQL Field-Level Cache
// =============================================================================

function graphqlCacheExample() {
  console.log('\n=== GraphQL Field Cache Example ===\n');

  const fieldCache = new LRUCache<unknown>({
    maxSize: 10000,
    defaultTTL: 5 * 60 * 1000, // 5 minutes
  });

  // Cache individual field resolver results
  function cacheField(
    typename: string,
    id: string,
    field: string,
    value: unknown,
    ttl?: number
  ): void {
    const key = toCacheKey(`${typename}:${id}:${field}`);
    fieldCache.set(key, value, { ttl });
  }

  function getCachedField(typename: string, id: string, field: string): unknown {
    const key = toCacheKey(`${typename}:${id}:${field}`);
    return fieldCache.get(key);
  }

  // Cache user fields separately
  cacheField('User', '123', 'email', 'alice@example.com');
  cacheField('User', '123', 'profile', { bio: 'Software Engineer' });

  // Retrieve cached field
  const email = getCachedField('User', '123', 'email');
  console.log('Cached email:', email);

  // Invalidate all fields for a user
  fieldCache.invalidatePattern(/^User:123:/);

  // Invalidate all User entities
  fieldCache.invalidatePattern(/^User:/);
}

// =============================================================================
// Run Examples
// =============================================================================

export async function runExamples() {
  basicUsageExample();
  lruEvictionExample();
  // await ttlExample(); // Uncomment to run (requires waiting)
  tenantIsolationExample();
  patternInvalidationExample();
  statisticsExample();
  userSessionCacheExample();
  apiResponseCacheExample();
  databaseCacheExample();
  graphqlCacheExample();
}

// Uncomment to run examples:
// runExamples().catch(console.error);
