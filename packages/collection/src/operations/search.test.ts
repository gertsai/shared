import { describe, it, expect } from 'vitest';
import * as search from './search';

describe('search operations', () => {
  const numberMap = new Map([
    ['a', 1],
    ['b', 2],
    ['c', 3],
    ['d', 4],
    ['e', 5],
  ]);

  const objectMap = new Map([
    ['user1', { name: 'Alice', age: 30, active: true }],
    ['user2', { name: 'Bob', age: 25, active: false }],
    ['user3', { name: 'Charlie', age: 35, active: true }],
  ]);

  describe('find', () => {
    it('should find first matching value', () => {
      const result = search.find(numberMap, (value) => value > 2);
      expect(result).toBe(3);
    });

    it('should return undefined when no match', () => {
      const result = search.find(numberMap, (value) => value > 10);
      expect(result).toBeUndefined();
    });

    it('should pass key and index to predicate', () => {
      const result = search.find(
        numberMap,
        (value, key, index) => key === 'c' || index === 1,
      );
      expect(result).toBe(2); // First match is 'b' at index 1
    });

    it('should handle empty iterable', () => {
      const result = search.find(new Map(), () => true);
      expect(result).toBeUndefined();
    });
  });

  describe('findEntry', () => {
    it('should find first matching entry', () => {
      const result = search.findEntry(numberMap, (value) => value > 2);
      expect(result).toEqual(['c', 3]);
    });

    it('should return undefined when no match', () => {
      const result = search.findEntry(numberMap, (value) => value > 10);
      expect(result).toBeUndefined();
    });

    it('should pass key and index to predicate', () => {
      const result = search.findEntry(numberMap, (value, key) => key === 'd');
      expect(result).toEqual(['d', 4]);
    });
  });

  describe('findKey', () => {
    it('should find key of first matching value', () => {
      const result = search.findKey(numberMap, (value) => value === 3);
      expect(result).toBe('c');
    });

    it('should return undefined when no match', () => {
      const result = search.findKey(numberMap, (value) => value > 10);
      expect(result).toBeUndefined();
    });

    it('should work with object values', () => {
      const result = search.findKey(objectMap, (user) => user.age > 30);
      expect(result).toBe('user3');
    });
  });

  describe('findLast', () => {
    it('should find last matching value', () => {
      const result = search.findLast(numberMap, (value) => value < 4);
      expect(result).toBe(3);
    });

    it('should return undefined when no match', () => {
      const result = search.findLast(numberMap, (value) => value > 10);
      expect(result).toBeUndefined();
    });

    it('should handle single match', () => {
      const result = search.findLast(numberMap, (value) => value === 2);
      expect(result).toBe(2);
    });
  });

  describe('findLastKey', () => {
    it('should find key of last matching value', () => {
      const result = search.findLastKey(numberMap, (value) => value < 4);
      expect(result).toBe('c');
    });

    it('should return undefined when no match', () => {
      const result = search.findLastKey(numberMap, (value) => value > 10);
      expect(result).toBeUndefined();
    });
  });

  describe('includes', () => {
    it('should return true when value exists', () => {
      expect(search.includes(numberMap, 3)).toBe(true);
    });

    it('should return false when value does not exist', () => {
      expect(search.includes(numberMap, 10)).toBe(false);
    });

    it('should use strict equality', () => {
      const map = new Map([['a', NaN]]);
      expect(search.includes(map, NaN)).toBe(true);
    });

    it('should handle empty iterable', () => {
      expect(search.includes(new Map(), 1)).toBe(false);
    });

    it('should work with object values', () => {
      const obj = { test: true };
      const map = new Map([['a', obj]]);
      expect(search.includes(map, obj)).toBe(true);
      expect(search.includes(map, { test: true })).toBe(false); // Different object
    });
  });

  describe('some', () => {
    it('should return true when at least one matches', () => {
      const result = search.some(numberMap, (value) => value > 3);
      expect(result).toBe(true);
    });

    it('should return false when none match', () => {
      const result = search.some(numberMap, (value) => value > 10);
      expect(result).toBe(false);
    });

    it('should short-circuit on first match', () => {
      let count = 0;
      const result = search.some(numberMap, (value) => {
        count++;
        return value === 2;
      });
      expect(result).toBe(true);
      expect(count).toBe(2); // Should stop after finding match
    });

    it('should return false for empty iterable', () => {
      const result = search.some(new Map(), () => true);
      expect(result).toBe(false);
    });

    it('should pass key and index to predicate', () => {
      const result = search.some(numberMap, (value, key) => key === 'e');
      expect(result).toBe(true);
    });
  });

  describe('every', () => {
    it('should return true when all match', () => {
      const result = search.every(numberMap, (value) => value > 0);
      expect(result).toBe(true);
    });

    it('should return false when at least one does not match', () => {
      const result = search.every(numberMap, (value) => value < 3);
      expect(result).toBe(false);
    });

    it('should short-circuit on first non-match', () => {
      let count = 0;
      const result = search.every(numberMap, (value) => {
        count++;
        return value < 2;
      });
      expect(result).toBe(false);
      expect(count).toBe(2); // Should stop after finding non-match
    });

    it('should return true for empty iterable', () => {
      const result = search.every(new Map(), () => false);
      expect(result).toBe(true);
    });

    it('should pass key and index to predicate', () => {
      const result = search.every(
        numberMap,
        (value, key, index) =>
          typeof key === 'string' && typeof index === 'number',
      );
      expect(result).toBe(true);
    });
  });
});
