import { describe, expect, it } from 'vitest';

import {
  chunk,
  compact,
  flatMap,
  flatten,
  map,
  mapKeys,
  mapValues,
  reject,
} from './transform';

describe('transform operations', () => {
  const numberMap = new Map([
    ['a', 1],
    ['b', 2],
    ['c', 3],
    ['d', 4],
  ]);

  const stringMap = new Map([
    ['key1', 'hello'],
    ['key2', 'world'],
    ['key3', 'test'],
  ]);

  describe('map', () => {
    it('should transform entries to new values', () => {
      const result = map(numberMap, (value, key) => value * 2);
      expect(result).toEqual([2, 4, 6, 8]);
    });

    it('should pass key and index to mapper', () => {
      const result = map(
        stringMap,
        (value, key, index) => `${index}:${key}:${value}`,
      );
      expect(result).toEqual(['0:key1:hello', '1:key2:world', '2:key3:test']);
    });

    it('should handle empty iterable', () => {
      const result = map(new Map(), (v) => v);
      expect(result).toEqual([]);
    });
  });

  describe('mapValues', () => {
    it('should transform values keeping keys', () => {
      const result = mapValues(numberMap, (value) => value * 2);
      expect(result).toEqual(
        new Map([
          ['a', 2],
          ['b', 4],
          ['c', 6],
          ['d', 8],
        ]),
      );
    });

    it('should pass key and index to mapper', () => {
      const result = mapValues(stringMap, (value, key) => `${key}:${value}`);
      expect(result.get('key1')).toBe('key1:hello');
      expect(result.get('key2')).toBe('key2:world');
    });

    it('should handle empty iterable', () => {
      const result = mapValues(new Map(), (v) => v);
      expect(result.size).toBe(0);
    });
  });

  describe('mapKeys', () => {
    it('should transform keys keeping values', () => {
      const result = mapKeys(numberMap, (key, value) => key.toUpperCase());
      expect(result).toEqual(
        new Map([
          ['A', 1],
          ['B', 2],
          ['C', 3],
          ['D', 4],
        ]),
      );
    });

    it('should handle key collisions by keeping last value', () => {
      const result = mapKeys(numberMap, () => 'same');
      expect(result.size).toBe(1);
      expect(result.get('same')).toBe(4); // Last value
    });

    it('should handle empty iterable', () => {
      const result = mapKeys(new Map(), (v, k) => k);
      expect(result.size).toBe(0);
    });
  });

  // filter is now in search.ts, not transform.ts
  // Remove filter tests from here since they're tested in search.test.ts

  describe('reject', () => {
    it('should reject entries by predicate', () => {
      const result = reject(numberMap, (value) => value > 2);
      expect(result).toEqual(
        new Map([
          ['a', 1],
          ['b', 2],
        ]),
      );
    });

    // Test removed since filter is now in search.ts
  });

  describe('chunk', () => {
    it('should chunk entries into arrays of specified size', () => {
      const result = Array.from(chunk(numberMap, 2));
      expect(result).toEqual([
        [
          ['a', 1],
          ['b', 2],
        ],
        [
          ['c', 3],
          ['d', 4],
        ],
      ]);
    });

    it('should handle remainder in last chunk', () => {
      const map = new Map([...numberMap, ['e', 5]]);
      const result = Array.from(chunk(map, 2));
      expect(result.length).toBe(3);
      expect(result[2]).toEqual([['e', 5]]);
    });

    it('should handle chunk size larger than iterable', () => {
      const result = Array.from(chunk(numberMap, 10));
      expect(result.length).toBe(1);
      expect(result[0].length).toBe(4);
    });

    it('should return empty array for empty iterable', () => {
      const result = Array.from(chunk(new Map(), 2));
      expect(result).toEqual([]);
    });

    it('should throw for invalid chunk size', () => {
      expect(() => Array.from(chunk(numberMap, 0))).toThrow();
      expect(() => Array.from(chunk(numberMap, -1))).toThrow();
    });
  });

  describe('flatten', () => {
    it('should flatten array values', () => {
      const map = new Map([
        ['a', [1, 2]],
        ['b', [3, 4]],
        ['c', [5]],
      ]);
      const result = flatten(map);
      expect(result).toEqual([1, 2, 3, 4, 5]);
    });

    it('should handle non-array values', () => {
      const map = new Map([
        ['a', 1],
        ['b', [2, 3]],
        ['c', 4],
      ]);
      const result = flatten(map);
      expect(result).toEqual([1, 2, 3, 4]);
    });

    it('should flatten depth 1 by default', () => {
      const map = new Map([
        ['a', [[1, 2]]],
        ['b', [3, [4]]],
      ]);
      const result = flatten(map);
      expect(result).toEqual([[1, 2], 3, [4]]);
    });

    it('should flatten to specified depth', () => {
      const map = new Map([
        ['a', [[[1]]]],
        ['b', [[2, [3]]]],
      ]);
      const result = flatten(map, 2);
      expect(result).toEqual([[1], 2, [3]]);
    });

    it('should handle empty iterable', () => {
      const result = flatten(new Map());
      expect(result).toEqual([]);
    });
  });

  describe('flatMap', () => {
    it('should map and flatten results', () => {
      const result = flatMap(numberMap, (value) => [value, value * 2]);
      expect(result).toEqual([1, 2, 2, 4, 3, 6, 4, 8]);
    });

    it('should handle mappers returning non-arrays', () => {
      const result = flatMap(numberMap, (value) =>
        value % 2 === 0 ? [value, value * 2] : value,
      );
      expect(result).toEqual([1, 2, 4, 3, 4, 8]);
    });

    it('should pass key and index to mapper', () => {
      const result = flatMap(stringMap, (value, key, index) => [
        key,
        index,
        value,
      ]);
      expect(result).toEqual([
        'key1',
        0,
        'hello',
        'key2',
        1,
        'world',
        'key3',
        2,
        'test',
      ]);
    });

    it('should handle empty iterable', () => {
      const result = flatMap(new Map(), (v) => [v]);
      expect(result).toEqual([]);
    });
  });

  describe('compact', () => {
    it('should remove falsy values', () => {
      const map = new Map([
        ['a', 0],
        ['b', ''],
        ['c', false],
        ['d', null],
        ['e', undefined],
        ['f', NaN],
        ['g', 1],
        ['h', 'hello'],
        ['i', true],
      ]);
      const result = compact(map);
      expect(result).toEqual(
        new Map([
          ['g', 1],
          ['h', 'hello'],
          ['i', true],
        ]),
      );
    });

    it('should keep all truthy values', () => {
      const map = new Map([
        ['a', 1],
        ['b', 'hello'],
        ['c', true],
        ['d', []],
        ['e', {}],
      ]);
      const result = compact(map);
      expect(result.size).toBe(5);
    });

    it('should handle empty iterable', () => {
      const result = compact(new Map());
      expect(result.size).toBe(0);
    });
  });
});
