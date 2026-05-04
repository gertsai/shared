import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { MemoryCacheDriver } from './memory-driver';

describe('MemoryCacheDriver', () => {
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

      await driver.set('key', 'value');
      const result = await driver.get('key');

      expect(result).toBe('value');
    });

    it('returns null for missing keys', async () => {
      const driver = new MemoryCacheDriver();

      const result = await driver.get('nonexistent');
      expect(result).toBeNull();
    });

    it('handles Buffer values', async () => {
      const driver = new MemoryCacheDriver();
      const buffer = Buffer.from('hello');

      await driver.set('buffer', buffer);
      const result = await driver.get('buffer');

      expect(result).toEqual(buffer);
    });
  });

  // ============================================================================
  // TTL Expiration
  // ============================================================================

  describe('TTL', () => {
    it('expires values after TTL', async () => {
      const driver = new MemoryCacheDriver();

      await driver.set('key', 'value', 1);
      expect(await driver.get('key')).toBe('value');

      vi.advanceTimersByTime(1000);
      expect(await driver.get('key')).toBeNull();
    });

    it('does not expire values without TTL', async () => {
      const driver = new MemoryCacheDriver();

      await driver.set('key', 'value');

      vi.advanceTimersByTime(1000000);
      expect(await driver.get('key')).toBe('value');
    });

    it('ttl() returns remaining seconds', async () => {
      const driver = new MemoryCacheDriver();

      await driver.set('key', 'value', 100);

      expect(await driver.ttl('key')).toBe(100);

      vi.advanceTimersByTime(30000);
      expect(await driver.ttl('key')).toBe(70);
    });

    it('ttl() returns -1 for keys without expiry', async () => {
      const driver = new MemoryCacheDriver();

      await driver.set('key', 'value');

      expect(await driver.ttl('key')).toBe(-1);
    });

    it('ttl() returns -2 for missing keys', async () => {
      const driver = new MemoryCacheDriver();

      expect(await driver.ttl('nonexistent')).toBe(-2);
    });

    it('ttl() returns -2 for expired keys', async () => {
      const driver = new MemoryCacheDriver();

      await driver.set('key', 'value', 1);
      vi.advanceTimersByTime(2000);

      expect(await driver.ttl('key')).toBe(-2);
    });

    it('expire() updates TTL', async () => {
      const driver = new MemoryCacheDriver();

      await driver.set('key', 'value', 10);
      await driver.expire('key', 100);

      expect(await driver.ttl('key')).toBe(100);
    });
  });

  // ============================================================================
  // Delete Operations
  // ============================================================================

  describe('del', () => {
    it('deletes single key', async () => {
      const driver = new MemoryCacheDriver();

      await driver.set('key', 'value');
      expect(await driver.del('key')).toBe(1);
      expect(await driver.get('key')).toBeNull();
    });

    it('deletes multiple keys', async () => {
      const driver = new MemoryCacheDriver();

      await driver.set('a', '1');
      await driver.set('b', '2');
      await driver.set('c', '3');

      expect(await driver.del(['a', 'b'])).toBe(2);
      expect(await driver.get('a')).toBeNull();
      expect(await driver.get('c')).toBe('3');
    });

    it('returns 0 for missing keys', async () => {
      const driver = new MemoryCacheDriver();

      expect(await driver.del('nonexistent')).toBe(0);
    });

    it('counts unique keys not stores', async () => {
      const driver = new MemoryCacheDriver();

      // Set in regular store
      await driver.set('key', 'value');

      // Delete should count as 1, not 2
      expect(await driver.del('key')).toBe(1);
    });

    it('deletes from hash store too', async () => {
      const driver = new MemoryCacheDriver();

      await driver.hset('hash', { a: '1' });
      expect(await driver.del('hash')).toBe(1);
      expect(await driver.hgetall('hash')).toBeNull();
    });
  });

  // ============================================================================
  // Exists
  // ============================================================================

  describe('exists', () => {
    it('returns true for existing keys', async () => {
      const driver = new MemoryCacheDriver();

      await driver.set('key', 'value');
      expect(await driver.exists('key')).toBe(true);
    });

    it('returns false for missing keys', async () => {
      const driver = new MemoryCacheDriver();

      expect(await driver.exists('nonexistent')).toBe(false);
    });

    it('returns false for expired keys', async () => {
      const driver = new MemoryCacheDriver();

      await driver.set('key', 'value', 1);
      vi.advanceTimersByTime(1001);

      expect(await driver.exists('key')).toBe(false);
    });

    it('works with hash entries', async () => {
      const driver = new MemoryCacheDriver();

      await driver.hset('hash', { a: '1' });
      expect(await driver.exists('hash')).toBe(true);
    });
  });

  // ============================================================================
  // Multi Operations
  // ============================================================================

  describe('mget/mset', () => {
    it('gets multiple values', async () => {
      const driver = new MemoryCacheDriver();

      await driver.set('a', '1');
      await driver.set('b', '2');

      const results = await driver.mget(['a', 'b', 'c']);
      expect(results).toEqual(['1', '2', null]);
    });

    it('sets multiple values', async () => {
      const driver = new MemoryCacheDriver();

      await driver.mset([
        ['a', '1'],
        ['b', '2'],
      ]);

      expect(await driver.get('a')).toBe('1');
      expect(await driver.get('b')).toBe('2');
    });

    it('handles empty arrays', async () => {
      const driver = new MemoryCacheDriver();

      expect(await driver.mget([])).toEqual([]);
      await expect(driver.mset([])).resolves.toBeUndefined();
    });
  });

  // ============================================================================
  // Hash Operations
  // ============================================================================

  describe('hash operations', () => {
    it('supports hash operations', async () => {
      const driver = new MemoryCacheDriver();

      expect(driver.hset).toBeDefined();
      expect(driver.hget).toBeDefined();
      expect(driver.hgetall).toBeDefined();

      await driver.hset('hash', { a: '1', b: '2' });
      const all = await driver.hgetall('hash');
      const field = await driver.hget('hash', 'a');

      expect(all).toEqual({ a: '1', b: '2' });
      expect(field).toBe('1');
    });

    it('updates existing hash fields', async () => {
      const driver = new MemoryCacheDriver();

      await driver.hset('hash', { a: '1' });
      await driver.hset('hash', { a: '2', b: '3' });

      const all = await driver.hgetall('hash');
      expect(all).toEqual({ a: '2', b: '3' });
    });

    it('returns null for missing hash', async () => {
      const driver = new MemoryCacheDriver();

      expect(await driver.hgetall('nonexistent')).toBeNull();
      expect(await driver.hget('nonexistent', 'field')).toBeNull();
    });

    it('returns null for missing hash field', async () => {
      const driver = new MemoryCacheDriver();

      await driver.hset('hash', { a: '1' });
      expect(await driver.hget('hash', 'nonexistent')).toBeNull();
    });

    it('expires hash entries', async () => {
      const driver = new MemoryCacheDriver();

      await driver.hset('hash', { a: '1' });
      await driver.expire('hash', 1);

      vi.advanceTimersByTime(1001);

      expect(await driver.hgetall('hash')).toBeNull();
    });

    it('preserves TTL when updating hash', async () => {
      const driver = new MemoryCacheDriver();

      await driver.hset('hash', { a: '1' });
      await driver.expire('hash', 10);
      await driver.hset('hash', { b: '2' });

      // TTL should be preserved
      expect(await driver.ttl('hash')).toBe(10);
    });
  });

  // ============================================================================
  // Pattern Matching
  // ============================================================================

  describe('keys', () => {
    it('matches exact keys', async () => {
      const driver = new MemoryCacheDriver();

      await driver.set('user:1', 'a');
      await driver.set('user:2', 'b');
      await driver.set('session:1', 'c');

      const keys = await driver.keys('user:1');
      expect(keys).toEqual(['user:1']);
    });

    it('matches with * wildcard', async () => {
      const driver = new MemoryCacheDriver();

      await driver.set('user:1', 'a');
      await driver.set('user:2', 'b');
      await driver.set('session:1', 'c');

      const keys = await driver.keys('user:*');
      expect(keys.sort()).toEqual(['user:1', 'user:2']);
    });

    it('matches with ? wildcard', async () => {
      const driver = new MemoryCacheDriver();

      await driver.set('user:1', 'a');
      await driver.set('user:2', 'b');
      await driver.set('user:10', 'c');

      const keys = await driver.keys('user:?');
      expect(keys.sort()).toEqual(['user:1', 'user:2']);
    });

    it('matches all with *', async () => {
      const driver = new MemoryCacheDriver();

      await driver.set('a', '1');
      await driver.set('b', '2');
      await driver.hset('c', { x: '3' });

      const keys = await driver.keys('*');
      expect(keys.sort()).toEqual(['a', 'b', 'c']);
    });

    it('normalizes ** to *', async () => {
      const driver = new MemoryCacheDriver();

      await driver.set('a:b:c', '1');
      await driver.set('a:x:y', '2');

      const keys = await driver.keys('a:**');
      expect(keys.sort()).toEqual(['a:b:c', 'a:x:y']);
    });

    it('excludes expired keys', async () => {
      const driver = new MemoryCacheDriver();

      await driver.set('a', '1', 1);
      await driver.set('b', '2');

      vi.advanceTimersByTime(1001);

      const keys = await driver.keys('*');
      expect(keys).toEqual(['b']);
    });

    it('includes hash keys in results', async () => {
      const driver = new MemoryCacheDriver();

      await driver.set('key', 'value');
      await driver.hset('hash', { a: '1' });

      const keys = await driver.keys('*');
      expect(keys.sort()).toEqual(['hash', 'key']);
    });
  });

  // ============================================================================
  // ReDoS Protection
  // ============================================================================

  describe('ReDoS protection', () => {
    it('throws for patterns that are too long', async () => {
      const driver = new MemoryCacheDriver();
      const longPattern = 'a'.repeat(300);

      await expect(driver.keys(longPattern)).rejects.toThrow('Pattern too long');
    });

    it('throws for patterns with too many wildcards', async () => {
      const driver = new MemoryCacheDriver();
      // Use separate wildcards that won't be normalized to single *
      const manyWildcards = 'a*b*c*d*e*f*g*h*i*j*k*l*m*';

      await expect(driver.keys(manyWildcards)).rejects.toThrow('Too many wildcards');
    });

    it('normalizes consecutive wildcards', async () => {
      const driver = new MemoryCacheDriver();

      await driver.set('abc', 'value');

      // *** should be normalized to *
      const keys = await driver.keys('a***c');
      expect(keys).toEqual(['abc']);
    });
  });

  // ============================================================================
  // Cleanup and Memory Management
  // ============================================================================

  describe('cleanup', () => {
    it('removes expired entries with cleanup enabled', async () => {
      const driver = new MemoryCacheDriver({
        enableCleanup: true,
        cleanupIntervalMs: 1000,
      });

      await driver.set('a', '1', 1);
      await driver.set('b', '2', 10); // Longer TTL

      // Advance past first expiration but not second
      vi.advanceTimersByTime(1500);

      // Key 'a' should be expired
      expect(await driver.get('a')).toBeNull();
      expect(await driver.get('b')).toBe('2');

      await driver.quit();
    });

    it('quit clears all data and stops cleanup', async () => {
      const driver = new MemoryCacheDriver({
        enableCleanup: true,
        cleanupIntervalMs: 1000,
      });

      await driver.set('key', 'value');
      await driver.hset('hash', { a: '1' });

      await driver.quit();

      expect(await driver.get('key')).toBeNull();
      expect(await driver.hgetall('hash')).toBeNull();
      expect(driver.size).toBe(0);
    });
  });

  // ============================================================================
  // Max Entries / Eviction
  // ============================================================================

  describe('maxEntries', () => {
    it('evicts oldest entry when at capacity', async () => {
      const driver = new MemoryCacheDriver({ maxEntries: 2 });

      await driver.set('a', '1');
      await driver.set('b', '2');
      await driver.set('c', '3'); // Should evict 'a'

      expect(await driver.get('a')).toBeNull();
      expect(await driver.get('b')).toBe('2');
      expect(await driver.get('c')).toBe('3');
    });

    it('respects maxEntries on insertion', async () => {
      const driver = new MemoryCacheDriver({ maxEntries: 3 });

      await driver.set('1', 'a');
      await driver.set('2', 'b');
      await driver.set('3', 'c');
      await driver.set('4', 'd');
      await driver.set('5', 'e');

      // Only 3 entries should remain
      const keys = await driver.keys('*');
      expect(keys).toHaveLength(3);
      expect(keys).toContain('5');
      expect(keys).toContain('4');
    });
  });

  // ============================================================================
  // Size Property
  // ============================================================================

  describe('size', () => {
    it('returns total count of entries', async () => {
      const driver = new MemoryCacheDriver();

      expect(driver.size).toBe(0);

      await driver.set('a', '1');
      expect(driver.size).toBe(1);

      await driver.hset('hash', { x: '1' });
      expect(driver.size).toBe(2);

      await driver.del('a');
      expect(driver.size).toBe(1);
    });
  });

  // ============================================================================
  // Flags
  // ============================================================================

  describe('capability flags', () => {
    it('reports correct capabilities', () => {
      const driver = new MemoryCacheDriver();

      expect(driver.supportsHash).toBe(true);
      expect(driver.supportsAtomic).toBe(false);
    });
  });

  // ============================================================================
  // Pattern Cache
  // ============================================================================

  describe('pattern cache', () => {
    it('caches and reuses pattern matchers', async () => {
      const driver = new MemoryCacheDriver();

      await driver.set('key1', 'value1');
      await driver.set('key2', 'value2');

      // Call keys multiple times with same pattern
      await driver.keys('key*');
      await driver.keys('key*');
      await driver.keys('key*');

      // Pattern should be cached (no way to verify directly, but no errors)
      const keys = await driver.keys('key*');
      expect(keys.sort()).toEqual(['key1', 'key2']);
    });
  });

  // ============================================================================
  // Edge Cases
  // ============================================================================

  describe('edge cases', () => {
    it('handles empty string key', async () => {
      const driver = new MemoryCacheDriver();

      await driver.set('', 'value');
      expect(await driver.get('')).toBe('value');
    });

    it('handles special regex characters in keys', async () => {
      const driver = new MemoryCacheDriver();

      await driver.set('key.with.dots', 'value');
      await driver.set('key[0]', 'value2');

      expect(await driver.get('key.with.dots')).toBe('value');
      expect(await driver.get('key[0]')).toBe('value2');
    });

    it('handles very long keys', async () => {
      const driver = new MemoryCacheDriver();
      const longKey = 'a'.repeat(1000);

      await driver.set(longKey, 'value');
      expect(await driver.get(longKey)).toBe('value');
    });

    it('overwrites existing values', async () => {
      const driver = new MemoryCacheDriver();

      await driver.set('key', 'value1');
      await driver.set('key', 'value2');

      expect(await driver.get('key')).toBe('value2');
    });
  });

  describe('setIfNewer (atomic compare-and-set)', () => {
    it('sets value when key does not exist', async () => {
      const driver = new MemoryCacheDriver();

      const updated = await driver.setIfNewer([['tag:1', 100]]);

      expect(updated).toBe(1);
      expect(await driver.get('tag:1')).toBe('100');
    });

    it('sets value when new value is greater', async () => {
      const driver = new MemoryCacheDriver();
      await driver.set('tag:1', '50');

      const updated = await driver.setIfNewer([['tag:1', 100]]);

      expect(updated).toBe(1);
      expect(await driver.get('tag:1')).toBe('100');
    });

    it('does not set value when new value is smaller', async () => {
      const driver = new MemoryCacheDriver();
      await driver.set('tag:1', '100');

      const updated = await driver.setIfNewer([['tag:1', 50]]);

      expect(updated).toBe(0);
      expect(await driver.get('tag:1')).toBe('100');
    });

    it('does not set value when values are equal', async () => {
      const driver = new MemoryCacheDriver();
      await driver.set('tag:1', '100');

      const updated = await driver.setIfNewer([['tag:1', 100]]);

      expect(updated).toBe(0);
      expect(await driver.get('tag:1')).toBe('100');
    });

    it('handles multiple entries correctly', async () => {
      const driver = new MemoryCacheDriver();
      await driver.set('tag:1', '100');
      await driver.set('tag:2', '50');
      // tag:3 does not exist

      const updated = await driver.setIfNewer([
        ['tag:1', 50], // Should NOT update (50 < 100)
        ['tag:2', 100], // Should update (100 > 50)
        ['tag:3', 200], // Should update (key missing)
      ]);

      expect(updated).toBe(2);
      expect(await driver.get('tag:1')).toBe('100'); // Unchanged
      expect(await driver.get('tag:2')).toBe('100'); // Updated
      expect(await driver.get('tag:3')).toBe('200'); // New
    });

    it('returns 0 for empty entries', async () => {
      const driver = new MemoryCacheDriver();

      const updated = await driver.setIfNewer([]);

      expect(updated).toBe(0);
    });
  });
});
