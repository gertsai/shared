import { describe, expect, it } from 'vitest';
import { BiMap } from './BiMap';

describe('BiMap Extended Tests', () => {
  describe('Bidirectional consistency', () => {
    it('should maintain bidirectional consistency', () => {
      const bimap = new BiMap<string, number>();

      bimap.set('a', 1);
      bimap.set('b', 2);
      bimap.set('c', 3);

      expect(bimap.isConsistent()).toBe(true);
      expect(bimap.getKey(1)).toBe('a');
      expect(bimap.getKey(2)).toBe('b');
      expect(bimap.getKey(3)).toBe('c');
    });

    it('should handle key conflicts correctly', () => {
      const bimap = new BiMap<string, number>([
        ['a', 1],
        ['b', 2],
      ]);

      // Overwrite existing key with new value
      bimap.set('a', 3);

      expect(bimap.get('a')).toBe(3);
      expect(bimap.getKey(1)).toBeUndefined(); // Old value removed
      expect(bimap.getKey(3)).toBe('a');
      expect(bimap.hasValue(1)).toBe(false);
    });

    it('should handle value conflicts correctly', () => {
      const bimap = new BiMap<string, number>([
        ['a', 1],
        ['b', 2],
      ]);

      // Set new key with existing value
      bimap.set('c', 1);

      expect(bimap.get('c')).toBe(1);
      expect(bimap.get('a')).toBeUndefined(); // Old key removed
      expect(bimap.getKey(1)).toBe('c');
    });

    it('should handle same key-value update', () => {
      const bimap = new BiMap<string, number>([['a', 1]]);

      // Set same key-value pair
      bimap.set('a', 1);

      expect(bimap.size).toBe(1);
      expect(bimap.get('a')).toBe(1);
      expect(bimap.getKey(1)).toBe('a');
    });
  });

  describe('Deletion operations', () => {
    it('should delete by key and maintain consistency', () => {
      const bimap = new BiMap<string, number>([
        ['a', 1],
        ['b', 2],
        ['c', 3],
      ]);

      const deleted = bimap.delete('b');

      expect(deleted).toBe(true);
      expect(bimap.size).toBe(2);
      expect(bimap.get('b')).toBeUndefined();
      expect(bimap.getKey(2)).toBeUndefined();
      expect(bimap.hasValue(2)).toBe(false);
      expect(bimap.isConsistent()).toBe(true);
    });

    it('should delete by value and maintain consistency', () => {
      const bimap = new BiMap<string, number>([
        ['a', 1],
        ['b', 2],
        ['c', 3],
      ]);

      const deleted = bimap.deleteValue(2);

      expect(deleted).toBe(true);
      expect(bimap.size).toBe(2);
      expect(bimap.get('b')).toBeUndefined();
      expect(bimap.getKey(2)).toBeUndefined();
      expect(bimap.isConsistent()).toBe(true);
    });

    it('should return false when deleting non-existent key', () => {
      const bimap = new BiMap<string, number>([['a', 1]]);

      expect(bimap.delete('z')).toBe(false);
      expect(bimap.size).toBe(1);
    });

    it('should return false when deleting non-existent value', () => {
      const bimap = new BiMap<string, number>([['a', 1]]);

      expect(bimap.deleteValue(99)).toBe(false);
      expect(bimap.size).toBe(1);
    });
  });

  describe('Complex operations', () => {
    it('should invert the BiMap correctly', () => {
      const original = new BiMap<string, number>([
        ['a', 1],
        ['b', 2],
        ['c', 3],
      ]);

      const inverted = original.invert();

      expect(inverted.size).toBe(3);
      expect(inverted.get(1)).toBe('a');
      expect(inverted.get(2)).toBe('b');
      expect(inverted.get(3)).toBe('c');
      expect(inverted.getKey('a')).toBe(1);
      expect(inverted.getKey('b')).toBe(2);
      expect(inverted.getKey('c')).toBe(3);
    });

    it('should handle batch operations with setMany', () => {
      const bimap = new BiMap<string, number>();

      bimap.setMany([
        ['a', 1],
        ['b', 2],
        ['c', 3],
        ['a', 4], // Overwrite
      ]);

      expect(bimap.size).toBe(3);
      expect(bimap.get('a')).toBe(4);
      expect(bimap.getKey(1)).toBeUndefined(); // Overwritten
      expect(bimap.getKey(4)).toBe('a');
    });

    it('should handle upsert operations', () => {
      const bimap = new BiMap<string, number>([['a', 1]]);

      bimap.upsert('a', 2); // Update
      expect(bimap.get('a')).toBe(2);
      expect(bimap.getKey(1)).toBeUndefined();

      bimap.upsert('b', 3); // Insert
      expect(bimap.get('b')).toBe(3);
      expect(bimap.size).toBe(2);
    });

    it('should clear all mappings', () => {
      const bimap = new BiMap<string, number>([
        ['a', 1],
        ['b', 2],
      ]);

      bimap.clear();

      expect(bimap.size).toBe(0);
      expect(bimap.get('a')).toBeUndefined();
      expect(bimap.getKey(1)).toBeUndefined();
      expect(bimap.isConsistent()).toBe(true);
    });

    it('should preserve invariants for update/deleteMany/mergeInPlace', () => {
      const bimap = new BiMap<string, number>([
        ['a', 1],
        ['b', 2],
      ]);

      bimap.update('a', () => 3);
      expect(bimap.get('a')).toBe(3);
      expect(bimap.getKey(1)).toBeUndefined();
      expect(bimap.getKey(3)).toBe('a');

      bimap.deleteMany(['b']);
      expect(bimap.get('b')).toBeUndefined();
      expect(bimap.getKey(2)).toBeUndefined();

      const other = new BiMap<string, number>([['c', 4]]);
      bimap.mergeInPlace(other);

      expect(bimap.get('c')).toBe(4);
      expect(bimap.getKey(4)).toBe('c');
      expect(bimap.isConsistent()).toBe(true);
    });
  });

  describe('Edge cases', () => {
    it('should handle object keys and values', () => {
      const key1 = { id: 1 };
      const key2 = { id: 2 };
      const val1 = { name: 'one' };
      const val2 = { name: 'two' };

      const bimap = new BiMap<object, object>();
      bimap.set(key1, val1);
      bimap.set(key2, val2);

      expect(bimap.get(key1)).toBe(val1);
      expect(bimap.getKey(val1)).toBe(key1);
      expect(bimap.size).toBe(2);
    });

    it('should handle NaN and special values', () => {
      const bimap = new BiMap<any, any>();

      bimap.set('nan', NaN);
      bimap.set('null', null);
      bimap.set('undefined', undefined);

      expect(Number.isNaN(bimap.get('nan'))).toBe(true);
      expect(bimap.get('null')).toBe(null);
      expect(bimap.get('undefined')).toBe(undefined);

      // Object.is comparison for NaN
      expect(bimap.getKey(NaN)).toBe('nan');
    });

    it('should maintain uniqueValues correctly', () => {
      const bimap = new BiMap<string, number>([
        ['a', 1],
        ['b', 2],
        ['c', 3],
      ]);

      const unique = bimap.uniqueValues();

      expect(unique).toBeInstanceOf(Set);
      expect(unique.size).toBe(3);
      expect(unique.has(1)).toBe(true);
      expect(unique.has(2)).toBe(true);
      expect(unique.has(3)).toBe(true);
    });
  });

  describe('Clone and toString', () => {
    it('should clone correctly', () => {
      const original = new BiMap<string, number>([
        ['a', 1],
        ['b', 2],
      ]);

      const cloned = original.clone();

      expect(cloned).not.toBe(original);
      expect(cloned.size).toBe(original.size);
      expect(cloned.get('a')).toBe(1);
      expect(cloned.getKey(1)).toBe('a');

      // Modify clone shouldn't affect original
      cloned.set('c', 3);
      expect(original.size).toBe(2);
      expect(cloned.size).toBe(3);
    });

    it('should have correct string representation', () => {
      const bimap = new BiMap<string, number>([
        ['a', 1],
        ['b', 2],
      ]);

      const str = bimap.toString();
      expect(str).toContain('BiMap');
      expect(str).toContain('2');
      expect(str).toContain('<=>');
    });
  });
});
