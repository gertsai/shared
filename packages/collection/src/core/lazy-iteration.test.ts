/**
 * Tests for lazy iteration performance fixes (FIX-020 and FIX-021).
 *
 * FIX-020: PersistentMap.entries() should use true lazy iteration over HAMT nodes
 * FIX-021: PersistentCollection.[INTERNAL_DATA]() should cache materialized Map
 */

import { describe, expect, it } from 'vitest';
import { PersistentCollection } from './PersistentCollection';
import { PersistentMap } from './PersistentMap';
import { INTERNAL_DATA } from '../types/internal';

describe('FIX-020: PersistentMap lazy entries() iteration', () => {
  it('should yield entries lazily without materializing full array', () => {
    const map = new PersistentMap<number, string>();
    let current = map;
    for (let i = 0; i < 1000; i++) {
      current = current.set(i, `value-${i}`);
    }

    const iterator = current.entries();

    // Get only first 3 entries - should not require iterating all 1000
    const first = iterator.next();
    const second = iterator.next();
    const third = iterator.next();

    expect(first.done).toBe(false);
    expect(second.done).toBe(false);
    expect(third.done).toBe(false);

    // Values should be tuples
    expect(Array.isArray(first.value)).toBe(true);
    expect(first.value).toHaveLength(2);
  });

  it('should support early termination in for...of loop', () => {
    let current = new PersistentMap<number, number>();
    for (let i = 0; i < 10000; i++) {
      current = current.set(i, i * 2);
    }

    let iterationCount = 0;
    for (const [key, value] of current.entries()) {
      iterationCount++;
      if (iterationCount >= 5) {
        break;
      }
      // Just to use the variables
      expect(typeof key).toBe('number');
      expect(typeof value).toBe('number');
    }

    expect(iterationCount).toBe(5);
  });

  it('should handle empty map iteration', () => {
    const emptyMap = new PersistentMap<string, number>();
    const entries = Array.from(emptyMap.entries());
    expect(entries).toEqual([]);

    const keys = Array.from(emptyMap.keys());
    expect(keys).toEqual([]);

    const values = Array.from(emptyMap.values());
    expect(values).toEqual([]);
  });

  it('keys() should iterate lazily', () => {
    let current = new PersistentMap<string, number>();
    current = current.set('a', 1).set('b', 2).set('c', 3);

    const keysIterator = current.keys();

    const first = keysIterator.next();
    expect(first.done).toBe(false);
    expect(typeof first.value).toBe('string');

    // Collect remaining
    const remaining = [...keysIterator];
    expect(remaining.length).toBe(2);
  });

  it('values() should iterate lazily', () => {
    let current = new PersistentMap<string, number>();
    current = current.set('a', 1).set('b', 2).set('c', 3);

    const valuesIterator = current.values();

    const first = valuesIterator.next();
    expect(first.done).toBe(false);
    expect(typeof first.value).toBe('number');

    // Collect remaining
    const remaining = [...valuesIterator];
    expect(remaining.length).toBe(2);
  });

  it('should iterate through all node types correctly', () => {
    // This creates a mix of ValueNode, CollisionNode, and BranchNode
    let current = new PersistentMap<number, string>();

    // Add enough items to create various node types
    for (let i = 0; i < 100; i++) {
      current = current.set(i, `v${i}`);
    }

    const entries = Array.from(current.entries());
    expect(entries.length).toBe(100);

    // Verify all entries are present
    const keysFound = new Set(entries.map(([k]) => k));
    for (let i = 0; i < 100; i++) {
      expect(keysFound.has(i)).toBe(true);
    }
  });

  it('Symbol.iterator should use lazy entries()', () => {
    let current = new PersistentMap<string, number>();
    current = current.set('x', 10).set('y', 20).set('z', 30);

    const collected: Array<[string, number]> = [];
    for (const entry of current) {
      collected.push(entry);
      if (collected.length >= 2) break;
    }

    expect(collected.length).toBe(2);
    expect(collected.every(([k, v]) => typeof k === 'string' && typeof v === 'number')).toBe(true);
  });
});

