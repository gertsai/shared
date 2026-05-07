import { describe, it, expect, beforeEach } from 'vitest';
import { LRUCache, TenantCache, toCacheKey } from './lru-cache';
import { createTenantId } from './ids';

describe('LRUCache', () => {
  describe('Basic Operations', () => {
    let cache: LRUCache<string>;

    beforeEach(() => {
      cache = new LRUCache<string>({ maxSize: 3 });
    });

    it('should set and get values', () => {
      cache.set(toCacheKey('key1'), 'value1');
      expect(cache.get(toCacheKey('key1'))).toBe('value1');
    });

    it('should return undefined for non-existent keys', () => {
      expect(cache.get(toCacheKey('nonexistent'))).toBeUndefined();
    });

    it('should update existing values', () => {
      cache.set(toCacheKey('key1'), 'value1');
      cache.set(toCacheKey('key1'), 'value2');
      expect(cache.get(toCacheKey('key1'))).toBe('value2');
      expect(cache.size).toBe(1);
    });

    it('should check key existence with has()', () => {
      cache.set(toCacheKey('key1'), 'value1');
      expect(cache.has(toCacheKey('key1'))).toBe(true);
      expect(cache.has(toCacheKey('key2'))).toBe(false);
    });

    it('should delete keys', () => {
      cache.set(toCacheKey('key1'), 'value1');
      expect(cache.delete(toCacheKey('key1'))).toBe(true);
      expect(cache.has(toCacheKey('key1'))).toBe(false);
      expect(cache.delete(toCacheKey('key1'))).toBe(false);
    });

    it('should track cache size', () => {
      expect(cache.size).toBe(0);
      cache.set(toCacheKey('key1'), 'value1');
      expect(cache.size).toBe(1);
      cache.set(toCacheKey('key2'), 'value2');
      expect(cache.size).toBe(2);
      cache.delete(toCacheKey('key1'));
      expect(cache.size).toBe(1);
    });

    it('should clear all entries', () => {
      cache.set(toCacheKey('key1'), 'value1');
      cache.set(toCacheKey('key2'), 'value2');
      cache.clear();
      expect(cache.size).toBe(0);
      expect(cache.has(toCacheKey('key1'))).toBe(false);
    });

    it('should list all keys', () => {
      cache.set(toCacheKey('key1'), 'value1');
      cache.set(toCacheKey('key2'), 'value2');
      const keys = cache.keys();
      expect(keys).toHaveLength(2);
      expect(keys).toContain('key1');
      expect(keys).toContain('key2');
    });
  });

  describe('LRU Eviction', () => {
    let cache: LRUCache<string>;
    let evictedKeys: string[] = [];

    beforeEach(() => {
      evictedKeys = [];
      cache = new LRUCache<string>({
        maxSize: 3,
        onEvict: (key, _value, reason) => {
          if (reason === 'capacity') {
            evictedKeys.push(key);
          }
        },
      });
    });

    it('should evict least recently used entry when capacity exceeded', () => {
      cache.set(toCacheKey('key1'), 'value1');
      cache.set(toCacheKey('key2'), 'value2');
      cache.set(toCacheKey('key3'), 'value3');
      cache.set(toCacheKey('key4'), 'value4'); // Should evict key1

      expect(cache.size).toBe(3);
      expect(cache.has(toCacheKey('key1'))).toBe(false);
      expect(cache.has(toCacheKey('key2'))).toBe(true);
      expect(cache.has(toCacheKey('key3'))).toBe(true);
      expect(cache.has(toCacheKey('key4'))).toBe(true);
      expect(evictedKeys).toContain('key1');
    });

    it('should update LRU order on get()', () => {
      cache.set(toCacheKey('key1'), 'value1');
      cache.set(toCacheKey('key2'), 'value2');
      cache.set(toCacheKey('key3'), 'value3');

      // Access key1 to make it most recently used
      cache.get(toCacheKey('key1'));

      cache.set(toCacheKey('key4'), 'value4'); // Should evict key2 (not key1)

      expect(cache.has(toCacheKey('key1'))).toBe(true);
      expect(cache.has(toCacheKey('key2'))).toBe(false);
      expect(evictedKeys).toContain('key2');
    });

    it('should update LRU order on set() existing key', () => {
      cache.set(toCacheKey('key1'), 'value1');
      cache.set(toCacheKey('key2'), 'value2');
      cache.set(toCacheKey('key3'), 'value3');

      // Update key1 to make it most recently used
      cache.set(toCacheKey('key1'), 'updated');

      cache.set(toCacheKey('key4'), 'value4'); // Should evict key2

      expect(cache.get(toCacheKey('key1'))).toBe('updated');
      expect(cache.has(toCacheKey('key2'))).toBe(false);
    });

    it('should not update LRU order on has()', () => {
      cache.set(toCacheKey('key1'), 'value1');
      cache.set(toCacheKey('key2'), 'value2');
      cache.set(toCacheKey('key3'), 'value3');

      // Check key1 (should not affect LRU order)
      cache.has(toCacheKey('key1'));

      cache.set(toCacheKey('key4'), 'value4'); // Should still evict key1

      expect(cache.has(toCacheKey('key1'))).toBe(false);
    });

    it('should handle single-element cache', () => {
      const smallCache = new LRUCache<string>({ maxSize: 1 });
      smallCache.set(toCacheKey('key1'), 'value1');
      smallCache.set(toCacheKey('key2'), 'value2');

      expect(smallCache.size).toBe(1);
      expect(smallCache.has(toCacheKey('key1'))).toBe(false);
      expect(smallCache.has(toCacheKey('key2'))).toBe(true);
    });
  });

  describe('TTL (Time-To-Live)', () => {
    it('should expire entries after TTL', async () => {
      const cache = new LRUCache<string>({ defaultTTL: 100 });

      cache.set(toCacheKey('key1'), 'value1');
      expect(cache.get(toCacheKey('key1'))).toBe('value1');

      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(cache.get(toCacheKey('key1'))).toBeUndefined();
      expect(cache.has(toCacheKey('key1'))).toBe(false);
    });

    it('should override default TTL per entry', async () => {
      const cache = new LRUCache<string>({ defaultTTL: 1000 });

      cache.set(toCacheKey('key1'), 'short', { ttl: 100 });
      cache.set(toCacheKey('key2'), 'long', { ttl: 500 });

      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(cache.get(toCacheKey('key1'))).toBeUndefined();
      expect(cache.get(toCacheKey('key2'))).toBe('long');
    });

    it('should support entries without TTL', async () => {
      const cache = new LRUCache<string>({ defaultTTL: 100 });

      cache.set(toCacheKey('key1'), 'expires');
      cache.set(toCacheKey('key2'), 'permanent', { ttl: undefined });

      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(cache.get(toCacheKey('key1'))).toBeUndefined();
      expect(cache.get(toCacheKey('key2'))).toBe('permanent');
    });

    it('should invoke onEvict callback for expired entries', async () => {
      const evicted: string[] = [];
      const cache = new LRUCache<string>({
        defaultTTL: 100,
        onEvict: (key, _value, reason) => {
          if (reason === 'ttl') {
            evicted.push(key);
          }
        },
      });

      cache.set(toCacheKey('key1'), 'value1');

      await new Promise((resolve) => setTimeout(resolve, 150));

      cache.get(toCacheKey('key1')); // Trigger lazy expiration check

      expect(evicted).toContain('key1');
    });

    it('should manually evict expired entries', async () => {
      const cache = new LRUCache<string>({ defaultTTL: 100 });

      cache.set(toCacheKey('key1'), 'value1');
      cache.set(toCacheKey('key2'), 'value2', { ttl: 500 });
      cache.set(toCacheKey('key3'), 'value3', { ttl: undefined });

      await new Promise((resolve) => setTimeout(resolve, 150));

      const evicted = cache.evictExpired();

      expect(evicted).toBe(1);
      expect(cache.size).toBe(2);
      expect(cache.has(toCacheKey('key1'))).toBe(false);
      expect(cache.has(toCacheKey('key2'))).toBe(true);
      expect(cache.has(toCacheKey('key3'))).toBe(true);
    });
  });

  describe('Tenant Isolation', () => {
    const tenant1 = createTenantId('tenant1');
    const tenant2 = createTenantId('tenant2');

    it('should isolate cache entries by tenant', () => {
      const cache = new LRUCache<string>({ tenantIsolation: true });

      cache.set(toCacheKey('key1'), 'tenant1-value', { tenantId: tenant1 });
      cache.set(toCacheKey('key1'), 'tenant2-value', { tenantId: tenant2 });

      expect(cache.get(toCacheKey('key1'), { tenantId: tenant1 })).toBe('tenant1-value');
      expect(cache.get(toCacheKey('key1'), { tenantId: tenant2 })).toBe('tenant2-value');
    });

    it('should require tenantId when tenantIsolation is enabled', () => {
      const cache = new LRUCache<string>({ tenantIsolation: true });

      expect(() => {
        cache.set(toCacheKey('key1'), 'value');
      }).toThrow('tenantId required');
    });

    it('should track size across all tenants', () => {
      const cache = new LRUCache<string>({ tenantIsolation: true, maxSize: 3 });

      cache.set(toCacheKey('key1'), 'value1', { tenantId: tenant1 });
      cache.set(toCacheKey('key2'), 'value2', { tenantId: tenant1 });
      cache.set(toCacheKey('key1'), 'value1', { tenantId: tenant2 });

      expect(cache.size).toBe(3);
    });

    it('should evict LRU across tenants when capacity reached', () => {
      const cache = new LRUCache<string>({ tenantIsolation: true, maxSize: 2 });

      cache.set(toCacheKey('key1'), 'value1', { tenantId: tenant1 });
      cache.set(toCacheKey('key1'), 'value1', { tenantId: tenant2 });
      cache.set(toCacheKey('key2'), 'value2', { tenantId: tenant1 }); // Evicts tenant1:key1

      expect(cache.size).toBe(2);
      expect(cache.has(toCacheKey('key1'), { tenantId: tenant1 })).toBe(false);
      expect(cache.has(toCacheKey('key1'), { tenantId: tenant2 })).toBe(true);
    });
  });

  describe('Pattern-based Invalidation', () => {
    let cache: LRUCache<string>;

    beforeEach(() => {
      cache = new LRUCache<string>({ maxSize: 100 });
    });

    it('should invalidate entries matching pattern', () => {
      cache.set(toCacheKey('user:123'), 'user1');
      cache.set(toCacheKey('user:456'), 'user2');
      cache.set(toCacheKey('post:789'), 'post1');

      const invalidated = cache.invalidatePattern(/^user:/);

      expect(invalidated).toBe(2);
      expect(cache.has(toCacheKey('user:123'))).toBe(false);
      expect(cache.has(toCacheKey('user:456'))).toBe(false);
      expect(cache.has(toCacheKey('post:789'))).toBe(true);
    });

    it('should invalidate with complex patterns', () => {
      cache.set(toCacheKey('user:123:profile'), 'profile');
      cache.set(toCacheKey('user:123:settings'), 'settings');
      cache.set(toCacheKey('user:456:profile'), 'profile2');

      const invalidated = cache.invalidatePattern(/^user:123:/);

      expect(invalidated).toBe(2);
      expect(cache.has(toCacheKey('user:456:profile'))).toBe(true);
    });

    it('should return 0 if no entries match pattern', () => {
      cache.set(toCacheKey('key1'), 'value1');

      const invalidated = cache.invalidatePattern(/^user:/);

      expect(invalidated).toBe(0);
    });

    it('should invoke onEvict callback for pattern invalidation', () => {
      const evicted: Array<{ key: string; reason: string }> = [];
      const cacheWithCallback = new LRUCache<string>({
        onEvict: (key, _value, reason) => {
          evicted.push({ key, reason });
        },
      });

      cacheWithCallback.set(toCacheKey('user:123'), 'value1');
      cacheWithCallback.set(toCacheKey('user:456'), 'value2');

      cacheWithCallback.invalidatePattern(/^user:/);

      expect(evicted).toHaveLength(2);
      expect(evicted.every((e) => e.reason === 'pattern')).toBe(true);
    });
  });

  describe('Statistics', () => {
    let cache: LRUCache<string>;

    beforeEach(() => {
      cache = new LRUCache<string>({ maxSize: 3 });
    });

    it('should track cache hits and misses', () => {
      cache.set(toCacheKey('key1'), 'value1');

      cache.get(toCacheKey('key1')); // hit
      cache.get(toCacheKey('key2')); // miss
      cache.get(toCacheKey('key1')); // hit

      const stats = cache.getStats();

      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBeCloseTo(2 / 3);
    });

    it('should track evictions', () => {
      cache.set(toCacheKey('key1'), 'value1');
      cache.set(toCacheKey('key2'), 'value2');
      cache.set(toCacheKey('key3'), 'value3');
      cache.set(toCacheKey('key4'), 'value4'); // eviction

      const stats = cache.getStats();

      expect(stats.evictions).toBe(1);
    });

    it('should track current size and maxSize', () => {
      cache.set(toCacheKey('key1'), 'value1');
      cache.set(toCacheKey('key2'), 'value2');

      const stats = cache.getStats();

      expect(stats.size).toBe(2);
      expect(stats.maxSize).toBe(3);
    });

    it('should reset statistics', () => {
      cache.set(toCacheKey('key1'), 'value1');
      cache.get(toCacheKey('key1'));
      cache.get(toCacheKey('key2'));

      cache.resetStats();

      const stats = cache.getStats();

      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.evictions).toBe(0);
      expect(stats.size).toBe(1); // Size not reset
    });

    it('should calculate 0 hit rate with no accesses', () => {
      const stats = cache.getStats();
      expect(stats.hitRate).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    it('should throw error for invalid maxSize', () => {
      expect(() => {
        new LRUCache({ maxSize: 0 });
      }).toThrow('maxSize must be greater than 0');

      expect(() => {
        new LRUCache({ maxSize: -1 });
      }).toThrow('maxSize must be greater than 0');
    });

    it('should handle complex value types', () => {
      interface User {
        id: string;
        name: string;
      }

      const cache = new LRUCache<User>();
      const user: User = { id: '123', name: 'Alice' };

      cache.set(toCacheKey('user:123'), user);

      const retrieved = cache.get(toCacheKey('user:123'));
      expect(retrieved).toEqual(user);
      expect(retrieved).toBe(user); // Same reference
    });

    it('should handle undefined values', () => {
      const cache = new LRUCache<string | undefined>();

      cache.set(toCacheKey('key1'), undefined);

      expect(cache.has(toCacheKey('key1'))).toBe(true);
      expect(cache.get(toCacheKey('key1'))).toBeUndefined();
    });

    it('should invoke onEvict for clear()', () => {
      const evicted: string[] = [];
      const cache = new LRUCache<string>({
        onEvict: (key) => {
          evicted.push(key);
        },
      });

      cache.set(toCacheKey('key1'), 'value1');
      cache.set(toCacheKey('key2'), 'value2');
      cache.clear();

      expect(evicted).toHaveLength(2);
      expect(evicted).toContain('key1');
      expect(evicted).toContain('key2');
    });
  });

  describe('Performance Characteristics', () => {
    it('should maintain O(1) get/set performance with large datasets', () => {
      const cache = new LRUCache<number>({ maxSize: 10000 });

      const start = Date.now();

      // Insert 10000 entries
      for (let i = 0; i < 10000; i++) {
        cache.set(toCacheKey(`key${i}`), i);
      }

      // Access entries randomly
      for (let i = 0; i < 1000; i++) {
        const key = `key${Math.floor(Math.random() * 10000)}`;
        cache.get(toCacheKey(key));
      }

      const elapsed = Date.now() - start;

      // Should complete in reasonable time (< 100ms on modern hardware)
      expect(elapsed).toBeLessThan(100);
    });
  });
});

describe('TenantCache', () => {
  const tenant1 = createTenantId('tenant1');
  const tenant2 = createTenantId('tenant2');

  let cache: TenantCache<string>;

  beforeEach(() => {
    cache = new TenantCache<string>({ maxSize: 10 });
  });

  it('should provide simplified tenant-aware API', () => {
    cache.set(tenant1, toCacheKey('key1'), 'value1');
    expect(cache.get(tenant1, toCacheKey('key1'))).toBe('value1');
  });

  it('should isolate data between tenants', () => {
    cache.set(tenant1, toCacheKey('key1'), 'tenant1-value');
    cache.set(tenant2, toCacheKey('key1'), 'tenant2-value');

    expect(cache.get(tenant1, toCacheKey('key1'))).toBe('tenant1-value');
    expect(cache.get(tenant2, toCacheKey('key1'))).toBe('tenant2-value');
  });

  it('should invalidate all entries for a tenant', () => {
    cache.set(tenant1, toCacheKey('key1'), 'value1');
    cache.set(tenant1, toCacheKey('key2'), 'value2');
    cache.set(tenant2, toCacheKey('key1'), 'value3');

    const invalidated = cache.invalidateTenant(tenant1);

    expect(invalidated).toBe(2);
    expect(cache.has(tenant1, toCacheKey('key1'))).toBe(false);
    expect(cache.has(tenant1, toCacheKey('key2'))).toBe(false);
    expect(cache.has(tenant2, toCacheKey('key1'))).toBe(true);
  });

  it('should invalidate pattern within specific tenant', () => {
    cache.set(tenant1, toCacheKey('user:123'), 'value1');
    cache.set(tenant1, toCacheKey('user:456'), 'value2');
    cache.set(tenant1, toCacheKey('post:789'), 'value3');
    cache.set(tenant2, toCacheKey('user:123'), 'value4');

    const invalidated = cache.invalidatePattern(tenant1, /user:/);

    expect(invalidated).toBe(2);
    expect(cache.has(tenant1, toCacheKey('user:123'))).toBe(false);
    expect(cache.has(tenant1, toCacheKey('post:789'))).toBe(true);
    expect(cache.has(tenant2, toCacheKey('user:123'))).toBe(true);
  });

  it('should support TTL with tenant isolation', async () => {
    const ttlCache = new TenantCache<string>();

    ttlCache.set(tenant1, toCacheKey('key1'), 'value1', { ttl: 100 });

    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(ttlCache.get(tenant1, toCacheKey('key1'))).toBeUndefined();
  });

  it('should delete specific tenant key', () => {
    cache.set(tenant1, toCacheKey('key1'), 'value1');
    expect(cache.delete(tenant1, toCacheKey('key1'))).toBe(true);
    expect(cache.has(tenant1, toCacheKey('key1'))).toBe(false);
  });

  it('should provide statistics', () => {
    cache.set(tenant1, toCacheKey('key1'), 'value1');
    cache.get(tenant1, toCacheKey('key1'));

    const stats = cache.getStats();

    expect(stats.hits).toBe(1);
    expect(stats.size).toBe(1);
  });
});
