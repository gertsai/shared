import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BatchMemoizer,
  LRUCache,
  hashCollection,
  memoize,
  memoizeCollectionOp,
  memoizeMethod,
  memoizeReducer,
} from './memoize';

describe('LRUCache', () => {
  let cache: LRUCache<string, number>;

  beforeEach(() => {
    cache = new LRUCache<string, number>(3);
  });

  it('should store and retrieve values', () => {
    cache.set('a', 1);
    cache.set('b', 2);

    expect(cache.get('a')).toBe(1);
    expect(cache.get('b')).toBe(2);
    expect(cache.get('c')).toBeUndefined();
  });

  it('should evict least recently used items when capacity is exceeded', () => {
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    cache.set('d', 4); // Should evict 'a'

    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe(2);
    expect(cache.get('c')).toBe(3);
    expect(cache.get('d')).toBe(4);
  });

  it('should update LRU order on access', () => {
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);

    // Access 'a' to make it recently used
    cache.get('a');

    cache.set('d', 4); // Should evict 'b' instead of 'a'

    expect(cache.get('a')).toBe(1);
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('c')).toBe(3);
    expect(cache.get('d')).toBe(4);
  });

  it('should check if key exists', () => {
    cache.set('a', 1);

    expect(cache.has('a')).toBe(true);
    expect(cache.has('b')).toBe(false);
  });

  it('should delete entries', () => {
    cache.set('a', 1);
    cache.set('b', 2);

    expect(cache.delete('a')).toBe(true);
    expect(cache.delete('c')).toBe(false);
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe(2);
  });

  it('should clear all entries', () => {
    cache.set('a', 1);
    cache.set('b', 2);

    cache.clear();

    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBeUndefined();
    expect(cache.has('a')).toBe(false);
  });
});

