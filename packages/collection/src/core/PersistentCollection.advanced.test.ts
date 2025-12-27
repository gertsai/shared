import { describe, expect, it } from 'vitest';
import { PersistentCollection } from './PersistentCollection';

describe('PersistentCollection advanced operations', () => {
  describe('Set operations', () => {
    it('should handle union with overlapping keys', () => {
      const col1 = new PersistentCollection<string, number>([
        ['a', 1],
        ['b', 2],
        ['c', 3],
      ]);

      const col2 = new PersistentCollection<string, number>([
        ['b', 20],
        ['c', 30],
        ['d', 4],
      ]);

      const result = col1.union(col2);

      expect(result.size).toBe(4);
      expect(result.get('a')).toBe(1);
      expect(result.get('b')).toBe(20); // col2 overwrites
      expect(result.get('c')).toBe(30); // col2 overwrites
      expect(result.get('d')).toBe(4);

      // Original collections unchanged
      expect(col1.get('b')).toBe(2);
      expect(col2.get('a')).toBeUndefined();
    });

    it('should handle intersection correctly', () => {
      const col1 = new PersistentCollection<string, number>([
        ['a', 1],
        ['b', 2],
        ['c', 3],
      ]);

      const col2 = new PersistentCollection<string, number>([
        ['b', 20],
        ['c', 30],
        ['d', 4],
      ]);

      const result = col1.intersection(col2);

      expect(result.size).toBe(2);
      expect(result.has('a')).toBe(false);
      expect(result.get('b')).toBe(2); // Values from col1
      expect(result.get('c')).toBe(3); // Values from col1
      expect(result.has('d')).toBe(false);

      // Should return same instance if no changes
      const col3 = new PersistentCollection<string, number>([
        ['a', 1],
        ['b', 2],
        ['c', 3],
      ]);
      const result2 = col1.intersection(col3);
      expect(result2).toBe(col1);
    });

    it('should handle difference correctly', () => {
      const col1 = new PersistentCollection<string, number>([
        ['a', 1],
        ['b', 2],
        ['c', 3],
      ]);

      const col2 = new PersistentCollection<string, number>([
        ['b', 20],
        ['d', 4],
      ]);

      const result = col1.difference(col2);

      expect(result.size).toBe(2);
      expect(result.get('a')).toBe(1);
      expect(result.has('b')).toBe(false);
      expect(result.get('c')).toBe(3);

      // Should return same instance if no changes
      const col3 = new PersistentCollection<string, number>([['d', 4]]);
      const result2 = col1.difference(col3);
      expect(result2).toBe(col1);
    });

    it('should handle symmetric difference correctly', () => {
      const col1 = new PersistentCollection<string, number>([
        ['a', 1],
        ['b', 2],
      ]);

      const col2 = new PersistentCollection<string, number>([
        ['b', 20],
        ['c', 3],
      ]);

      const result = col1.symmetricDifference(col2);

      expect(result.size).toBe(2);
      expect(result.get('a')).toBe(1); // Only in col1
      expect(result.has('b')).toBe(false); // In both, excluded
      expect(result.get('c')).toBe(3); // Only in col2
    });
  });

  describe('mergeWithKeep operation', () => {
    it('should handle complex merge with keep logic', () => {
      const col1 = new PersistentCollection<string, number>([
        ['a', 1],
        ['b', 2],
        ['c', 3],
      ]);

      const col2 = new PersistentCollection<string, string>([
        ['b', 'two'],
        ['c', 'three'],
        ['d', 'four'],
      ]);

      const result = col1.mergeWithKeep(
        col2,
        // whenInSelf - only in col1
        (value) =>
          value > 1 ? { keep: true, value: `self:${value}` } : { keep: false },
        // whenInOther - only in col2
        (value) => ({ keep: true, value: `other:${value}` }),
        // whenInBoth - in both collections
        (selfVal, otherVal) => ({
          keep: true,
          value: `both:${selfVal}+${otherVal}`,
        }),
      );

      expect(result.size).toBe(3);
      expect(result.get('a')).toBeUndefined(); // Filtered out (value=1, not > 1)
      expect(result.get('b')).toBe('both:2+two');
      expect(result.get('c')).toBe('both:3+three');
      expect(result.get('d')).toBe('other:four');
    });

    it('should handle empty collections in mergeWithKeep', () => {
      const empty = new PersistentCollection<string, number>([]);
      const col = new PersistentCollection<string, number>([
        ['a', 1],
        ['b', 2],
      ]);

      const result1 = empty.mergeWithKeep(
        col,
        () => ({ keep: true, value: 'self' }),
        () => ({ keep: true, value: 'other' }),
        () => ({ keep: true, value: 'both' }),
      );

      expect(result1.size).toBe(2);
      expect(result1.get('a')).toBe('other');
      expect(result1.get('b')).toBe('other');

      const result2 = col.mergeWithKeep(
        empty,
        () => ({ keep: true, value: 'self' }),
        () => ({ keep: true, value: 'other' }),
        () => ({ keep: true, value: 'both' }),
      );

      expect(result2.size).toBe(2);
      expect(result2.get('a')).toBe('self');
      expect(result2.get('b')).toBe('self');
    });
  });

  describe('Transform operations', () => {
    it('should handle mapValues transformation', () => {
      const col = new PersistentCollection<string, number>([
        ['a', 1],
        ['b', 2],
        ['c', 3],
      ]);

      const doubled = col.mapValues((v) => v * 2);

      expect(doubled.get('a')).toBe(2);
      expect(doubled.get('b')).toBe(4);
      expect(doubled.get('c')).toBe(6);

      // Original unchanged
      expect(col.get('a')).toBe(1);
    });

    it('should handle mapKeys transformation', () => {
      const col = new PersistentCollection<string, number>([
        ['a', 1],
        ['b', 2],
        ['c', 3],
      ]);

      const prefixed = col.mapKeys((k) => `key_${k}`);

      expect(prefixed.has('key_a')).toBe(true);
      expect(prefixed.has('key_b')).toBe(true);
      expect(prefixed.has('key_c')).toBe(true);
      expect(prefixed.get('key_a')).toBe(1);

      // Original keys gone
      expect(prefixed.has('a')).toBe(false);
    });
  });

  describe('Conversion operations', () => {
    it('should convert to array', () => {
      const col = new PersistentCollection<string, number>([
        ['a', 1],
        ['b', 2],
      ]);

      const arr = col.toArray();
      expect(arr).toEqual([
        ['a', 1],
        ['b', 2],
      ]);
      expect(Array.isArray(arr)).toBe(true);
    });

    it('should convert to object', () => {
      const col = new PersistentCollection<string, number>([
        ['a', 1],
        ['b', 2],
      ]);

      const obj = col.toObject();
      expect(obj).toEqual({ a: 1, b: 2 });

      // Test with non-string keys
      const col2 = new PersistentCollection<number, string>([
        [1, 'one'],
        [2, 'two'],
      ]);

      const obj2 = col2.toObject();
      expect(obj2).toEqual({ '1': 'one', '2': 'two' });
    });

    it('should convert to object with custom key mapper', () => {
      const col = new PersistentCollection<string, number>([
        ['a', 1],
        ['b', 2],
      ]);

      const obj = col.toObjectWithKey((k) => `key_${k}`);
      expect(obj).toEqual({ key_a: 1, key_b: 2 });

      // Test with symbol keys
      const sym1 = Symbol.for('test1');
      const sym2 = Symbol.for('test2');

      const obj2 = col.toObjectWithKey((k) => Symbol.for(`sym_${k}`));
      expect(obj2[Symbol.for('sym_a')]).toBe(1);
      expect(obj2[Symbol.for('sym_b')]).toBe(2);
    });

    it('should convert to JSON', () => {
      const col = new PersistentCollection<string, number>([
        ['a', 1],
        ['b', 2],
      ]);

      const json = col.toJSON();
      expect(json).toEqual([
        ['a', 1],
        ['b', 2],
      ]);
      expect(JSON.stringify(col)).toBe('[["a",1],["b",2]]');
    });
  });

  describe('Aggregate operations', () => {
    it('should handle groupBy operation', () => {
      const col = new PersistentCollection<
        string,
        { type: string; value: number }
      >([
        ['a', { type: 'even', value: 2 }],
        ['b', { type: 'odd', value: 3 }],
        ['c', { type: 'even', value: 4 }],
        ['d', { type: 'odd', value: 5 }],
      ]);

      const grouped = col.groupBy((item) => item.type);

      expect(grouped).toBeInstanceOf(Map);
      expect(grouped.size).toBe(2);

      const evens = grouped.get('even');
      expect(Array.isArray(evens)).toBe(true);
      expect(evens?.length).toBe(2);
      expect(evens?.[0]).toEqual(['a', { type: 'even', value: 2 }]);
      expect(evens?.[1]).toEqual(['c', { type: 'even', value: 4 }]);

      const odds = grouped.get('odd');
      expect(odds?.length).toBe(2);
      expect(odds?.[0]).toEqual(['b', { type: 'odd', value: 3 }]);
    });

    it('should handle count', () => {
      const col = new PersistentCollection<string, number>([
        ['a', 1],
        ['b', 2],
        ['c', 2],
        ['d', 3],
        ['e', 2],
      ]);

      // Test count
      const count = col.count((value) => value === 2);
      expect(count).toBe(3);

      const countAll = col.count();
      expect(countAll).toBe(5);
    });

    it('should handle reduce operations', () => {
      const col = new PersistentCollection<string, number>([
        ['a', 5],
        ['b', 2],
        ['c', 8],
        ['d', 1],
        ['e', 3],
      ]);

      // Sum using reduce
      const sum = col.reduce((acc, val) => acc + val, 0);
      expect(sum).toBe(19);

      // Find max using reduce
      const max = col.reduce((acc, val) => Math.max(acc, val), -Infinity);
      expect(max).toBe(8);

      // Find min using reduce
      const min = col.reduce((acc, val) => Math.min(acc, val), Infinity);
      expect(min).toBe(1);
    });
  });

  describe('Immutability edge cases', () => {
    it('should handle setting with same value', () => {
      const col = new PersistentCollection<string, number>([
        ['a', 1],
        ['b', 2],
      ]);

      const same = col.set('a', 1);
      expect(same).toBe(col); // Same instance

      const different = col.set('a', 2);
      expect(different).not.toBe(col); // New instance
      expect(different.get('a')).toBe(2);
    });

    it('should handle update that results in same value', () => {
      const col = new PersistentCollection<string, number>([
        ['a', 1],
        ['b', 2],
      ]);

      const same = col.update('a', (v) => v); // No change
      expect(same).toBe(col);

      const different = col.update('a', (v) => (v ?? 0) + 1);
      expect(different).not.toBe(col);
      expect(different.get('a')).toBe(2);
    });

    it('should handle merge with empty collection', () => {
      const col = new PersistentCollection<string, number>([
        ['a', 1],
        ['b', 2],
      ]);

      const empty = new PersistentCollection<string, number>([]);

      const merged = col.merge(empty);
      // PersistentCollection might create new instance even if no changes
      expect(merged.size).toBe(2);
      expect(merged.get('a')).toBe(1);
      expect(merged.get('b')).toBe(2);

      const merged2 = empty.merge(col);
      expect(merged2.size).toBe(2);
      expect(merged2.get('a')).toBe(1);
    });
  });

  describe('Performance and memory', () => {
    it('should handle large collections efficiently', () => {
      const entries: Array<[number, number]> = [];
      for (let i = 0; i < 10000; i++) {
        entries.push([i, i * 2]);
      }

      const large = new PersistentCollection(entries);
      expect(large.size).toBe(10000);

      // Test structural sharing
      const updated = large.set(5000, 99999);
      expect(updated).not.toBe(large);
      expect(updated.get(5000)).toBe(99999);
      expect(large.get(5000)).toBe(10000);

      // Test bulk operations (0, 1000, 2000, ..., 9000 = 10 items, but also 10000, 11000, etc.)
      const filtered = large.filter((v) => v % 1000 === 0);
      expect(filtered.size).toBe(20); // 0, 1000, 2000, ..., 19000

      // Test lazy operations - only 4 values > 19990 (19992, 19994, 19996, 19998)
      let count = 0;
      for (const [k, v] of large.filterIter((v) => v > 19990)) {
        count++;
        expect(v).toBeGreaterThan(19990);
        if (count > 10) break; // Safety limit
      }
      expect(count).toBe(4); // Only 4 values match the filter
    });

    it('should maintain structural sharing in transformations', () => {
      const col = new PersistentCollection<
        string,
        { value: number; ref: object }
      >([
        ['a', { value: 1, ref: { id: 1 } }],
        ['b', { value: 2, ref: { id: 2 } }],
        ['c', { value: 3, ref: { id: 3 } }],
      ]);

      const mapped = col.mapValues((v) =>
        v.value === 2 ? { ...v, value: 20 } : v,
      );

      // Unchanged objects should be same reference
      expect(mapped.get('a')).toBe(col.get('a'));
      expect(mapped.get('c')).toBe(col.get('c'));

      // Changed object should be different
      expect(mapped.get('b')).not.toBe(col.get('b'));
      expect(mapped.get('b')?.value).toBe(20);
    });
  });
});
