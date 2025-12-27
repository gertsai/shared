import { describe, expect, it } from 'vitest';
import {
  difference,
  intersection,
  isDisjoint,
  isSubset,
  isSuperset,
  merge,
  setEquals,
  symmetricDifference,
  union,
  unique,
  uniqueBy,
} from './set';

describe('set operations', () => {
  const map1 = new Map([
    ['a', 1],
    ['b', 2],
    ['c', 3],
  ]);

  const map2 = new Map([
    ['b', 4],
    ['c', 3],
    ['d', 5],
  ]);

  const map3 = new Map([
    ['e', 6],
    ['f', 7],
  ]);

  describe('union', () => {
    it('should combine two iterables', () => {
      const result = union(map1, map2);
      expect(result.size).toBe(4);
      expect(result.get('a')).toBe(1);
      expect(result.get('b')).toBe(4); // Value from second map
      expect(result.get('c')).toBe(3);
      expect(result.get('d')).toBe(5);
    });

    it('should prioritize values from second iterable', () => {
      const result = union(map1, map2);
      expect(result.get('b')).toBe(4); // From map2, not map1's value of 2
    });

    it('should handle empty iterables', () => {
      const result1 = union(new Map(), map1);
      expect(result1).toEqual(map1);

      const result2 = union(map1, new Map());
      expect(result2).toEqual(map1);

      const result3 = union(new Map(), new Map());
      expect(result3.size).toBe(0);
    });

    it('should handle disjoint sets', () => {
      const result = union(map1, map3);
      expect(result.size).toBe(5);
      expect(result.has('a')).toBe(true);
      expect(result.has('e')).toBe(true);
    });
  });

  describe('intersection', () => {
    it('should return common entries', () => {
      const result = intersection(map1, map2);
      expect(result.size).toBe(2);
      expect(result.has('b')).toBe(true);
      expect(result.has('c')).toBe(true);
      expect(result.has('a')).toBe(false);
      expect(result.has('d')).toBe(false);
    });

    it('should use values from first iterable', () => {
      const result = intersection(map1, map2);
      expect(result.get('b')).toBe(2); // From map1, not map2's value of 4
    });

    it('should handle empty iterables', () => {
      const result1 = intersection(new Map(), map1);
      expect(result1.size).toBe(0);

      const result2 = intersection(map1, new Map());
      expect(result2.size).toBe(0);
    });

    it('should handle disjoint sets', () => {
      const result = intersection(map1, map3);
      expect(result.size).toBe(0);
    });
  });

  describe('difference', () => {
    it('should return entries in first but not in second', () => {
      const result = difference(map1, map2);
      expect(result.size).toBe(1);
      expect(result.has('a')).toBe(true);
      expect(result.has('b')).toBe(false);
      expect(result.has('c')).toBe(false);
    });

    it('should handle empty iterables', () => {
      const result1 = difference(new Map(), map1);
      expect(result1.size).toBe(0);

      const result2 = difference(map1, new Map());
      expect(result2).toEqual(map1);
    });

    it('should handle disjoint sets', () => {
      const result = difference(map1, map3);
      expect(result).toEqual(map1);
    });

    it('should handle complete overlap', () => {
      const result = difference(map1, map1);
      expect(result.size).toBe(0);
    });
  });

  describe('symmetricDifference', () => {
    it('should return entries in either but not both', () => {
      const result = symmetricDifference(map1, map2);
      expect(result.size).toBe(2);
      expect(result.has('a')).toBe(true);
      expect(result.has('d')).toBe(true);
      expect(result.has('b')).toBe(false); // In both
      expect(result.has('c')).toBe(false); // In both
    });

    it('should handle empty iterables', () => {
      const result1 = symmetricDifference(new Map(), map1);
      expect(result1).toEqual(map1);

      const result2 = symmetricDifference(map1, new Map());
      expect(result2).toEqual(map1);

      const result3 = symmetricDifference(new Map(), new Map());
      expect(result3.size).toBe(0);
    });

    it('should handle disjoint sets', () => {
      const result = symmetricDifference(map1, map3);
      const expected = union(map1, map3);
      expect(result).toEqual(expected);
    });

    it('should handle identical sets', () => {
      const result = symmetricDifference(map1, map1);
      expect(result.size).toBe(0);
    });
  });

  describe('isSubset', () => {
    it('should return true for subset', () => {
      const subset = new Map([
        ['a', 1],
        ['b', 2],
      ]);
      expect(isSubset(subset, map1)).toBe(true);
    });

    it('should return false for non-subset', () => {
      expect(isSubset(map1, map2)).toBe(false);
    });

    it('should return true for empty set', () => {
      expect(isSubset(new Map(), map1)).toBe(true);
    });

    it('should return true for identical sets', () => {
      expect(isSubset(map1, map1)).toBe(true);
    });

    it('should handle larger first set', () => {
      const larger = new Map([...map1, ['x', 10]]);
      expect(isSubset(larger, map1)).toBe(false);
    });
  });

  describe('isSuperset', () => {
    it('should return true for superset', () => {
      const subset = new Map([
        ['a', 1],
        ['b', 2],
      ]);
      expect(isSuperset(map1, subset)).toBe(true);
    });

    it('should return false for non-superset', () => {
      expect(isSuperset(map2, map1)).toBe(false);
    });

    it('should return true when second is empty', () => {
      expect(isSuperset(map1, new Map())).toBe(true);
    });

    it('should return true for identical sets', () => {
      expect(isSuperset(map1, map1)).toBe(true);
    });
  });

  describe('isDisjoint', () => {
    it('should return true for disjoint sets', () => {
      expect(isDisjoint(map1, map3)).toBe(true);
    });

    it('should return false for overlapping sets', () => {
      expect(isDisjoint(map1, map2)).toBe(false);
    });

    it('should return true for empty sets', () => {
      expect(isDisjoint(new Map(), map1)).toBe(true);
      expect(isDisjoint(map1, new Map())).toBe(true);
      expect(isDisjoint(new Map(), new Map())).toBe(true);
    });
  });

  describe('setEquals', () => {
    it('should return true for equal sets', () => {
      const copy = new Map(map1);
      expect(setEquals(map1, copy)).toBe(true);
    });

    it('should return false for different sizes', () => {
      const smaller = new Map([['a', 1]]);
      expect(setEquals(map1, smaller)).toBe(false);
    });

    it('should return false for different keys', () => {
      const different = new Map([
        ['x', 1],
        ['y', 2],
        ['z', 3],
      ]);
      expect(setEquals(map1, different)).toBe(false);
    });

    it('should return true for empty sets', () => {
      expect(setEquals(new Map(), new Map())).toBe(true);
    });
  });

  describe('unique', () => {
    it('should remove duplicate values', () => {
      const mapWithDupes = new Map([
        ['a', 1],
        ['b', 2],
        ['c', 1],
        ['d', 3],
        ['e', 2],
      ]);
      const result = unique(mapWithDupes);

      expect(result.size).toBe(3);
      const values = Array.from(result.values());
      expect(values).toContain(1);
      expect(values).toContain(2);
      expect(values).toContain(3);
    });

    it('should keep first occurrence', () => {
      const mapWithDupes = new Map([
        ['a', 1],
        ['b', 2],
        ['c', 1],
      ]);
      const result = unique(mapWithDupes);

      expect(result.has('a')).toBe(true);
      expect(result.has('c')).toBe(false); // Duplicate removed
    });

    it('should handle no duplicates', () => {
      const result = unique(map1);
      expect(result).toEqual(map1);
    });

    it('should handle empty iterable', () => {
      const result = unique(new Map());
      expect(result.size).toBe(0);
    });
  });

  describe('uniqueBy', () => {
    it('should remove duplicates by selector', () => {
      const users = new Map([
        ['u1', { id: 1, name: 'Alice', group: 'A' }],
        ['u2', { id: 2, name: 'Bob', group: 'B' }],
        ['u3', { id: 3, name: 'Charlie', group: 'A' }],
        ['u4', { id: 4, name: 'David', group: 'B' }],
      ]);

      const result = uniqueBy(users, (user) => user.group);
      expect(result.size).toBe(2);
      expect(result.has('u1')).toBe(true); // First from group A
      expect(result.has('u2')).toBe(true); // First from group B
      expect(result.has('u3')).toBe(false);
      expect(result.has('u4')).toBe(false);
    });

    it('should work with primitive selector', () => {
      const map = new Map([
        ['a', 10],
        ['b', 21],
        ['c', 11],
        ['d', 20],
      ]);

      const result = uniqueBy(map, (v) => v % 10);
      expect(result.size).toBe(2);
      expect(result.has('a')).toBe(true); // First with remainder 0
      expect(result.has('b')).toBe(true); // First with remainder 1
    });

    it('should handle empty iterable', () => {
      const result = uniqueBy(new Map(), (v) => v);
      expect(result.size).toBe(0);
    });
  });

  describe('merge', () => {
    it('should merge multiple iterables left to right', () => {
      const result = merge(map1, map2, map3);
      expect(result.size).toBe(6);
      expect(result.get('a')).toBe(1);
      expect(result.get('b')).toBe(4); // From map2
      expect(result.get('c')).toBe(3);
      expect(result.get('d')).toBe(5);
      expect(result.get('e')).toBe(6);
      expect(result.get('f')).toBe(7);
    });

    it('should handle single iterable', () => {
      const result = merge(map1);
      expect(result).toEqual(map1);
    });

    it('should handle no iterables', () => {
      const result = merge();
      expect(result.size).toBe(0);
    });

    it('should override values from left to right', () => {
      const m1 = new Map([['key', 1]]);
      const m2 = new Map([['key', 2]]);
      const m3 = new Map([['key', 3]]);
      const result = merge(m1, m2, m3);
      expect(result.get('key')).toBe(3);
    });
  });
});