describe('memoize', () => {
  it('should cache function results', () => {
    const fn = vi.fn((a: number, b: number) => a + b);
    const memoized = memoize(fn);

    expect(memoized(1, 2)).toBe(3);
    expect(memoized(1, 2)).toBe(3); // Should use cache
    expect(memoized(2, 3)).toBe(5);

    expect(fn).toHaveBeenCalledTimes(2); // Not 3
  });

  it('should respect maxSize option', () => {
    const fn = vi.fn((n: number) => n * 2);
    const memoized = memoize(fn, { maxSize: 2 });

    memoized(1); // Cache: [1]
    memoized(2); // Cache: [1, 2]
    memoized(3); // Cache: [2, 3] (1 evicted)

    memoized(1); // Cache miss, recalculate

    expect(fn).toHaveBeenCalledTimes(4);
  });

  it('should respect TTL option', async () => {
    const fn = vi.fn((n: number) => n * 2);
    const memoized = memoize(fn, { ttl: 50 });

    expect(memoized(1)).toBe(2);
    expect(memoized(1)).toBe(2); // From cache

    await new Promise((resolve) => setTimeout(resolve, 60));

    expect(memoized(1)).toBe(2); // Cache expired, recalculate

    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should support custom key generator', () => {
    const fn = vi.fn((obj: { a: number; b: number }) => obj.a + obj.b);
    const memoized = memoize(fn, {
      keyGenerator: (obj) => `${obj.a}-${obj.b}`,
    });

    const obj1 = { a: 1, b: 2 };
    const obj2 = { a: 1, b: 2 };

    expect(memoized(obj1)).toBe(3);
    expect(memoized(obj2)).toBe(3); // Should use cache despite different object reference

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should provide clearCache method', () => {
    const fn = vi.fn((n: number) => n * 2);
    const memoized = memoize(fn);

    expect(memoized(1)).toBe(2);
    expect(memoized(1)).toBe(2); // From cache

    memoized.clearCache();

    expect(memoized(1)).toBe(2); // Cache cleared, recalculate

    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe('memoizeCollectionOp', () => {
  it('should use WeakMap for collection caching', () => {
    const fn = vi.fn((map: Map<string, number>) => {
      let sum = 0;
      for (const [, value] of map) {
        sum += value;
      }
      return sum;
    });

    const memoized = memoizeCollectionOp(fn);

    const map1 = new Map([
      ['a', 1],
      ['b', 2],
    ]);
    const map2 = new Map([
      ['c', 3],
      ['d', 4],
    ]);

    expect(memoized(map1)).toBe(3);
    expect(memoized(map1)).toBe(3); // From cache
    expect(memoized(map2)).toBe(7);
    expect(memoized(map1)).toBe(3); // Still from cache

    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe('memoizeReducer', () => {
  it('should cache reducer results', () => {
    const reducer = vi.fn((acc: number, val: number, index: number) => {
      return acc + val + index;
    });
    const memoized = memoizeReducer(reducer);

    // First call with same accumulator and value
    expect(memoized(10, 5, 0)).toBe(15);

    // Second call with same params - should NOT call reducer again
    expect(memoized(10, 5, 0)).toBe(15);

    // Different params - should call reducer
    expect(memoized(10, 5, 1)).toBe(16);

    // Different accumulator - should call reducer
    expect(memoized(20, 5, 0)).toBe(25);

    expect(reducer).toHaveBeenCalledTimes(3); // Only 3 unique calls
  });

  it('should work with complex accumulators', () => {
    const reducer = vi.fn((acc: any[], val: number) => {
      return [...acc, val];
    });
    const memoized = memoizeReducer(reducer);

    const initial: any[] = [];
    const result1 = memoized(initial, 1, 0);
    expect(result1).toEqual([1]);

    // Same call - cached
    const result2 = memoized(initial, 1, 0);
    expect(result2).toEqual([1]);
    expect(result2).toBe(result1); // Same reference

    expect(reducer).toHaveBeenCalledTimes(1);
  });
});

describe('memoizeMethod', () => {
  class TestClass {
    callCount = 0;

    add(a: number, b: number): number {
      this.callCount++;
      return a + b;
    }

    multiply(a: number, b: number): number {
      this.callCount++;
      return a * b;
    }

    constructor() {
      // Apply memoization manually
      const originalAdd = this.add.bind(this);
      const memoizedAdd = memoize(originalAdd);
      this.add = memoizedAdd;

      const originalMultiply = this.multiply.bind(this);
      const memoizedMultiply = memoize(originalMultiply, { maxSize: 2 });
      this.multiply = memoizedMultiply;
    }
  }

  it('should cache method results per instance', () => {
    const instance1 = new TestClass();
    const instance2 = new TestClass();

    expect(instance1.add(1, 2)).toBe(3);
    expect(instance1.add(1, 2)).toBe(3); // From cache
    expect(instance1.callCount).toBe(1);

    expect(instance2.add(1, 2)).toBe(3); // Different instance, not cached
    expect(instance2.callCount).toBe(1);
  });

  it('should respect maxSize option for methods', () => {
    const instance = new TestClass();

    instance.multiply(1, 2); // Cache: [(1,2)]
    instance.multiply(2, 3); // Cache: [(1,2), (2,3)]
    instance.multiply(3, 4); // Cache: [(2,3), (3,4)]

    instance.multiply(1, 2); // Cache miss, recalculate

    expect(instance.callCount).toBe(4);
  });

  it('should maintain separate caches for different methods', () => {
    const instance = new TestClass();

    instance.add(1, 2);
    instance.multiply(1, 2);
    instance.add(1, 2); // Should be cached
    instance.multiply(1, 2); // Should be cached

    expect(instance.callCount).toBe(2);
  });
});

describe('LRUCache edge cases', () => {
  it('should handle zero maxSize', () => {
    const cache = new LRUCache<string, number>(0);

    cache.set('a', 1);
    cache.set('b', 2);

    // With maxSize 0, nothing should be cached
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBeUndefined();
    expect(cache.size).toBe(0);
  });

  it('should handle updating existing key position', () => {
    const cache = new LRUCache<string, number>(3);

    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);

    // Update existing key 'a'
    cache.set('a', 10);

    // 'a' should now be most recently used
    cache.set('d', 4); // Should evict 'b', not 'a'

    expect(cache.get('a')).toBe(10);
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('c')).toBe(3);
    expect(cache.get('d')).toBe(4);
  });

  it('should handle undefined values correctly', () => {
    const cache = new LRUCache<string, undefined>(2);

    cache.set('a', undefined);
    expect(cache.has('a')).toBe(true);
    expect(cache.get('a')).toBeUndefined();

    // But 'b' should not exist
    expect(cache.has('b')).toBe(false);
    expect(cache.get('b')).toBeUndefined();
  });
});

describe('memoize with TTL', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should expire cache entries after TTL', () => {
    const fn = vi.fn((a: number) => a * 2);
    const memoized = memoize(fn, { ttl: 1000 }); // 1 second TTL

    expect(memoized(5)).toBe(10);
    expect(fn).toHaveBeenCalledTimes(1);

    // Call again within TTL
    expect(memoized(5)).toBe(10);
    expect(fn).toHaveBeenCalledTimes(1); // Still cached

    // Advance time beyond TTL
    vi.advanceTimersByTime(1001);

    // Should recalculate after TTL
    expect(memoized(5)).toBe(10);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should handle TTL with weak cache', () => {
    const fn = vi.fn((obj: object) => Object.keys(obj).length);
    const memoized = memoize(fn, { weak: true, ttl: 1000 });

    const obj = { a: 1, b: 2 };

    expect(memoized(obj)).toBe(2);
    expect(fn).toHaveBeenCalledTimes(1);

    // Within TTL
    expect(memoized(obj)).toBe(2);
    expect(fn).toHaveBeenCalledTimes(1);

    // After TTL
    vi.advanceTimersByTime(1001);
    expect(memoized(obj)).toBe(2);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe('memoize with weak cache', () => {
  it('should use WeakMap for object keys', () => {
    const fn = vi.fn((obj: object) => Object.keys(obj).length);
    const memoized = memoize(fn, { weak: true });

    const obj1 = { a: 1 };
    const obj2 = { b: 2 };

    expect(memoized(obj1)).toBe(1);
    expect(memoized(obj2)).toBe(1);
    expect(memoized(obj1)).toBe(1); // Cached

    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should handle non-object keys with weak cache', () => {
    const fn = vi.fn((val: any) => val * 2);
    const memoized = memoize(fn, { weak: true });

    // Non-objects can't be used as WeakMap keys
    expect(memoized(5)).toBe(10);
    expect(memoized(5)).toBe(10); // Won't be cached

    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe('memoize cache management', () => {
  it('should clear cache', () => {
    const fn = vi.fn((a: number) => a * 2);
    const memoized = memoize(fn);

    memoized(5);
    memoized(10);
    expect(fn).toHaveBeenCalledTimes(2);

    memoized.clearCache();

    memoized(5); // Should recalculate
    memoized(10); // Should recalculate
    expect(fn).toHaveBeenCalledTimes(4);
  });

  it('should get cache size', () => {
    const fn = vi.fn((a: number) => a * 2);
    const memoized = memoize(fn, { maxSize: 3 });

    expect(memoized.getCacheSize()).toBe(0);

    memoized(1);
    expect(memoized.getCacheSize()).toBe(1);

    memoized(2);
    memoized(3);
    expect(memoized.getCacheSize()).toBe(3);

    memoized(4); // Should evict oldest
    expect(memoized.getCacheSize()).toBe(3);
  });
});

describe('memoizeCollectionOp', () => {
  it('should memoize based on collection reference', () => {
    // Create mock ReadableCollection
    class TestCollection {
      constructor(private data: Map<string, number>) {}

      values() {
        return this.data.values();
      }

      entries() {
        return this.data.entries();
      }

      get size() {
        return this.data.size;
      }
    }

    const operation = vi.fn((col: TestCollection) => {
      let sum = 0;
      for (const value of col.values()) {
        sum += value;
      }
      return sum;
    });

    const memoized = memoizeCollectionOp(operation as any);

    const col1 = new TestCollection(
      new Map([
        ['a', 1],
        ['b', 2],
      ]),
    );
    const col2 = new TestCollection(
      new Map([
        ['a', 1],
        ['b', 2],
      ]),
    ); // Different instance

    expect(memoized(col1 as any)).toBe(3);
    expect(operation).toHaveBeenCalledTimes(1);

    // Different instance, so not cached
    expect(memoized(col2 as any)).toBe(3);
    expect(operation).toHaveBeenCalledTimes(2);

    // Same instance should use cache
    expect(memoized(col1 as any)).toBe(3);
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('should cache based on arguments', () => {
    class TestCollection {
      constructor(private data: Map<string, number>) {}

      filter(predicate: (v: number) => boolean) {
        const result: number[] = [];
        for (const value of this.data.values()) {
          if (predicate(value)) {
            result.push(value);
          }
        }
        return result;
      }

      entries() {
        return this.data.entries();
      }
    }

    const operation = vi.fn((col: TestCollection, min: number) => {
      return col.filter((v) => v >= min).length;
    });

    const memoized = memoizeCollectionOp(operation as any);
    const col = new TestCollection(
      new Map([
        ['a', 1],
        ['b', 2],
        ['c', 3],
      ]),
    );

    expect(memoized(col as any, 2)).toBe(2); // [2, 3]
    expect(memoized(col as any, 2)).toBe(2); // Cached
    expect(memoized(col as any, 3)).toBe(1); // [3]

    expect(operation).toHaveBeenCalledTimes(2);
  });
});

describe('memoizeReducer', () => {
  it('should memoize reducer results', () => {
    const reducer = vi.fn((acc: number, val: number) => acc + val);
    const memoized = memoizeReducer(reducer);

    // First call
    expect(memoized(0, 1, 0)).toBe(1);
    expect(memoized(1, 2, 1)).toBe(3);
    expect(memoized(3, 3, 2)).toBe(6);

    // Should have been called 3 times
    expect(reducer).toHaveBeenCalledTimes(3);

    // Same calls should be cached
    expect(memoized(0, 1, 0)).toBe(1);
    expect(memoized(1, 2, 1)).toBe(3);

    // Still only 3 calls
    expect(reducer).toHaveBeenCalledTimes(3);
  });

  it('should handle different accumulator values', () => {
    const reducer = vi.fn((acc: number, val: number) => acc + val);
    const memoized = memoizeReducer(reducer);

    expect(memoized(0, 5, 0)).toBe(5);
    expect(memoized(10, 5, 0)).toBe(15); // Different accumulator

    // Both should be cached
    expect(memoized(0, 5, 0)).toBe(5);
    expect(memoized(10, 5, 0)).toBe(15);

    expect(reducer).toHaveBeenCalledTimes(2);
  });
});

describe('hashCollection', () => {
  it('should generate consistent hash for same content', () => {
    class TestCollection {
      constructor(private data: Map<string, number>) {}

      entries() {
        return this.data.entries();
      }

      get size() {
        return this.data.size;
      }
    }

    const col1 = new TestCollection(
      new Map([
        ['a', 1],
        ['b', 2],
      ]),
    );
    const col2 = new TestCollection(
      new Map([
        ['b', 2],
        ['a', 1],
      ]),
    ); // Different order

    const hash1 = hashCollection(col1 as any);
    const hash2 = hashCollection(col2 as any);

    expect(hash1).toBe(hash2); // Should be same despite different order
  });

  it('should generate different hash for different content', () => {
    class TestCollection {
      constructor(private data: Map<string, number>) {}

      entries() {
        return this.data.entries();
      }

      get size() {
        return this.data.size;
      }
    }

    const col1 = new TestCollection(
      new Map([
        ['a', 1],
        ['b', 2],
      ]),
    );
    const col2 = new TestCollection(
      new Map([
        ['a', 1],
        ['b', 3],
      ]),
    ); // Different value
    const col3 = new TestCollection(
      new Map([
        ['a', 1],
        ['c', 2],
      ]),
    ); // Different key

    const hash1 = hashCollection(col1 as any);
    const hash2 = hashCollection(col2 as any);
    const hash3 = hashCollection(col3 as any);

    expect(hash1).not.toBe(hash2);
    expect(hash1).not.toBe(hash3);
    expect(hash2).not.toBe(hash3);
  });
});

describe('BatchMemoizer', () => {
  it('should memoize batch operations', () => {
    const batchMemoizer = new BatchMemoizer();

    const operations = {
      add: vi.fn((a: number, b: number) => a + b),
      multiply: vi.fn((a: number, b: number) => a * b),
      subtract: vi.fn((a: number, b: number) => a - b),
    };

    const memoized = batchMemoizer.memoizeBatch(operations);

    // First calls
    expect(memoized.add(2, 3)).toBe(5);
    expect(memoized.multiply(2, 3)).toBe(6);
    expect(memoized.subtract(5, 3)).toBe(2);

    expect(operations.add).toHaveBeenCalledTimes(1);
    expect(operations.multiply).toHaveBeenCalledTimes(1);
    expect(operations.subtract).toHaveBeenCalledTimes(1);

    // Cached calls
    expect(memoized.add(2, 3)).toBe(5);
    expect(memoized.multiply(2, 3)).toBe(6);
    expect(memoized.subtract(5, 3)).toBe(2);

    // Still only called once each
    expect(operations.add).toHaveBeenCalledTimes(1);
    expect(operations.multiply).toHaveBeenCalledTimes(1);
    expect(operations.subtract).toHaveBeenCalledTimes(1);
  });

  it('should clear cache', () => {
    const batchMemoizer = new BatchMemoizer();

    const operations = {
      compute: vi.fn((n: number) => n * 2),
    };

    const memoized = batchMemoizer.memoizeBatch(operations);

    expect(memoized.compute(5)).toBe(10);
    expect(operations.compute).toHaveBeenCalledTimes(1);

    // clearCache is on the memoized object, not batchMemoizer
    memoized.clearCache();

    expect(memoized.compute(5)).toBe(10);
    expect(operations.compute).toHaveBeenCalledTimes(2); // Called again after clear
  });

  it('should share cache between operations', () => {
    const batchMemoizer = new BatchMemoizer();

    let sharedData = 0;

    const operations = {
      increment: vi.fn(() => ++sharedData),
      getDouble: vi.fn(() => sharedData * 2),
    };

    const memoized = batchMemoizer.memoizeBatch(operations);

    // First increment
    expect(memoized.increment()).toBe(1);
    expect(memoized.getDouble()).toBe(2);

    // These should be cached
    expect(memoized.increment()).toBe(1); // Still returns 1 (cached)
    expect(memoized.getDouble()).toBe(2); // Still returns 2 (cached)

    expect(operations.increment).toHaveBeenCalledTimes(1);
    expect(operations.getDouble).toHaveBeenCalledTimes(1);
  });
});

describe('memoize with custom key generator', () => {
  it('should use custom key generator', () => {
    const fn = vi.fn((a: number, b: number) => a + b);

    // Custom key generator that only uses first argument
    const memoized = memoize(fn, {
      keyGenerator: (a: number) => String(a),
    });

    expect(memoized(1, 2)).toBe(3);
    expect(memoized(1, 3)).toBe(3); // Uses cached value because key is same
    expect(memoized(2, 2)).toBe(4);

    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should handle complex objects in key generator', () => {
    const fn = vi.fn((obj: { id: number; data: string }) => obj.id);

    const memoized = memoize(fn, {
      keyGenerator: (obj) => `id:${obj.id}`,
    });

    const obj1 = { id: 1, data: 'a' };
    const obj2 = { id: 1, data: 'b' }; // Same id, different data
    const obj3 = { id: 2, data: 'c' };

    expect(memoized(obj1)).toBe(1);
    expect(memoized(obj2)).toBe(1); // Cached by id
    expect(memoized(obj3)).toBe(2);

    expect(fn).toHaveBeenCalledTimes(2);
  });
});
