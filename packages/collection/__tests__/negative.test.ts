import { describe, expect, it, vi } from 'vitest';
import {
  ImmutableCollection,
  LRUCache,
  MutableCollection,
  Seq,
  memoize,
} from '../src';

describe('Negative tests - Error handling and edge cases', () => {
  describe('MutableCollection error cases', () => {
    it('should handle undefined values', () => {
      const collection = new MutableCollection<string, any>();

      collection.set('a', undefined);
      expect(collection.get('a')).toBeUndefined();
      expect(collection.has('a')).toBe(true);
    });

    it('should handle null values', () => {
      const collection = new MutableCollection<string, any>();

      collection.set('a', null);
      expect(collection.get('a')).toBeNull();
      expect(collection.has('a')).toBe(true);
    });

    it('should handle NaN values', () => {
      const collection = new MutableCollection<string, number>();

      collection.set('a', NaN);
      expect(collection.get('a')).toBeNaN();
      expect(collection.has('a')).toBe(true);
    });

    it('should handle symbol keys', () => {
      const sym = Symbol('test');
      const collection = new MutableCollection<symbol, string>();

      collection.set(sym, 'value');
      expect(collection.get(sym)).toBe('value');
    });

    it('should throw when accessing non-existent methods', () => {
      const collection = new MutableCollection();

      expect(() => (collection as any).nonExistentMethod()).toThrow();
    });

    it('should handle duplicate key in mapKeys causing collision', () => {
      const collection = new MutableCollection([
        ['a', 1],
        ['b', 2],
      ]);

      // Both keys map to same value - last wins
      const mapped = collection.mapKeys(() => 'same');

      expect(mapped.size).toBe(1);
      expect(mapped.get('same')).toBe(2); // Last value wins
    });

    it('should handle infinite values', () => {
      const collection = new MutableCollection<string, number>();

      collection.set('pos', Infinity);
      collection.set('neg', -Infinity);

      expect(collection.get('pos')).toBe(Infinity);
      expect(collection.get('neg')).toBe(-Infinity);
    });

    it('should handle empty updater function', () => {
      const collection = new MutableCollection([['a', 1]]);

      // Updater that doesn't return value
      expect(() => {
        collection.update('a', () => undefined as any);
      }).not.toThrow();

      expect(collection.get('a')).toBeUndefined();
    });

    it('should handle cyclic references in values', () => {
      const collection = new MutableCollection<string, any>();
      const obj: any = { a: 1 };
      obj.self = obj; // Cyclic reference

      collection.set('cyclic', obj);
      expect(collection.get('cyclic')).toBe(obj);
      expect(collection.get('cyclic').self).toBe(obj);
    });
  });

  describe('ImmutableCollection error cases', () => {
    it('should handle mutations in withMutations that throw', () => {
      const collection = new ImmutableCollection([['a', 1]]);

      expect(() => {
        collection.withMutations((mutable) => {
          mutable.set('b', 2);
          throw new Error('Test error');
        });
      }).toThrow('Test error');
    });

    it('should handle empty collection operations', () => {
      const empty = new ImmutableCollection<string, number>();

      expect(empty.filter(() => true)).toBe(empty);
      expect(empty.map(() => [])).toEqual([]);
      expect(empty.reduce((acc) => acc, 0)).toBe(0);
      expect(empty.some(() => true)).toBe(false);
      expect(empty.every(() => false)).toBe(true);
    });

    it('should handle very large collections', () => {
      const entries: Array<[number, number]> = [];
      for (let i = 0; i < 10000; i++) {
        entries.push([i, i]);
      }

      const collection = new ImmutableCollection(entries);
      expect(collection.size).toBe(10000);

      // Should handle operations on large collections
      const filtered = collection.filter((v) => v < 100);
      expect(filtered.size).toBe(100);
    });
  });

  describe('Seq error cases', () => {
    it('should handle empty sequences', () => {
      const empty = new Seq([]);

      expect(empty.first()).toBeUndefined();
      expect(empty.count()).toBe(0);
      expect(empty.toArray()).toEqual([]);
      expect(empty.some(() => true)).toBe(false);
      expect(empty.every(() => false)).toBe(true);
    });

    it('should handle errors in predicates', () => {
      const seq = new Seq([
        ['a', 1],
        ['b', 2],
      ]);

      const errorPredicate = () => {
        throw new Error('Predicate error');
      };

      // Lazy evaluation - error only thrown when iterated
      const filtered = seq.filter(errorPredicate);

      expect(() => {
        Array.from(filtered);
      }).toThrow('Predicate error');
    });

    it('should handle infinite sequences carefully', () => {
      // Generator that produces infinite sequence
      function* infiniteSequence(): Generator<[number, number]> {
        let i = 0;
        while (true) {
          yield [i, i];
          i++;
        }
      }

      const seq = new Seq(infiniteSequence());

      // Take limits the infinite sequence
      const limited = seq.take(5).toArray();
      expect(limited).toEqual([0, 1, 2, 3, 4]);
    });
  });

  describe('Memoization error cases', () => {
    it('should handle LRUCache with size 0', () => {
      const cache = new LRUCache<string, number>(0);

      cache.set('a', 1);
      expect(cache.get('a')).toBeUndefined(); // Size 0, nothing cached
    });

    it('should handle negative cache size', () => {
      const cache = new LRUCache<string, number>(-1);

      cache.set('a', 1);
      expect(cache.get('a')).toBeUndefined(); // Negative size treated as 0
    });

    it('should handle memoization of functions that throw', () => {
      const errorFn = vi.fn(() => {
        throw new Error('Function error');
      });

      const memoized = memoize(errorFn);

      expect(() => memoized()).toThrow('Function error');
      expect(() => memoized()).toThrow('Function error');

      // Error is not cached, function called twice
      expect(errorFn).toHaveBeenCalledTimes(2);
    });

    it('should handle memoization with undefined arguments', () => {
      const fn = vi.fn((a?: any, b?: any) => `${a}-${b}`);
      const memoized = memoize(fn);

      expect(memoized(undefined, undefined)).toBe('undefined-undefined');
      expect(memoized(undefined, null)).toBe('undefined-null');
      expect(memoized()).toBe('undefined-undefined');

      // Note: undefined-undefined and () are different cache keys
      expect(fn).toHaveBeenCalledTimes(3); // Each unique combo is cached
    });

    it('should handle TTL of 0', () => {
      const fn = vi.fn((n: number) => n * 2);
      const memoized = memoize(fn, { ttl: 0 });

      expect(memoized(1)).toBe(2);
      expect(memoized(1)).toBe(2);

      // TTL 0 means cache expires immediately
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  describe('Type safety violations', () => {
    it('should handle type mismatches at runtime', () => {
      const collection = new MutableCollection<string, number>();

      // Force type violation at runtime
      (collection as any).set('a', 'not a number');

      const value = collection.get('a');
      expect(typeof value).toBe('string'); // Type system says number, but it's string
    });

    it('should handle invalid comparator functions', () => {
      const collection = new MutableCollection([
        ['a', 1],
        ['b', 2],
      ]);

      // Invalid comparator that doesn't return number
      const badComparator: any = () => 'not a number';

      // Should not throw but behavior is undefined
      expect(() => {
        collection.sort(badComparator);
      }).not.toThrow();
    });
  });

  describe('Memory and performance edge cases', () => {
    it.skip('should handle memory cleanup in WeakMap operations', () => {
      // Skipped: GC behavior is not predictable in tests
      let obj: any = { key: 'value' };
      const collection = new MutableCollection<object, string>();

      collection.set(obj, 'data');
      expect(collection.get(obj)).toBe('data');

      // Simulate object going out of scope
      const weakRef = new WeakRef(obj);
      obj = null;

      // Force garbage collection (if available)
      if (global.gc) {
        global.gc();
      }

      // WeakRef might be collected
      expect(weakRef.deref()).toBeUndefined();
    });

    it('should handle stack overflow in deep recursion', () => {
      const createDeepStructure = (depth: number): any => {
        if (depth === 0) {
          return 'leaf';
        }
        return { next: createDeepStructure(depth - 1) };
      };

      const collection = new MutableCollection();
      const deepObj = createDeepStructure(10000);

      // Should handle deep objects without stack overflow
      expect(() => {
        collection.set('deep', deepObj);
      }).not.toThrow();
    });
  });
});
