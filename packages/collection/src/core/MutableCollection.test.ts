import { beforeEach, describe, expect, it } from 'vitest';
import { MutableCollection } from './MutableCollection';

describe('MutableCollection', () => {
  let collection: MutableCollection<string, number>;

  beforeEach(() => {
    collection = new MutableCollection([
      ['a', 1],
      ['b', 2],
      ['c', 3],
    ]);
  });

  describe('Basic operations', () => {
    it('should create collection from entries', () => {
      expect(collection.size).toBe(3);
      expect(collection.get('a')).toBe(1);
      expect(collection.get('b')).toBe(2);
      expect(collection.get('c')).toBe(3);
    });

    it('should set and get values', () => {
      collection.set('d', 4);
      expect(collection.get('d')).toBe(4);
      expect(collection.size).toBe(4);

      collection.set('a', 10);
      expect(collection.get('a')).toBe(10);
      expect(collection.size).toBe(4);
    });

    it('should delete values', () => {
      expect(collection.delete('b')).toBe(true);
      expect(collection.get('b')).toBeUndefined();
      expect(collection.size).toBe(2);

      expect(collection.delete('z')).toBe(false);
      expect(collection.size).toBe(2);
    });

    it('should clear all values', () => {
      collection.clear();
      expect(collection.size).toBe(0);
      expect(collection.get('a')).toBeUndefined();
    });

    it('should check if key exists', () => {
      expect(collection.has('a')).toBe(true);
      expect(collection.has('z')).toBe(false);
    });

    it('should support method chaining', () => {
      const result = collection.set('d', 4).set('e', 5);

      expect(result).toBe(collection); // set returns the collection
      expect(collection.size).toBe(5);

      // delete returns boolean
      const deleteResult = collection.delete('a');
      expect(deleteResult).toBe(true);
      expect(collection.size).toBe(4);
    });
  });

  describe('Update operations', () => {
    it('should update values with updater function', () => {
      collection.update('a', (val) => (val ?? 0) + 10);
      expect(collection.get('a')).toBe(11);

      collection.update('z', (val) => (val ?? 0) + 100);
      expect(collection.get('z')).toBe(100);
    });

    it('should compact null and undefined values', () => {
      collection.set('d', null as any);
      collection.set('e', undefined as any);
      collection.set('f', 0);

      collection.compact();

      expect(collection.has('d')).toBe(false);
      expect(collection.has('e')).toBe(false);
      expect(collection.has('f')).toBe(true);
      expect(collection.get('f')).toBe(0);
    });
  });

  describe('Set operations', () => {
    it('should perform union', () => {
      const other = new MutableCollection([
        ['c', 30],
        ['d', 4],
      ]);

      const result = collection.union(other);

      expect(result.size).toBe(4);
      expect(result.get('a')).toBe(1);
      expect(result.get('c')).toBe(30); // From other
      expect(result.get('d')).toBe(4);
    });

    it('should perform intersection', () => {
      const other = new MutableCollection([
        ['b', 20],
        ['c', 30],
        ['d', 4],
      ]);

      const result = collection.intersection(other);

      expect(result.size).toBe(2);
      expect(result.has('a')).toBe(false);
      expect(result.get('b')).toBe(2);
      expect(result.get('c')).toBe(3);
      expect(result.has('d')).toBe(false);
    });

    it('should perform difference', () => {
      const other = new MutableCollection([
        ['b', 20],
        ['d', 4],
      ]);

      const result = collection.difference(other);

      expect(result.size).toBe(2);
      expect(result.get('a')).toBe(1);
      expect(result.has('b')).toBe(false);
      expect(result.get('c')).toBe(3);
    });

    it('should perform symmetric difference', () => {
      const other = new MutableCollection([
        ['b', 20],
        ['d', 4],
      ]);

      const result = collection.symmetricDifference(other);

      expect(result.size).toBe(3);
      expect(result.get('a')).toBe(1);
      expect(result.has('b')).toBe(false);
      expect(result.get('c')).toBe(3);
      expect(result.get('d')).toBe(4);
    });
  });

  describe('Transform operations', () => {
    it('should filter entries', () => {
      const result = collection.filter((value) => value > 1);

      expect(result.size).toBe(2);
      expect(result.has('a')).toBe(false);
      expect(result.get('b')).toBe(2);
      expect(result.get('c')).toBe(3);
    });

    it('should map values', () => {
      const result = collection.mapValues((value) => value * 2);

      expect(result.size).toBe(3);
      expect(result.get('a')).toBe(2);
      expect(result.get('b')).toBe(4);
      expect(result.get('c')).toBe(6);
    });

    it('should map keys', () => {
      const result = collection.mapKeys((key) => key.toUpperCase());

      expect(result.size).toBe(3);
      expect(result.get('A')).toBe(1);
      expect(result.get('B')).toBe(2);
      expect(result.get('C')).toBe(3);
    });

    it('mapEntriesCollection should map keys and values into a new collection', () => {
      const base = new MutableCollection<string, number>([
        ['x', 1],
        ['y', 2],
      ]);
      const mapped = (base as any).mapEntriesCollection(
        (k: string, v: number) => [k.toUpperCase(), v * 10],
      );
      expect(mapped.get('X')).toBe(10);
      expect(mapped.get('Y')).toBe(20);
      expect(mapped.size).toBe(2);
      // original unchanged by new collection
      expect(base.get('x')).toBe(1);
      expect(base.get('y')).toBe(2);
    });
  });

  describe('Sort operations', () => {
    it('should sort in place', () => {
      const unsorted = new MutableCollection([
        ['c', 3],
        ['a', 1],
        ['b', 2],
      ]);

      unsorted.sort();
      const entries = Array.from(unsorted.entries());

      expect(entries[0]).toEqual(['a', 1]);
      expect(entries[1]).toEqual(['b', 2]);
      expect(entries[2]).toEqual(['c', 3]);
    });

    it('should sort by value in place', () => {
      const unsorted = new MutableCollection([
        ['x', 3],
        ['y', 1],
        ['z', 2],
      ]);

      unsorted.sortByValue();
      const entries = Array.from(unsorted.entries());

      expect(entries[0]).toEqual(['y', 1]);
      expect(entries[1]).toEqual(['z', 2]);
      expect(entries[2]).toEqual(['x', 3]);
    });

    it('should reverse in place', () => {
      collection.reverse();
      const entries = Array.from(collection.entries());

      expect(entries[0]).toEqual(['c', 3]);
      expect(entries[1]).toEqual(['b', 2]);
      expect(entries[2]).toEqual(['a', 1]);
    });

    it('should create sorted copy with toSorted', () => {
      const unsorted = new MutableCollection([
        ['x', 3],
        ['y', 1],
        ['z', 2],
      ]);

      const sorted = unsorted.toSorted((a, b) => a - b);

      expect(sorted).not.toBe(unsorted);
      expect(Array.from(sorted.values())).toEqual([1, 2, 3]);
      expect(Array.from(unsorted.values())).toEqual([3, 1, 2]); // Original unchanged
    });
  });

  describe('Merge operations', () => {
    it('should merge collections', () => {
      const other1 = new MutableCollection([['d', 4]]);
      const other2 = new MutableCollection([
        ['a', 10],
        ['e', 5],
      ]);

      const result = collection.merge(other1, other2);

      expect(result).not.toBe(collection);
      expect(result.size).toBe(5);
      expect(result.get('a')).toBe(10); // Overridden
      expect(result.get('d')).toBe(4);
      expect(result.get('e')).toBe(5);
    });

    it('should merge in place', () => {
      const other = new MutableCollection([
        ['a', 10],
        ['d', 4],
      ]);

      collection.mergeInPlace(other);

      expect(collection.size).toBe(4);
      expect(collection.get('a')).toBe(10);
      expect(collection.get('d')).toBe(4);
    });

    // Note: mergeWith and mergeWithKeep methods were removed during refactoring
    // These can be implemented using merge with custom logic if needed
  });

  describe('Static factory methods', () => {
    it('should create from entries', () => {
      const coll = MutableCollection.from([
        ['x', 1],
        ['y', 2],
      ]);

      expect(coll.size).toBe(2);
      expect(coll.get('x')).toBe(1);
    });

    it('should create from individual entries', () => {
      const coll = MutableCollection.of(['x', 1], ['y', 2]);

      expect(coll.size).toBe(2);
      expect(coll.get('y')).toBe(2);
    });

    it('should create empty collection', () => {
      const coll = MutableCollection.empty<string, number>();

      expect(coll.size).toBe(0);
    });

    it('should group values', () => {
      const values = [1, 2, 3, 4, 5];
      const grouped = MutableCollection.groupBy(values, (n) =>
        n % 2 === 0 ? 'even' : 'odd',
      );

      expect(grouped.get('odd')).toEqual([1, 3, 5]);
      expect(grouped.get('even')).toEqual([2, 4]);
    });

    it('should combine entries with duplicate keys', () => {
      const entries: Array<[string, number]> = [
        ['a', 1],
        ['b', 2],
        ['a', 3],
        ['b', 4],
      ];

      const combined = MutableCollection.combineEntries(
        entries,
        (first, second) => first + second,
      );

      expect(combined.get('a')).toBe(4); // 1 + 3
      expect(combined.get('b')).toBe(6); // 2 + 4
    });
  });

  describe('Clone operation', () => {
    it('should create a shallow copy', () => {
      const clone = collection.clone();

      expect(clone).not.toBe(collection);
      expect(clone.size).toBe(collection.size);
      expect(clone.get('a')).toBe(1);

      clone.set('a', 100);
      expect(collection.get('a')).toBe(1); // Original unchanged
    });
  });

  describe('Iteration', () => {
    it('should iterate over entries', () => {
      const entries: Array<[string, number]> = [];

      for (const entry of collection) {
        entries.push(entry);
      }

      expect(entries).toEqual([
        ['a', 1],
        ['b', 2],
        ['c', 3],
      ]);
    });

    it('should provide keys iterator', () => {
      const keys = Array.from(collection.keys());
      expect(keys).toEqual(['a', 'b', 'c']);
    });

    it('should provide values iterator', () => {
      const values = Array.from(collection.values());
      expect(values).toEqual([1, 2, 3]);
    });

    it('should provide entries iterator', () => {
      const entries = Array.from(collection.entries());
      expect(entries).toEqual([
        ['a', 1],
        ['b', 2],
        ['c', 3],
      ]);
    });
  });

  describe('Batch operations', () => {
    it('should set many entries at once', () => {
      const entries: Array<[string, number]> = [
        ['d', 4],
        ['e', 5],
        ['f', 6],
      ];

      const result = collection.setMany(entries);

      expect(result).toBe(collection); // Returns same instance
      expect(collection.size).toBe(6);
      expect(collection.get('d')).toBe(4);
      expect(collection.get('e')).toBe(5);
      expect(collection.get('f')).toBe(6);
    });

    it('should delete many keys at once', () => {
      const result = collection.deleteMany(['a', 'c', 'z']);

      expect(result).toBe(collection); // Returns same instance
      expect(collection.size).toBe(1);
      expect(collection.has('a')).toBe(false);
      expect(collection.has('b')).toBe(true);
      expect(collection.has('c')).toBe(false);
    });

    it('should retain only matching entries', () => {
      const result = collection.retain((value) => value >= 2);

      expect(result).toBe(collection); // Returns same instance
      expect(collection.size).toBe(2);
      expect(collection.has('a')).toBe(false);
      expect(collection.has('b')).toBe(true);
      expect(collection.has('c')).toBe(true);
    });
  });

  describe('First and Last operations', () => {
    it('should get first value', () => {
      expect(collection.first()).toBe(1);

      const empty = new MutableCollection<string, number>();
      expect(empty.first()).toBeUndefined();
    });

    it('should get first N values', () => {
      expect(collection.first(2)).toEqual([1, 2]);
      expect(collection.first(5)).toEqual([1, 2, 3]); // More than size
      expect(collection.first(0)).toEqual([]);
      expect(collection.first(-2)).toEqual([2, 3]); // Negative means last
    });

    it('should get last value', () => {
      expect(collection.last()).toBe(3);

      const empty = new MutableCollection<string, number>();
      expect(empty.last()).toBeUndefined();
    });

    it('should get last N values', () => {
      expect(collection.last(2)).toEqual([2, 3]);
      expect(collection.last(5)).toEqual([1, 2, 3]); // More than size
      expect(collection.last(0)).toEqual([]);
      expect(collection.last(-2)).toEqual([1, 2]); // Negative means first
    });

    it('should get first key', () => {
      expect(collection.firstKey()).toBe('a');

      const empty = new MutableCollection<string, number>();
      expect(empty.firstKey()).toBeUndefined();
    });

    it('should get first N keys', () => {
      expect(collection.firstKey(2)).toEqual(['a', 'b']);
      expect(collection.firstKey(5)).toEqual(['a', 'b', 'c']);
      expect(collection.firstKey(0)).toEqual([]);
      expect(collection.firstKey(-2)).toEqual(['b', 'c']);
    });

    it('should get last key', () => {
      expect(collection.lastKey()).toBe('c');

      const empty = new MutableCollection<string, number>();
      expect(empty.lastKey()).toBeUndefined();
    });

    it('should get last N keys', () => {
      expect(collection.lastKey(2)).toEqual(['b', 'c']);
      expect(collection.lastKey(5)).toEqual(['a', 'b', 'c']);
      expect(collection.lastKey(0)).toEqual([]);
      expect(collection.lastKey(-2)).toEqual(['a', 'b']);
    });
  });

  describe('Positional access', () => {
    it('should get value by position using array conversion', () => {
      const values = collection.toArray();
      expect(values[0][1]).toBe(1);
      expect(values[1][1]).toBe(2);
      expect(values[2][1]).toBe(3);
    });

    it('should get key by position using array conversion', () => {
      const keys = Array.from(collection.keys());
      expect(keys[0]).toBe('a');
      expect(keys[1]).toBe('b');
      expect(keys[2]).toBe('c');
    });
  });

  describe('Ensure operation', () => {
    it('should ensure value exists', () => {
      const existingValue = collection.ensure('a', () => 100);
      expect(existingValue).toBe(1); // Returns existing

      const newValue = collection.ensure('d', (key) => key.charCodeAt(0));
      expect(newValue).toBe(100); // 'd'.charCodeAt(0) = 100
      expect(collection.get('d')).toBe(100);
    });

    it('should ensure with collection context', () => {
      const value = collection.ensure('e', (key, col) => {
        expect(col).toBe(collection);
        return col.size + 1;
      });

      expect(value).toBe(4); // size was 3, so 3 + 1
      expect(collection.get('e')).toBe(4);
    });
  });

  describe('Random selection using array conversion', () => {
    it('should simulate random selection', () => {
      const values = Array.from(collection.values());
      const randomIndex = Math.floor(Math.random() * values.length);
      const randomValue = values[randomIndex];

      expect([1, 2, 3]).toContain(randomValue);
    });

    it('should simulate random key selection', () => {
      const keys = Array.from(collection.keys());
      const randomIndex = Math.floor(Math.random() * keys.length);
      const randomKey = keys[randomIndex];

      expect(['a', 'b', 'c']).toContain(randomKey);
    });
  });

  describe('Complex transformations', () => {
    it('should handle deletion with predicate using retain', () => {
      collection.set('d', 4);
      collection.set('e', 5);

      // Use retain to keep only values <= 3 (opposite of sweep)
      const result = collection.retain((v) => v <= 3);

      expect(result).toBe(collection); // Returns same instance
      expect(collection.size).toBe(3);
      expect(collection.has('d')).toBe(false);
      expect(collection.has('e')).toBe(false);
    });

    it('should handle mergeInPlace operation', () => {
      const other = new MutableCollection([
        ['b', 20],
        ['d', 4],
      ]);

      const result = collection.mergeInPlace(other);

      expect(result).toBe(collection); // Returns same instance
      expect(collection.get('b')).toBe(20); // Overwritten
      expect(collection.get('d')).toBe(4); // New key
      expect(collection.size).toBe(4);
    });
  });
});
