import { describe, expect, it } from 'vitest';
import { MultiMap } from './MultiMap';

describe('MultiMap Extended Tests', () => {
  describe('Basic operations', () => {
    it('should create MultiMap with default options', () => {
      const multimap = new MultiMap<string, number>();

      multimap.add('a', 1);
      multimap.add('a', 2);
      multimap.add('a', 3);

      expect(multimap.size).toBe(1); // One key
      expect(multimap.totalValues).toBe(3); // Three values
      expect(multimap.getAll('a')).toEqual([1, 2, 3]);
    });

    it('should create MultiMap without duplicates when configured', () => {
      const multimap = new MultiMap<string, number>(undefined, {
        allowDuplicates: false,
      });

      multimap.add('a', 1);
      multimap.add('a', 1); // Duplicate
      multimap.add('a', 2);

      expect(multimap.totalValues).toBe(2);
      expect(multimap.getAll('a')).toEqual(expect.arrayContaining([1, 2]));
    });

    it('should handle initial entries correctly', () => {
      const entries: Array<[string, number | number[]]> = [
        ['a', 1],
        ['b', [2, 3, 4]],
        ['c', 5],
      ];

      const multimap = new MultiMap(entries);

      expect(multimap.size).toBe(3);
      expect(multimap.totalValues).toBe(5);
      expect(multimap.getAll('b')).toEqual([2, 3, 4]);
    });

    it('should use custom collection factory', () => {
      const multimap = new MultiMap<string, number>(undefined, {
        collectionFactory: () => new Set(),
      });

      multimap.add('a', 1);
      multimap.add('a', 1); // Should not duplicate in Set
      multimap.add('a', 2);

      expect(multimap.totalValues).toBe(2);
      const values = multimap.getAll('a');
      expect(values).toHaveLength(2);
      expect(values).toContain(1);
      expect(values).toContain(2);
    });
  });

  describe('Batch operations', () => {
    it('should handle setMany and keep totalValues accurate', () => {
      const multimap = new MultiMap<string, number>();

      multimap.setMany([
        ['a', [1, 2, 3]],
        ['b', 4],
      ]);

      expect(multimap.size).toBe(2);
      expect(multimap.totalValues).toBe(4);
      expect(multimap.getAll('a')).toEqual([1, 2, 3]);
      expect(multimap.getAll('b')).toEqual([4]);
    });

    it('should normalize setMany when duplicates are disallowed', () => {
      const multimap = new MultiMap<string, number>(undefined, {
        allowDuplicates: false,
      });

      multimap.setMany([
        ['a', [1, 1, 2]],
        ['b', [2, 2]],
      ]);

      expect(multimap.totalValues).toBe(3);
      expect(multimap.getAll('a')).toEqual(expect.arrayContaining([1, 2]));
      expect(multimap.getAll('b')).toEqual([2]);
    });

    it('should keep totals accurate after update and mergeInPlace', () => {
      const multimap = new MultiMap<string, number>();
      multimap.add('a', 1);
      multimap.add('a', 2);
      multimap.add('b', 3);

      multimap.update('a', () => new Set([9]));

      expect(multimap.totalValues).toBe(2);
      expect(multimap.getAll('a')).toEqual([9]);

      const other = new MultiMap<string, number>();
      other.add('a', 10);
      other.add('c', 5);

      multimap.mergeInPlace(other);

      expect(multimap.totalValues).toBe(3);
      expect(multimap.getAll('a')).toEqual([10]);
      expect(multimap.getAll('c')).toEqual([5]);
    });
  });

  describe('Add operations', () => {
    it('should add multiple values to same key', () => {
      const multimap = new MultiMap<string, string>();

      multimap.add('colors', 'red');
      multimap.add('colors', 'green');
      multimap.add('colors', 'blue');

      expect(multimap.countValues('colors')).toBe(3);
      expect(multimap.getAll('colors')).toEqual(['red', 'green', 'blue']);
    });

    it('should handle add to non-existent key', () => {
      const multimap = new MultiMap<string, number>();

      multimap.add('new', 42);

      expect(multimap.has('new')).toBe(true);
      expect(multimap.getFirst('new')).toBe(42);
    });

    it('should not add duplicates when configured', () => {
      const multimap = new MultiMap<string, number>(undefined, {
        allowDuplicates: false,
      });

      multimap.add('key', 1);
      multimap.add('key', 2);
      multimap.add('key', 1); // Duplicate

      const values = multimap.getAll('key');
      expect(values).toHaveLength(2);
      expect(values).toEqual([1, 2]);
    });
  });

  describe('Remove operations', () => {
    it('should remove specific value from key', () => {
      const multimap = new MultiMap<string, number>();

      multimap.add('nums', 1);
      multimap.add('nums', 2);
      multimap.add('nums', 3);

      const removed = multimap.removeValue('nums', 2);

      expect(removed).toBe(true);
      expect(multimap.totalValues).toBe(2);
      expect(multimap.getAll('nums')).toEqual([1, 3]);
    });

    it('should remove key when last value is removed', () => {
      const multimap = new MultiMap<string, number>();

      multimap.add('single', 1);

      const removed = multimap.removeValue('single', 1);

      expect(removed).toBe(true);
      expect(multimap.has('single')).toBe(false);
      expect(multimap.size).toBe(0);
      expect(multimap.totalValues).toBe(0);
    });

    it('should return false when removing non-existent value', () => {
      const multimap = new MultiMap<string, number>();

      multimap.add('key', 1);

      const removed = multimap.removeValue('key', 999);

      expect(removed).toBe(false);
      expect(multimap.totalValues).toBe(1);
    });

    it('should delete all values for a key', () => {
      const multimap = new MultiMap<string, number>();

      multimap.add('key', 1);
      multimap.add('key', 2);
      multimap.add('key', 3);

      const deleted = multimap.delete('key');

      expect(deleted).toBe(true);
      expect(multimap.has('key')).toBe(false);
      expect(multimap.totalValues).toBe(0);
    });

    it('should clear all values', () => {
      const multimap = new MultiMap<string, number>();

      multimap.add('a', 1);
      multimap.add('b', 2);
      multimap.add('c', 3);

      multimap.clear();

      expect(multimap.size).toBe(0);
      expect(multimap.totalValues).toBe(0);
    });
  });

  describe('Access operations', () => {
    it('should get all values for a key', () => {
      const multimap = new MultiMap<string, string>();

      multimap.add('fruits', 'apple');
      multimap.add('fruits', 'banana');
      multimap.add('fruits', 'orange');

      const fruits = multimap.getAll('fruits');

      expect(fruits).toEqual(['apple', 'banana', 'orange']);
      // Should return copy, not reference
      fruits.push('grape');
      expect(multimap.getAll('fruits')).toHaveLength(3);
    });

    it('should get first value for a key', () => {
      const multimap = new MultiMap<string, number>();

      multimap.add('nums', 10);
      multimap.add('nums', 20);
      multimap.add('nums', 30);

      expect(multimap.getFirst('nums')).toBe(10);
    });

    it('should return undefined for non-existent key', () => {
      const multimap = new MultiMap<string, number>();

      expect(multimap.getFirst('missing')).toBeUndefined();
      expect(multimap.getAll('missing')).toEqual([]);
    });

    it('should check if key has specific value', () => {
      const multimap = new MultiMap<string, number>();

      multimap.add('nums', 1);
      multimap.add('nums', 2);

      expect(multimap.hasValue('nums', 1)).toBe(true);
      expect(multimap.hasValue('nums', 3)).toBe(false);
      expect(multimap.hasValue('missing', 1)).toBe(false);
    });

    it('should count values for a key', () => {
      const multimap = new MultiMap<string, string>();

      multimap.add('tags', 'javascript');
      multimap.add('tags', 'typescript');
      multimap.add('tags', 'nodejs');

      expect(multimap.countValues('tags')).toBe(3);
      expect(multimap.countValues('missing')).toBe(0);
    });
  });

  describe('Iteration operations', () => {
    it('should iterate over flattened entries', () => {
      const multimap = new MultiMap<string, number>();

      multimap.add('a', 1);
      multimap.add('a', 2);
      multimap.add('b', 3);

      const entries = Array.from(multimap.entriesFlat());

      expect(entries).toEqual([
        ['a', 1],
        ['a', 2],
        ['b', 3],
      ]);
    });

    it('should iterate over flattened values', () => {
      const multimap = new MultiMap<string, number>();

      multimap.add('x', 10);
      multimap.add('x', 20);
      multimap.add('y', 30);
      multimap.add('y', 40);

      const values = Array.from(multimap.valuesFlat());

      expect(values).toEqual([10, 20, 30, 40]);
      expect(values).toHaveLength(multimap.totalValues);
    });

    it('should iterate over keys and value collections', () => {
      const multimap = new MultiMap<string, string>();

      multimap.add('colors', 'red');
      multimap.add('colors', 'blue');
      multimap.add('shapes', 'circle');

      for (const [key, collection] of multimap) {
        if (key === 'colors') {
          expect(collection).toHaveLength(2);
        } else if (key === 'shapes') {
          expect(collection).toHaveLength(1);
        }
      }
    });
  });

  describe('Group operations', () => {
    it('should group values by classifier', () => {
      const multimap = new MultiMap<string, number>();

      multimap.add('nums', 1);
      multimap.add('nums', 2);
      multimap.add('nums', 3);
      multimap.add('nums', 4);
      multimap.add('nums', 5);
      multimap.add('other', 6);

      const grouped = multimap.groupValuesByClassifier((v) => (v % 2 === 0 ? 'even' : 'odd'));

      expect(grouped.get('odd')).toEqual([1, 3, 5]);
      expect(grouped.get('even')).toEqual([2, 4, 6]);
    });

    it('should handle empty groups', () => {
      const multimap = new MultiMap<string, string>();

      const grouped = multimap.groupValuesByClassifier((v) => v.length);

      expect(grouped.size).toBe(0);
    });
  });

  describe('Clone operation', () => {
    it('should create deep clone', () => {
      const original = new MultiMap<string, number>(undefined, {
        allowDuplicates: false,
      });

      original.add('a', 1);
      original.add('a', 2);
      original.add('b', 3);

      const cloned = original.clone();

      expect(cloned).not.toBe(original);
      expect(cloned.size).toBe(original.size);
      expect(cloned.totalValues).toBe(original.totalValues);
      expect(cloned.getAll('a')).toEqual(original.getAll('a'));

      // Modify clone shouldn't affect original
      cloned.add('c', 4);
      expect(original.has('c')).toBe(false);
      expect(cloned.has('c')).toBe(true);
    });

    it('should preserve options in clone', () => {
      const original = new MultiMap<string, number>(undefined, {
        allowDuplicates: false,
      });

      original.add('a', 1);
      original.add('a', 1); // Should not duplicate

      const cloned = original.clone();
      cloned.add('a', 1); // Should also not duplicate

      expect(cloned.getAll('a')).toHaveLength(1);
    });
  });

  describe('Edge cases', () => {
    it('should handle object values', () => {
      const multimap = new MultiMap<string, { id: number; name: string }>();

      const obj1 = { id: 1, name: 'Alice' };
      const obj2 = { id: 2, name: 'Bob' };

      multimap.add('users', obj1);
      multimap.add('users', obj2);

      expect(multimap.getAll('users')).toEqual([obj1, obj2]);
      expect(multimap.hasValue('users', obj1)).toBe(true);
    });

    it('should handle large number of values', () => {
      const multimap = new MultiMap<string, number>();

      for (let i = 0; i < 1000; i++) {
        multimap.add('large', i);
      }

      expect(multimap.totalValues).toBe(1000);
      expect(multimap.countValues('large')).toBe(1000);
      expect(multimap.getFirst('large')).toBe(0);
    });

    it('should handle mixed collection types', () => {
      // Array-based
      const arrayMultimap = new MultiMap<string, number>(undefined, {
        allowDuplicates: true,
        collectionFactory: () => [],
      });

      arrayMultimap.add('key', 1);
      arrayMultimap.add('key', 1); // Duplicate allowed

      expect(arrayMultimap.getAll('key')).toEqual([1, 1]);

      // Set-based
      const setMultimap = new MultiMap<string, number>(undefined, {
        collectionFactory: () => new Set(),
      });

      setMultimap.add('key', 1);
      setMultimap.add('key', 1); // No duplicate in Set

      expect(setMultimap.getAll('key')).toEqual([1]);
    });
  });

  describe('toString', () => {
    it('should have meaningful string representation', () => {
      const multimap = new MultiMap<string, number>();

      multimap.add('a', 1);
      multimap.add('a', 2);
      multimap.add('b', 3);

      const str = multimap.toString();

      expect(str).toContain('MultiMap');
      expect(str).toContain('2 keys');
      expect(str).toContain('3 values');
    });
  });
});