describe('FIX-021: PersistentCollection INTERNAL_DATA caching', () => {
  it('should return cached Map on subsequent calls', () => {
    const collection = new PersistentCollection<string, number>([
      ['a', 1],
      ['b', 2],
      ['c', 3],
    ]);

    const firstCall = collection[INTERNAL_DATA]();
    const secondCall = collection[INTERNAL_DATA]();
    const thirdCall = collection[INTERNAL_DATA]();

    // All calls should return the same cached instance
    expect(firstCall).toBe(secondCall);
    expect(secondCall).toBe(thirdCall);
  });

  it('should have independent caches for different instances', () => {
    const collection1 = new PersistentCollection<string, number>([['a', 1]]);
    const collection2 = collection1.set('b', 2);

    const map1 = collection1[INTERNAL_DATA]();
    const map2 = collection2[INTERNAL_DATA]();

    // Different instances should have different cached Maps
    expect(map1).not.toBe(map2);
    expect(map1.size).toBe(1);
    expect(map2.size).toBe(2);
  });

  it('should not be affected by mutations to returned Map', () => {
    const collection = new PersistentCollection<string, number>([
      ['a', 1],
      ['b', 2],
    ]);

    const internalMap = collection[INTERNAL_DATA]();
    // Mutate the returned map
    internalMap.set('c', 3);
    internalMap.delete('a');

    // Original collection should be unchanged
    expect(collection.get('a')).toBe(1);
    expect(collection.get('c')).toBeUndefined();
    expect(collection.size).toBe(2);

    // Subsequent calls should return the same (now mutated) cache
    // Note: This is expected behavior - the cache is for performance,
    // consumers should not mutate it
    const secondCall = collection[INTERNAL_DATA]();
    expect(secondCall).toBe(internalMap);
  });

  it('should work correctly with empty collection', () => {
    const empty = new PersistentCollection<string, number>();

    const map1 = empty[INTERNAL_DATA]();
    const map2 = empty[INTERNAL_DATA]();

    expect(map1).toBe(map2);
    expect(map1.size).toBe(0);
  });

  it('should maintain cache through clone()', () => {
    const original = new PersistentCollection<string, number>([
      ['a', 1],
      ['b', 2],
    ]);

    const cloned = original.clone();

    // PersistentCollection.clone() returns the same instance (structural sharing)
    expect(cloned).toBe(original);

    const originalMap = original[INTERNAL_DATA]();
    const clonedMap = cloned[INTERNAL_DATA]();

    expect(originalMap).toBe(clonedMap);
  });

  it('delete() creates new instance with separate cache', () => {
    const original = new PersistentCollection<string, number>([
      ['a', 1],
      ['b', 2],
    ]);

    // Prime the cache
    const originalCache = original[INTERNAL_DATA]();

    const afterDelete = original.delete('a');

    // Should be different instance
    expect(afterDelete).not.toBe(original);

    const afterDeleteCache = afterDelete[INTERNAL_DATA]();

    // Different caches
    expect(afterDeleteCache).not.toBe(originalCache);
    expect(afterDeleteCache.size).toBe(1);
    expect(originalCache.size).toBe(2);
  });

  it('clear() creates new instance with separate cache', () => {
    const original = new PersistentCollection<string, number>([
      ['a', 1],
      ['b', 2],
    ]);

    // Prime the cache
    const originalCache = original[INTERNAL_DATA]();

    const cleared = original.clear();

    // Should be different instance
    expect(cleared).not.toBe(original);

    const clearedCache = cleared[INTERNAL_DATA]();

    // Different caches
    expect(clearedCache).not.toBe(originalCache);
    expect(clearedCache.size).toBe(0);
    expect(originalCache.size).toBe(2);
  });
});

describe('Performance characteristics', () => {
  it('lazy iteration should not allocate array for partial traversal', () => {
    // This is a behavioral test that verifies we can iterate partially
    // without memory pressure from full materialization
    let map = new PersistentMap<number, number>();
    for (let i = 0; i < 100000; i++) {
      map = map.set(i, i);
    }

    const startTime = performance.now();

    // Only iterate first 10 elements
    let count = 0;
    for (const [k, v] of map.entries()) {
      count++;
      if (count >= 10) break;
      // Use values to prevent optimization
      expect(v).toBe(k);
    }

    const elapsed = performance.now() - startTime;

    // Should complete very quickly since we only visited 10 entries
    // (not a strict assertion, but if it takes >100ms something is wrong)
    expect(elapsed).toBeLessThan(100);
    expect(count).toBe(10);
  });

  it('INTERNAL_DATA cache should avoid repeated materialization', () => {
    const collection = new PersistentCollection<number, number>(
      Array.from({ length: 10000 }, (_, i) => [i, i * 2] as [number, number]),
    );

    // First call - materializes
    const startFirst = performance.now();
    const first = collection[INTERNAL_DATA]();
    const _elapsedFirst = performance.now() - startFirst;

    // Subsequent calls - should be cached
    const startSecond = performance.now();
    const second = collection[INTERNAL_DATA]();
    const elapsedSecond = performance.now() - startSecond;

    const startThird = performance.now();
    const third = collection[INTERNAL_DATA]();
    const elapsedThird = performance.now() - startThird;

    expect(first).toBe(second);
    expect(second).toBe(third);

    // Cached calls should be much faster (essentially instant)
    // First call might take some time for materialization
    expect(elapsedSecond).toBeLessThan(1);
    expect(elapsedThird).toBeLessThan(1);
  });
});
