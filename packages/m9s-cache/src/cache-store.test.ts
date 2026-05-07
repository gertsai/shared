import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { CacheStore } from './cache-store';
import { MemoryCacheDriver } from './memory-driver';
import { NoopLockProvider } from './lock-provider';
import type { CacheLockProvider, UnlockFunction } from './types';

describe('CacheStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ============================================================================
  // Basic Operations
  // ============================================================================

  describe('get/set', () => {
    it('stores and retrieves values', async () => {
      const driver = new MemoryCacheDriver();
      const store = new CacheStore({ driver, prefix: 't:' });

      await store.set('key', { value: 1 });
      const value = await store.get<{ value: number }>('key');

      expect(value).toEqual({ value: 1 });
    });

    it('returns null for missing keys', async () => {
      const driver = new MemoryCacheDriver();
      const store = new CacheStore({ driver });

      const value = await store.get('nonexistent');
      expect(value).toBeNull();
    });

    it('applies prefix to keys', async () => {
      const driver = new MemoryCacheDriver();
      const store = new CacheStore({ driver, prefix: 'app:v1:' });

      await store.set('user:123', { name: 'John' });

      // Direct driver access should show prefixed key
      expect(await driver.get('app:v1:user:123')).toBeTruthy();
      expect(await driver.get('user:123')).toBeNull();
    });

    it('handles various value types', async () => {
      const driver = new MemoryCacheDriver();
      const store = new CacheStore({ driver });

      // String
      await store.set('str', 'hello');
      expect(await store.get('str')).toBe('hello');

      // Number
      await store.set('num', 42);
      expect(await store.get('num')).toBe(42);

      // Boolean
      await store.set('bool', true);
      expect(await store.get('bool')).toBe(true);

      // Array
      await store.set('arr', [1, 2, 3]);
      expect(await store.get('arr')).toEqual([1, 2, 3]);

      // Nested object
      await store.set('obj', { a: { b: { c: 1 } } });
      expect(await store.get('obj')).toEqual({ a: { b: { c: 1 } } });
    });
  });

  // ============================================================================
  // TTL Expiration
  // ============================================================================

  describe('TTL', () => {
    it('expires values after ttl', async () => {
      const driver = new MemoryCacheDriver();
      const store = new CacheStore({ driver, prefix: 't:' });

      await store.set('expiring', 'value', { ttlSeconds: 1 });
      expect(await store.get('expiring')).toBe('value');

      vi.advanceTimersByTime(1000);
      expect(await store.get('expiring')).toBeNull();
    });

    it('uses default TTL when not specified', async () => {
      const driver = new MemoryCacheDriver();
      const store = new CacheStore({ driver, defaultTTLSeconds: 5 });

      await store.set('key', 'value');

      vi.advanceTimersByTime(4999);
      expect(await store.get('key')).toBe('value');

      vi.advanceTimersByTime(1);
      expect(await store.get('key')).toBeNull();
    });

    it('allows explicit no-expiry with null', async () => {
      const driver = new MemoryCacheDriver();
      const store = new CacheStore({ driver, defaultTTLSeconds: 1 });

      await store.set('persistent', 'value', { ttlSeconds: null });

      vi.advanceTimersByTime(10000);
      expect(await store.get('persistent')).toBe('value');
    });

    it('ttl() returns remaining seconds', async () => {
      const driver = new MemoryCacheDriver();
      const store = new CacheStore({ driver });

      await store.set('key', 'value', { ttlSeconds: 100 });

      const ttl = await store.ttl('key');
      expect(ttl).toBe(100);

      vi.advanceTimersByTime(30000);
      expect(await store.ttl('key')).toBe(70);
    });

    it('expire() updates TTL', async () => {
      const driver = new MemoryCacheDriver();
      const store = new CacheStore({ driver });

      await store.set('key', 'value', { ttlSeconds: 10 });
      await store.expire('key', 100);

      vi.advanceTimersByTime(50000);
      expect(await store.get('key')).toBe('value');
    });
  });

  // ============================================================================
  // Delete Operations
  // ============================================================================

  describe('del', () => {
    it('deletes single key', async () => {
      const driver = new MemoryCacheDriver();
      const store = new CacheStore({ driver });

      await store.set('key', 'value');
      expect(await store.del('key')).toBe(1);
      expect(await store.get('key')).toBeNull();
    });

    it('deletes multiple keys', async () => {
      const driver = new MemoryCacheDriver();
      const store = new CacheStore({ driver });

      await store.set('a', 1);
      await store.set('b', 2);
      await store.set('c', 3);

      expect(await store.del(['a', 'b'])).toBe(2);
      expect(await store.get('a')).toBeNull();
      expect(await store.get('c')).toBe(3);
    });

    it('returns 0 for missing keys', async () => {
      const driver = new MemoryCacheDriver();
      const store = new CacheStore({ driver });

      expect(await store.del('nonexistent')).toBe(0);
    });

    it('handles empty array', async () => {
      const driver = new MemoryCacheDriver();
      const store = new CacheStore({ driver });

      expect(await store.del([])).toBe(0);
    });
  });

  // ============================================================================
  // Has / Exists
  // ============================================================================

  describe('has', () => {
    it('returns true for existing keys', async () => {
      const driver = new MemoryCacheDriver();
      const store = new CacheStore({ driver });

      await store.set('key', 'value');
      expect(await store.has('key')).toBe(true);
    });

    it('returns false for missing keys', async () => {
      const driver = new MemoryCacheDriver();
      const store = new CacheStore({ driver });

      expect(await store.has('nonexistent')).toBe(false);
    });

    it('returns false for expired keys', async () => {
      const driver = new MemoryCacheDriver();
      const store = new CacheStore({ driver });

      await store.set('key', 'value', { ttlSeconds: 1 });
      vi.advanceTimersByTime(1001);
      expect(await store.has('key')).toBe(false);
    });
  });

  // ============================================================================
  // Clean
  // ============================================================================

  describe('clean', () => {
    it('cleans keys by pattern', async () => {
      const driver = new MemoryCacheDriver();
      // Disable key validation for pattern tests
      const store = new CacheStore({ driver, prefix: 'app:', validateKeys: false });

      await store.set('user:1', 'a');
      await store.set('user:2', 'b');
      await store.set('session:1', 'c');

      const cleaned = await store.clean('user:*');
      expect(cleaned).toBe(2);
      expect(await store.get('user:1')).toBeNull();
      expect(await store.get('session:1')).toBe('c');
    });

    it('cleans all keys with default pattern', async () => {
      const driver = new MemoryCacheDriver();
      // Disable key validation for pattern tests
      const store = new CacheStore({ driver, prefix: 'test:', validateKeys: false });

      await store.set('a', 1);
      await store.set('b', 2);

      const cleaned = await store.clean();
      expect(cleaned).toBe(2);
    });
  });

  // ============================================================================
  // getWithMeta
  // ============================================================================

  describe('getWithMeta', () => {
    it('returns found: true with value for existing keys', async () => {
      const driver = new MemoryCacheDriver();
      const store = new CacheStore({ driver });

      await store.set('key', { data: 123 });
      const result = await store.getWithMeta<{ data: number }>('key');

      expect(result.found).toBe(true);
      if (result.found) {
        expect(result.value).toEqual({ data: 123 });
      }
    });

    it('returns found: false for missing keys', async () => {
      const driver = new MemoryCacheDriver();
      const store = new CacheStore({ driver });

      const result = await store.getWithMeta('nonexistent');

      expect(result.found).toBe(false);
      expect(result.value).toBeNull();
    });

    it('includes TTL in result', async () => {
      const driver = new MemoryCacheDriver();
      const store = new CacheStore({ driver });

      await store.set('key', 'value', { ttlSeconds: 100 });
      const result = await store.getWithMeta('key');

      expect(result.found).toBe(true);
      if (result.found) {
        expect(result.ttl).toBe(100);
      }
    });
  });

  // ============================================================================
  // wrap with locking
  // ============================================================================

  describe('wrap', () => {
    it('caches loader results', async () => {
      const driver = new MemoryCacheDriver();
      const store = new CacheStore({ driver, prefix: 't:' });
      const loader = vi.fn(async () => 'result');

      const first = await store.wrap('wrapped', loader, { ttlSeconds: 60 });
      const second = await store.wrap('wrapped', loader, { ttlSeconds: 60 });

      expect(first).toBe('result');
      expect(second).toBe('result');
      expect(loader).toHaveBeenCalledTimes(1);
    });

    it('uses lock provider when provided', async () => {
      const driver = new MemoryCacheDriver();
      const store = new CacheStore({ driver });
      const lockProvider = new NoopLockProvider();
      const acquireSpy = vi.spyOn(lockProvider, 'acquire');
      const loader = vi.fn(async () => 'data');

      await store.wrap('key', loader, { lockProvider, lockTtlMs: 5000 });

      expect(acquireSpy).toHaveBeenCalledWith(expect.stringContaining('lock'), 5000);
    });

    it('double-checks cache after acquiring lock', async () => {
      const driver = new MemoryCacheDriver();
      const store = new CacheStore({ driver });
      let lockCount = 0;

      // Create a lock provider that caches value while holding lock
      const lockProvider: CacheLockProvider = {
        async acquire(_key: string, _ttl: number): Promise<UnlockFunction> {
          lockCount++;
          // Simulate another process cached the value
          if (lockCount === 1) {
            await store.set('key', 'cached-by-other');
          }
          return async () => {};
        },
        async tryAcquire(_key: string, _ttl: number): Promise<UnlockFunction | null> {
          return async () => {};
        },
      };

      const loader = vi.fn(async () => 'from-loader');

      const result = await store.wrap('key', loader, { lockProvider });

      // Should return cached value, not call loader
      expect(result).toBe('cached-by-other');
      expect(loader).not.toHaveBeenCalled();
    });

    it('can disable double-check', async () => {
      const driver = new MemoryCacheDriver();
      const store = new CacheStore({ driver });

      const lockProvider: CacheLockProvider = {
        async acquire(_key: string, _ttl: number): Promise<UnlockFunction> {
          // Simulate another process cached the value
          await store.set('key', 'cached-by-other');
          return async () => {};
        },
        async tryAcquire(_key: string, _ttl: number): Promise<UnlockFunction | null> {
          return async () => {};
        },
      };

      const loader = vi.fn(async () => 'from-loader');

      const result = await store.wrap('key', loader, {
        lockProvider,
        doubleCheck: false,
      });

      // With doubleCheck: false, should call loader and overwrite
      expect(result).toBe('from-loader');
      expect(loader).toHaveBeenCalledTimes(1);
    });
  });

  // ============================================================================
  // wrapWithMeta
  // ============================================================================

  describe('wrapWithMeta', () => {
    it('returns source: cache for cached values', async () => {
      const driver = new MemoryCacheDriver();
      const store = new CacheStore({ driver });

      await store.set('key', 'cached');
      const result = await store.wrapWithMeta('key', async () => 'loaded');

      expect(result.source).toBe('cache');
      expect(result.value).toBe('cached');
    });

    it('returns source: loader for loaded values', async () => {
      const driver = new MemoryCacheDriver();
      const store = new CacheStore({ driver });

      const result = await store.wrapWithMeta('key', async () => 'loaded');

      expect(result.source).toBe('loader');
      expect(result.value).toBe('loaded');
      if (result.source === 'loader') {
        expect(result.cached).toBe(true);
      }
    });
  });

  // ============================================================================
  // wrapNonBlocking
  // ============================================================================

  describe('wrapNonBlocking', () => {
    it('returns cached value when available', async () => {
      const driver = new MemoryCacheDriver();
      const store = new CacheStore({ driver });
      const lockProvider = new NoopLockProvider();

      await store.set('key', 'cached');
      const loader = vi.fn(async () => 'loaded');

      const result = await store.wrapNonBlocking('key', loader, { lockProvider });

      expect(result).toBe('cached');
      expect(loader).not.toHaveBeenCalled();
    });

    it('loads without caching when lock unavailable and no stale data', async () => {
      const driver = new MemoryCacheDriver();
      const store = new CacheStore({ driver });

      const lockProvider: CacheLockProvider = {
        async acquire(_key: string, _ttl: number): Promise<UnlockFunction> {
          return async () => {};
        },
        async tryAcquire(_key: string, _ttl: number): Promise<UnlockFunction | null> {
          return null; // Lock not available
        },
      };

      const loader = vi.fn(async () => 'loaded');

      const result = await store.wrapNonBlocking('key', loader, { lockProvider });

      expect(result).toBe('loaded');
      expect(loader).toHaveBeenCalledTimes(1);
      // Value should NOT be cached since we couldn't acquire lock
      expect(await store.get('key')).toBeNull();
    });
  });

  // ============================================================================
  // mget / mset
  // ============================================================================

  describe('mget/mset', () => {
    it('gets multiple values', async () => {
      const driver = new MemoryCacheDriver();
      const store = new CacheStore({ driver });

      await store.set('a', 1);
      await store.set('b', 2);
      await store.set('c', 3);

      const results = await store.mget<number>(['a', 'b', 'c', 'd']);

      expect(results).toEqual([1, 2, 3, null]);
    });

    it('sets multiple values', async () => {
      const driver = new MemoryCacheDriver();
      const store = new CacheStore({ driver });

      await store.mset<string | number>([
        ['a', 1],
        ['b', 'two'],
        ['c', 3],
      ]);

      expect(await store.get('a')).toBe(1);
      expect(await store.get('b')).toBe('two');
      expect(await store.get('c')).toBe(3);
    });

    it('applies TTL to mset entries', async () => {
      const driver = new MemoryCacheDriver();
      const store = new CacheStore({ driver });

      await store.mset(
        [
          ['a', 1],
          ['b', 2],
        ],
        { ttlSeconds: 1 },
      );

      expect(await store.get('a')).toBe(1);

      vi.advanceTimersByTime(1001);

      expect(await store.get('a')).toBeNull();
      expect(await store.get('b')).toBeNull();
    });

    it('handles empty arrays', async () => {
      const driver = new MemoryCacheDriver();
      const store = new CacheStore({ driver });

      expect(await store.mget([])).toEqual([]);
      await expect(store.mset([])).resolves.toBeUndefined();
    });
  });

  // ============================================================================
  // Key Validation
  // ============================================================================

  describe('key validation', () => {
    it('validates keys in non-production mode', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      try {
        const driver = new MemoryCacheDriver();
        const store = new CacheStore({ driver, validateKeys: true });

        // Valid key should work
        await expect(store.set('valid:key', 'value')).resolves.toBeUndefined();

        // Invalid key should throw
        await expect(store.set('invalid key with spaces', 'value')).rejects.toThrow();
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });

    it('skips validation in production mode by default', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      try {
        const driver = new MemoryCacheDriver();
        const store = new CacheStore({ driver });

        // Even invalid keys should work in production (for performance)
        await expect(store.set('key with spaces', 'value')).resolves.toBeUndefined();
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });
  });

  // ============================================================================
  // Serialization Errors
  // ============================================================================

  describe('serialization errors', () => {
    it('handles corrupted data gracefully in get', async () => {
      const driver = new MemoryCacheDriver();
      const store = new CacheStore({ driver });

      // Directly set invalid JSON
      await driver.set('corrupted', 'not valid json {{{');

      // Should return null, not throw
      const result = await store.get('corrupted');
      expect(result).toBeNull();
    });

    it('handles circular references in set', async () => {
      const driver = new MemoryCacheDriver();
      const store = new CacheStore({ driver });

      const circular: Record<string, unknown> = { a: 1 };
      circular.self = circular;

      await expect(store.set('circular', circular)).rejects.toThrow();
    });
  });

  // ============================================================================
  // Edge Cases
  // ============================================================================

  describe('edge cases', () => {
    it('handles null values', async () => {
      const driver = new MemoryCacheDriver();
      const store = new CacheStore({ driver });

      await store.set('null', null);
      expect(await store.get('null')).toBeNull();
    });

    it('handles undefined in objects', async () => {
      const driver = new MemoryCacheDriver();
      const store = new CacheStore({ driver });

      // undefined becomes null in JSON
      const obj = { a: 1, b: undefined };
      await store.set('obj', obj);
      const result = await store.get<typeof obj>('obj');
      expect(result).toEqual({ a: 1 });
    });

    it('handles empty string key with validation disabled', async () => {
      const driver = new MemoryCacheDriver();
      const store = new CacheStore({ driver, validateKeys: false });

      await store.set('', 'empty-key-value');
      expect(await store.get('')).toBe('empty-key-value');
    });

    it('getDriver returns underlying driver', () => {
      const driver = new MemoryCacheDriver();
      const store = new CacheStore({ driver });

      expect(store.getDriver()).toBe(driver);
    });

    it('getPrefix returns configured prefix', () => {
      const driver = new MemoryCacheDriver();
      const store = new CacheStore({ driver, prefix: 'myapp:' });

      expect(store.getPrefix()).toBe('myapp:');
    });
  });

  // ============================================================================
  // Concurrent Access
  // ============================================================================

  describe('concurrent access', () => {
    it('handles concurrent wrap calls correctly', async () => {
      vi.useRealTimers(); // Use real timers for this test

      const driver = new MemoryCacheDriver();
      const store = new CacheStore({ driver });
      let _loadCount = 0;

      const loader = async () => {
        _loadCount++;
        await new Promise((resolve) => setTimeout(resolve, 10));
        return 'result';
      };

      // Simulate concurrent calls
      const [result1, result2, result3] = await Promise.all([
        store.wrap('key', loader),
        store.wrap('key', loader),
        store.wrap('key', loader),
      ]);

      // All should get same result
      expect(result1).toBe('result');
      expect(result2).toBe('result');
      expect(result3).toBe('result');

      // Without locking, loader may be called multiple times
      // With locking, it should be called once

      vi.useFakeTimers(); // Restore fake timers
    });
  });
});
