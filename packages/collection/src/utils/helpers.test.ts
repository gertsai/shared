import { describe, it, expect } from 'vitest';
import {
  isPlainObject,
  isIterable,
  isMap,
  isSet,
  deepClone,
  deepMerge,
  mergeStrategies,
  getIterableSize,
  entriesArray,
  getRandomIndex,
  isPrimitive,
  batch,
  concat,
  createComparatorByKey,
  combinePredicates,
  toEntries,
  createCollectionLike,
  isEqual,
} from './helpers';
// Note: Type imports removed - they don't exist in helpers.ts
// Use types from '../types/interfaces' if needed

describe('helpers', () => {
  describe('isPlainObject', () => {
    it('should identify plain objects', () => {
      expect(isPlainObject({})).toBe(true);
      expect(isPlainObject({ a: 1 })).toBe(true);
      expect(isPlainObject(Object.create(null))).toBe(true);
    });

    it('should reject non-plain objects', () => {
      expect(isPlainObject(null)).toBe(false);
      expect(isPlainObject(undefined)).toBe(false);
      expect(isPlainObject([])).toBe(false);
      expect(isPlainObject(new Date())).toBe(false);
      expect(isPlainObject(new Map())).toBe(false);
      expect(isPlainObject(new Set())).toBe(false);
      expect(isPlainObject(() => {})).toBe(false);
      expect(isPlainObject(42)).toBe(false);
      expect(isPlainObject('string')).toBe(false);
      expect(isPlainObject(Symbol())).toBe(false);
    });
  });

  describe('isIterable', () => {
    it('should identify iterables', () => {
      expect(isIterable([])).toBe(true);
      expect(isIterable('string')).toBe(true);
      expect(isIterable(new Map())).toBe(true);
      expect(isIterable(new Set())).toBe(true);
      expect(
        isIterable({
          [Symbol.iterator]: function* () {
            yield 1;
          },
        }),
      ).toBe(true);
    });

    it('should reject non-iterables', () => {
      expect(isIterable({})).toBe(false);
      expect(isIterable(null)).toBe(false);
      expect(isIterable(undefined)).toBe(false);
      expect(isIterable(42)).toBe(false);
      expect(isIterable(true)).toBe(false);
      expect(isIterable(Symbol())).toBe(false);
    });
  });

  describe('isMap', () => {
    it('should identify Maps', () => {
      expect(isMap(new Map())).toBe(true);
      expect(isMap(new Map([['a', 1]]))).toBe(true);
    });

    it('should reject non-Maps', () => {
      expect(isMap(new WeakMap())).toBe(false);
      expect(isMap({})).toBe(false);
      expect(isMap([])).toBe(false);
      expect(isMap(new Set())).toBe(false);
      expect(isMap(null)).toBe(false);
      expect(isMap(undefined)).toBe(false);
    });
  });

  describe('isSet', () => {
    it('should identify Sets', () => {
      expect(isSet(new Set())).toBe(true);
      expect(isSet(new Set([1, 2, 3]))).toBe(true);
    });

    it('should reject non-Sets', () => {
      expect(isSet(new WeakSet())).toBe(false);
      expect(isSet({})).toBe(false);
      expect(isSet([])).toBe(false);
      expect(isSet(new Map())).toBe(false);
      expect(isSet(null)).toBe(false);
      expect(isSet(undefined)).toBe(false);
    });
  });

  describe('isPrimitive', () => {
    it('should identify primitives', () => {
      expect(isPrimitive(null)).toBe(true);
      expect(isPrimitive(undefined)).toBe(true);
      expect(isPrimitive(42)).toBe(true);
      expect(isPrimitive('string')).toBe(true);
      expect(isPrimitive(true)).toBe(true);
      expect(isPrimitive(false)).toBe(true);
      expect(isPrimitive(Symbol('test'))).toBe(true);
      expect(isPrimitive(BigInt(123))).toBe(true);
    });

    it('should reject non-primitives', () => {
      expect(isPrimitive({})).toBe(false);
      expect(isPrimitive([])).toBe(false);
      expect(isPrimitive(new Date())).toBe(false);
      expect(isPrimitive(new Map())).toBe(false);
      expect(isPrimitive(() => {})).toBe(false);
    });
  });

  describe('deepClone', () => {
    it('should clone primitives', () => {
      expect(deepClone(42)).toBe(42);
      expect(deepClone('string')).toBe('string');
      expect(deepClone(true)).toBe(true);
      expect(deepClone(null)).toBe(null);
      expect(deepClone(undefined)).toBe(undefined);
    });

    it('should clone objects deeply', () => {
      const obj = {
        a: 1,
        b: { c: 2, d: { e: 3 } },
        f: [1, 2, { g: 4 }],
      };
      const cloned = deepClone(obj);

      expect(cloned).toEqual(obj);
      expect(cloned).not.toBe(obj);
      expect(cloned.b).not.toBe(obj.b);
      expect(cloned.b.d).not.toBe(obj.b.d);
      expect(cloned.f).not.toBe(obj.f);
      expect(cloned.f[2]).not.toBe(obj.f[2]);
    });

    it('should clone arrays deeply', () => {
      const arr = [1, [2, 3], { a: 4 }];
      const cloned = deepClone(arr);

      expect(cloned).toEqual(arr);
      expect(cloned).not.toBe(arr);
      expect(cloned[1]).not.toBe(arr[1]);
      expect(cloned[2]).not.toBe(arr[2]);
    });

    it('should clone Maps', () => {
      const map = new Map([
        ['a', 1],
        ['b', { c: 2 }],
      ]);
      const cloned = deepClone(map);

      expect(cloned).toBeInstanceOf(Map);
      expect(cloned).not.toBe(map);
      expect(cloned.get('a')).toBe(1);
      expect(cloned.get('b')).toEqual({ c: 2 });
      expect(cloned.get('b')).not.toBe(map.get('b'));
    });

    it('should clone Sets', () => {
      const set = new Set([1, { a: 2 }, [3, 4]]);
      const cloned = deepClone(set);

      expect(cloned).toBeInstanceOf(Set);
      expect(cloned).not.toBe(set);
      expect(cloned.size).toBe(3);

      const clonedArray = Array.from(cloned);
      const originalArray = Array.from(set);
      expect(clonedArray[1]).toEqual(originalArray[1]);
      expect(clonedArray[1]).not.toBe(originalArray[1]);
    });

    it('should handle circular references', () => {
      const obj: any = { a: 1 };
      obj.self = obj;
      const cloned = deepClone(obj);

      expect(cloned.a).toBe(1);
      expect(cloned.self).toBe(cloned);
      expect(cloned).not.toBe(obj);
    });

    it('should clone Dates', () => {
      const date = new Date('2024-01-01');
      const cloned = deepClone(date);

      expect(cloned).toBeInstanceOf(Date);
      expect(cloned).not.toBe(date);
      expect(cloned.getTime()).toBe(date.getTime());
    });

    it('should clone RegExp', () => {
      const regex = /test/gi;
      const cloned = deepClone(regex);

      expect(cloned).toBeInstanceOf(RegExp);
      expect(cloned).not.toBe(regex);
      expect(cloned.source).toBe(regex.source);
      expect(cloned.flags).toBe(regex.flags);
    });
  });

  describe('deepMerge', () => {
    it('should merge objects deeply', () => {
      const target = { a: 1, b: { c: 2 }, d: [1] };
      const source = { b: { d: 3 }, e: 4, d: [2] };
      const result = deepMerge(target, source);

      expect(result).toEqual({
        a: 1,
        b: { c: 2, d: 3 },
        d: [2],
        e: 4,
      });
    });

    it('should handle null and undefined', () => {
      expect(deepMerge(null, { a: 1 })).toEqual({ a: 1 });
      expect(deepMerge({ a: 1 }, null)).toEqual({ a: 1 });
      expect(deepMerge(undefined, { a: 1 })).toEqual({ a: 1 });
      expect(deepMerge({ a: 1 }, undefined)).toEqual({ a: 1 });
    });

    it('should use merge strategy', () => {
      const target = { a: [1], b: { c: 2 } };
      const source = { a: [2], b: { d: 3 } };
      const result = deepMerge(target, source, mergeStrategies.concat);

      expect(result).toEqual({
        a: [1, 2],
        b: { c: 2, d: 3 },
      });
    });

    it('should merge Maps', () => {
      const map1 = new Map([
        ['a', 1],
        ['b', 2],
      ]);
      const map2 = new Map([
        ['b', 3],
        ['c', 4],
      ]);
      const result = deepMerge(map1, map2);

      expect(result).toBeInstanceOf(Map);
      expect(result.get('a')).toBe(1);
      expect(result.get('b')).toBe(3);
      expect(result.get('c')).toBe(4);
    });

    it('should merge Sets', () => {
      const set1 = new Set([1, 2]);
      const set2 = new Set([2, 3]);
      const result = deepMerge(set1, set2);

      expect(result).toBeInstanceOf(Set);
      expect(result.size).toBe(3);
      expect(result.has(1)).toBe(true);
      expect(result.has(2)).toBe(true);
      expect(result.has(3)).toBe(true);
    });
  });

  describe('mergeStrategies', () => {
    it('replace strategy should replace values', () => {
      const result = mergeStrategies.replace([1, 2], [3, 4]);
      expect(result).toEqual([3, 4]);
    });

    it('concat strategy should concatenate arrays', () => {
      const result = mergeStrategies.concat([1, 2], [3, 4]);
      expect(result).toEqual([1, 2, 3, 4]);
    });

    it('concat strategy should handle non-arrays', () => {
      const result = mergeStrategies.concat(1, 2);
      expect(result).toBe(2);
    });

    it('dedupe strategy should deduplicate arrays', () => {
      const result = mergeStrategies.dedupe([1, 2, 2], [2, 3, 3]);
      expect(result).toEqual([1, 2, 3]);
    });

    it('dedupe strategy should handle non-arrays', () => {
      const result = mergeStrategies.dedupe(1, 2);
      expect(result).toBe(2);
    });
  });

  describe('getIterableSize', () => {
    it('should get size of arrays', () => {
      expect(getIterableSize([])).toBe(0);
      expect(getIterableSize([1, 2, 3])).toBe(3);
    });

    it('should get size of strings', () => {
      expect(getIterableSize('')).toBe(0);
      expect(getIterableSize('abc')).toBe(3);
    });

    it('should get size of Maps', () => {
      expect(getIterableSize(new Map())).toBe(0);
      expect(
        getIterableSize(
          new Map([
            ['a', 1],
            ['b', 2],
          ]),
        ),
      ).toBe(2);
    });

    it('should get size of Sets', () => {
      expect(getIterableSize(new Set())).toBe(0);
      expect(getIterableSize(new Set([1, 2, 3]))).toBe(3);
    });

    it('should get size of custom iterables', () => {
      const iterable = {
        *[Symbol.iterator]() {
          yield 1;
          yield 2;
        },
      };
      expect(getIterableSize(iterable)).toBe(2);
    });
  });

  describe('entriesArray', () => {
    it('should convert Map to entries array', () => {
      const map = new Map([
        ['a', 1],
        ['b', 2],
      ]);
      expect(entriesArray(map)).toEqual([
        ['a', 1],
        ['b', 2],
      ]);
    });

    it('should convert object to entries array', () => {
      const obj = { a: 1, b: 2 };
      expect(entriesArray(obj)).toEqual([
        ['a', 1],
        ['b', 2],
      ]);
    });

    it('should handle arrays', () => {
      const arr = ['a', 'b'];
      expect(entriesArray(arr)).toEqual([
        [0, 'a'],
        [1, 'b'],
      ]);
    });

    it('should return empty array for non-objects', () => {
      expect(entriesArray(null)).toEqual([]);
      expect(entriesArray(undefined)).toEqual([]);
      expect(entriesArray(42)).toEqual([]);
      expect(entriesArray('string')).toEqual([]);
    });
  });

  describe('getRandomIndex', () => {
    it('should return index within range', () => {
      const size = 10;
      for (let i = 0; i < 100; i++) {
        const index = getRandomIndex(size);
        expect(index).toBeGreaterThanOrEqual(0);
        expect(index).toBeLessThan(size);
        expect(Number.isInteger(index)).toBe(true);
      }
    });

    it('should handle size of 1', () => {
      expect(getRandomIndex(1)).toBe(0);
    });

    it('should throw for invalid size', () => {
      expect(() => getRandomIndex(0)).toThrow();
      expect(() => getRandomIndex(-1)).toThrow();
    });
  });

  describe('batch', () => {
    it('should batch items into chunks', () => {
      const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const batches = Array.from(batch(items, 3));

      expect(batches).toEqual([[1, 2, 3], [4, 5, 6], [7, 8, 9], [10]]);
    });

    it('should handle exact batch size', () => {
      const items = [1, 2, 3, 4, 5, 6];
      const batches = Array.from(batch(items, 2));

      expect(batches).toEqual([
        [1, 2],
        [3, 4],
        [5, 6],
      ]);
    });

    it('should handle empty iterable', () => {
      const batches = Array.from(batch([], 3));
      expect(batches).toEqual([]);
    });

    it('should throw for invalid batch size', () => {
      expect(() => Array.from(batch([1, 2, 3], 0))).toThrow('Batch size must be positive');
      expect(() => Array.from(batch([1, 2, 3], -1))).toThrow('Batch size must be positive');
    });
  });

  describe('concat', () => {
    it('should concatenate multiple iterables', () => {
      const result = Array.from(concat([1, 2], [3, 4], [5, 6]));
      expect(result).toEqual([1, 2, 3, 4, 5, 6]);
    });

    it('should handle empty iterables', () => {
      const result = Array.from(concat([], [1, 2], [], [3], []));
      expect(result).toEqual([1, 2, 3]);
    });

    it('should handle single iterable', () => {
      const result = Array.from(concat([1, 2, 3]));
      expect(result).toEqual([1, 2, 3]);
    });

    it('should handle no iterables', () => {
      const result = Array.from(concat());
      expect(result).toEqual([]);
    });
  });

  describe('createComparatorByKey', () => {
    it('should create comparator for object properties', () => {
      const items = [
        { id: 3, name: 'Charlie' },
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
      ];

      const comparator = createComparatorByKey((item) => item.id);
      items.sort(comparator);

      expect(items).toEqual([
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
        { id: 3, name: 'Charlie' },
      ]);
    });

    it('should use custom compare function', () => {
      const items = [
        { id: 1, name: 'Charlie' },
        { id: 2, name: 'Alice' },
        { id: 3, name: 'Bob' },
      ];

      const comparator = createComparatorByKey(
        (item) => item.name,
        (a, b) => b.localeCompare(a), // Reverse order
      );
      items.sort(comparator);

      expect(items).toEqual([
        { id: 1, name: 'Charlie' },
        { id: 3, name: 'Bob' },
        { id: 2, name: 'Alice' },
      ]);
    });

    it('should handle equal keys', () => {
      const items = [
        { id: 1, value: 'a' },
        { id: 1, value: 'b' },
        { id: 2, value: 'c' },
      ];

      const comparator = createComparatorByKey((item) => item.id);
      const sorted = [...items].sort(comparator);

      expect(sorted[0].id).toBe(1);
      expect(sorted[1].id).toBe(1);
      expect(sorted[2].id).toBe(2);
    });
  });

  describe('combinePredicates', () => {
    it('should combine multiple predicates with AND logic', () => {
      const isEven = (n: number) => n % 2 === 0;
      const isPositive = (n: number) => n > 0;
      const isSmall = (n: number) => n < 10;

      const combined = combinePredicates(isEven, isPositive, isSmall);

      expect(combined(4)).toBe(true); // Even, positive, small
      expect(combined(2)).toBe(true); // Even, positive, small
      expect(combined(-2)).toBe(false); // Even, not positive, small
      expect(combined(3)).toBe(false); // Not even, positive, small
      expect(combined(12)).toBe(false); // Even, positive, not small
    });

    it('should handle single predicate', () => {
      const isEven = (n: number) => n % 2 === 0;
      const combined = combinePredicates(isEven);

      expect(combined(2)).toBe(true);
      expect(combined(3)).toBe(false);
    });

    it('should handle no predicates', () => {
      const combined = combinePredicates<number>();

      expect(combined(5)).toBe(true); // All predicates pass (vacuous truth)
    });
  });

  describe('toEntries', () => {
    it('should convert Map to entries', () => {
      const map = new Map([
        ['a', 1],
        ['b', 2],
      ]);

      const entries = Array.from(toEntries(map));
      expect(entries).toEqual([
        ['a', 1],
        ['b', 2],
      ]);
    });

    it('should handle objects with entries method', () => {
      const obj = {
        entries() {
          return [
            ['x', 10],
            ['y', 20],
          ][Symbol.iterator]();
        },
      };

      const entries = Array.from(toEntries(obj));
      expect(entries).toEqual([
        ['x', 10],
        ['y', 20],
      ]);
    });

    it('should pass through iterables without entries method', () => {
      // Create a custom iterable without entries method
      const iterable = {
        *[Symbol.iterator]() {
          yield ['a', 1] as [string, number];
          yield ['b', 2] as [string, number];
        },
      };

      const entries = Array.from(toEntries(iterable));
      expect(entries).toEqual([
        ['a', 1],
        ['b', 2],
      ]);
    });
  });

  describe('createCollectionLike', () => {
    class CustomCollection<K, V> {
      public data: Map<K, V>;

      constructor(entries?: Iterable<[K, V]>) {
        this.data = new Map(entries);
      }

      get size() {
        return this.data.size;
      }
    }

    it('should create new instance of same type', () => {
      const original = new CustomCollection([
        ['a', 1],
        ['b', 2],
      ]);

      const newEntries: Array<[string, number]> = [
        ['c', 3],
        ['d', 4],
      ];

      const created = createCollectionLike(original, newEntries);

      expect(created).toBeInstanceOf(CustomCollection);
      expect(created).not.toBe(original);
      expect(created.size).toBe(2);
      expect(created.data.get('c')).toBe(3);
      expect(created.data.get('d')).toBe(4);
    });
  });

  describe('isEqual', () => {
    it('should use Object.is semantics', () => {
      expect(isEqual(0, 0)).toBe(true);
      expect(isEqual(0, -0)).toBe(false);
      expect(isEqual(NaN, NaN)).toBe(true);
      expect(isEqual('a', 'a')).toBe(true);
      expect(isEqual('a', 'b')).toBe(false);

      const obj = {};
      expect(isEqual(obj, obj)).toBe(true);
      expect(isEqual({}, {})).toBe(false);
    });
  });
});
