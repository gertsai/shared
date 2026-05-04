import { describe, it, expect } from 'vitest';
import * as aggregate from './aggregate';

describe('aggregate operations', () => {
  const numberMap = new Map([
    ['a', 1],
    ['b', 2],
    ['c', 3],
    ['d', 4],
    ['e', 5],
  ]);

  const stringMap = new Map([
    ['key1', 'apple'],
    ['key2', 'banana'],
    ['key3', 'cherry'],
  ]);

  const objectMap = new Map([
    ['user1', { name: 'Alice', age: 30 }],
    ['user2', { name: 'Bob', age: 25 }],
    ['user3', { name: 'Charlie', age: 35 }],
  ]);

  describe('reduce', () => {
    it('should reduce values with initial value', () => {
      const result = aggregate.reduce(numberMap, (acc, val) => acc + val, 0);
      expect(result).toBe(15);
    });

    it('should reduce values without initial value', () => {
      const result = aggregate.reduce(numberMap, (acc, val) => acc * val);
      expect(result).toBe(120);
    });

    it('should pass key and index to reducer', () => {
      const keys: string[] = [];
      const indices: number[] = [];

      aggregate.reduce(
        numberMap,
        (acc, val, key, index) => {
          keys.push(key);
          indices.push(index);
          return acc;
        },
        0,
      );

      expect(keys).toEqual(['a', 'b', 'c', 'd', 'e']);
      expect(indices).toEqual([0, 1, 2, 3, 4]);
    });

    it('should handle empty iterable with initial value', () => {
      const result = aggregate.reduce(new Map(), (acc, val) => acc + val, 10);
      expect(result).toBe(10);
    });

    it('should throw on empty iterable without initial value', () => {
      expect(() =>
        aggregate.reduce(new Map(), (acc, val) => acc + val),
      ).toThrow();
    });
  });

  describe('sum', () => {
    it('should sum numeric values', () => {
      expect(aggregate.sum(numberMap)).toBe(15);
    });

    it('should return 0 for empty iterable', () => {
      expect(aggregate.sum(new Map())).toBe(0);
    });

    it('should handle negative numbers', () => {
      const map = new Map([
        ['a', -1],
        ['b', 2],
        ['c', -3],
      ]);
      expect(aggregate.sum(map)).toBe(-2);
    });

    it('should handle floating point numbers', () => {
      const map = new Map([
        ['a', 0.1],
        ['b', 0.2],
        ['c', 0.3],
      ]);
      expect(aggregate.sum(map)).toBeCloseTo(0.6);
    });
  });

  describe('average', () => {
    it('should calculate average of numeric values', () => {
      expect(aggregate.average(numberMap)).toBe(3);
    });

    it('should return NaN for empty iterable', () => {
      expect(aggregate.average(new Map())).toBeNaN();
    });

    it('should handle negative numbers', () => {
      const map = new Map([
        ['a', -2],
        ['b', 4],
        ['c', 7],
      ]);
      expect(aggregate.average(map)).toBe(3);
    });
  });

  describe('min', () => {
    it('should find minimum value', () => {
      expect(aggregate.min(numberMap)).toBe(1);
    });

    it('should return Infinity for empty iterable', () => {
      expect(aggregate.min(new Map())).toBe(Infinity);
    });

    it('should work with strings', () => {
      expect(aggregate.min(stringMap)).toBe('apple');
    });

    it('should handle negative numbers', () => {
      const map = new Map([
        ['a', -5],
        ['b', 0],
        ['c', 5],
      ]);
      expect(aggregate.min(map)).toBe(-5);
    });
  });

  describe('minEntry', () => {
    it('should find entry with minimum value', () => {
      expect(aggregate.minEntry(numberMap)).toEqual(['a', 1]);
    });

    it('should return undefined for empty iterable', () => {
      expect(aggregate.minEntry(new Map())).toBeUndefined();
    });
  });

  describe('max', () => {
    it('should find maximum value', () => {
      expect(aggregate.max(numberMap)).toBe(5);
    });

    it('should return -Infinity for empty iterable', () => {
      expect(aggregate.max(new Map())).toBe(-Infinity);
    });

    it('should work with strings', () => {
      expect(aggregate.max(stringMap)).toBe('cherry');
    });

    it('should handle negative numbers', () => {
      const map = new Map([
        ['a', -5],
        ['b', 0],
        ['c', 5],
      ]);
      expect(aggregate.max(map)).toBe(5);
    });
  });

  describe('maxEntry', () => {
    it('should find entry with maximum value', () => {
      expect(aggregate.maxEntry(numberMap)).toEqual(['e', 5]);
    });

    it('should return undefined for empty iterable', () => {
      expect(aggregate.maxEntry(new Map())).toBeUndefined();
    });
  });

  describe('median', () => {
    it('should find median of odd number of values', () => {
      expect(aggregate.median(numberMap)).toBe(3);
    });

    it('should find median of even number of values', () => {
      const map = new Map([
        ['a', 1],
        ['b', 2],
        ['c', 3],
        ['d', 4],
      ]);
      expect(aggregate.median(map)).toBe(2.5);
    });

    it('should return NaN for empty iterable', () => {
      expect(aggregate.median(new Map())).toBeNaN();
    });

    it('should handle single value', () => {
      const map = new Map([['a', 42]]);
      expect(aggregate.median(map)).toBe(42);
    });
  });

  describe('mode', () => {
    it('should find mode (most frequent value)', () => {
      const map = new Map([
        ['a', 1],
        ['b', 2],
        ['c', 2],
        ['d', 3],
        ['e', 2],
      ]);
      expect(aggregate.mode(map)).toBe(2);
    });

    it('should return first mode when multiple exist', () => {
      const map = new Map([
        ['a', 1],
        ['b', 1],
        ['c', 2],
        ['d', 2],
      ]);
      expect(aggregate.mode(map)).toBe(1);
    });

    it('should return undefined for empty iterable', () => {
      expect(aggregate.mode(new Map())).toBeUndefined();
    });

    it('should work with strings', () => {
      const map = new Map([
        ['a', 'x'],
        ['b', 'y'],
        ['c', 'x'],
        ['d', 'x'],
      ]);
      expect(aggregate.mode(map)).toBe('x');
    });
  });

  describe('frequency', () => {
    it('should count frequency of each value', () => {
      const map = new Map([
        ['a', 'x'],
        ['b', 'y'],
        ['c', 'x'],
        ['d', 'z'],
        ['e', 'x'],
      ]);
      const freq = aggregate.frequency(map);

      expect(freq.get('x')).toBe(3);
      expect(freq.get('y')).toBe(1);
      expect(freq.get('z')).toBe(1);
    });

    it('should return empty Map for empty iterable', () => {
      const freq = aggregate.frequency(new Map());
      expect(freq.size).toBe(0);
    });

    it('should work with numbers', () => {
      const map = new Map([
        ['a', 1],
        ['b', 2],
        ['c', 1],
        ['d', 1],
      ]);
      const freq = aggregate.frequency(map);

      expect(freq.get(1)).toBe(3);
      expect(freq.get(2)).toBe(1);
    });
  });

  describe('groupBy', () => {
    it('should group entries by value property', () => {
      const grouped = aggregate.groupBy(objectMap, (user) =>
        user.age >= 30 ? 'senior' : 'junior',
      );

      expect(grouped.get('senior')).toEqual([
        ['user1', { name: 'Alice', age: 30 }],
        ['user3', { name: 'Charlie', age: 35 }],
      ]);
      expect(grouped.get('junior')).toEqual([
        ['user2', { name: 'Bob', age: 25 }],
      ]);
    });

    it('should handle empty iterable', () => {
      const grouped = aggregate.groupBy(new Map(), (val) => 'group');
      expect(grouped.size).toBe(0);
    });

    it('should group by computed key', () => {
      const grouped = aggregate.groupBy(numberMap, (val) =>
        val % 2 === 0 ? 'even' : 'odd',
      );

      expect(grouped.get('odd')?.length).toBe(3);
      expect(grouped.get('even')?.length).toBe(2);
    });
  });

  describe('count', () => {
    it('should count all entries', () => {
      expect(aggregate.count(numberMap)).toBe(5);
    });

    it('should count entries matching predicate', () => {
      expect(aggregate.count(numberMap, (val) => val > 2)).toBe(3);
    });

    it('should return 0 for empty iterable', () => {
      expect(aggregate.count(new Map())).toBe(0);
    });

    it('should pass key and index to predicate', () => {
      const count = aggregate.count(
        numberMap,
        (val, key, index) => key === 'c' || index === 4,
      );
      expect(count).toBe(2);
    });
  });

  describe('isEmpty', () => {
    it('should return true for empty iterable', () => {
      expect(aggregate.isEmpty(new Map())).toBe(true);
      expect(aggregate.isEmpty([])).toBe(true);
      expect(aggregate.isEmpty(new Set())).toBe(true);
    });

    it('should return false for non-empty iterable', () => {
      expect(aggregate.isEmpty(numberMap)).toBe(false);
      expect(aggregate.isEmpty([1])).toBe(false);
      expect(aggregate.isEmpty(new Set([1]))).toBe(false);
    });
  });

  describe('first', () => {
    it('should return first entry', () => {
      expect(aggregate.first(numberMap)).toEqual(['a', 1]);
    });

    it('should return undefined for empty iterable', () => {
      expect(aggregate.first(new Map())).toBeUndefined();
    });
  });

  describe('last', () => {
    it('should return last entry', () => {
      expect(aggregate.last(numberMap)).toEqual(['e', 5]);
    });

    it('should return undefined for empty iterable', () => {
      expect(aggregate.last(new Map())).toBeUndefined();
    });

    it('should work with arrays', () => {
      expect(
        aggregate.last([
          [1, 'a'],
          [2, 'b'],
          [3, 'c'],
        ]),
      ).toEqual([3, 'c']);
    });
  });
});
