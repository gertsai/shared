import { describe, expect, it } from 'vitest';
import { PersistentMap } from './PersistentMap';

describe('PersistentMap advanced HAMT operations', () => {
  describe('Complex collision scenarios', () => {
    it('should handle CollisionNode to CollisionNode merges', () => {
      // Create a custom hash function that forces collisions
      const _forceCollision = (_key: any) => {
        // Force all keys to have same hash for testing
        return 42;
      };

      // We need to test internal collision handling
      // Create multiple objects that will hash to same value
      const keys = Array.from({ length: 10 }, (_, i) => ({
        id: i,
        // Override toString to force hash collision
        toString: () => 'collision',
      }));

      let map = new PersistentMap<any, number>();

      // Add all keys - they should create collision nodes
      keys.forEach((key, i) => {
        map = map.set(key, i);
      });

      expect(map.size).toBe(10);

      // Verify all values are retrievable
      keys.forEach((key, i) => {
        expect(map.get(key)).toBe(i);
      });

      // Delete middle elements to test collision node shrinking
      const map2 = map.delete(keys[5]);
      expect(map2.size).toBe(9);
      expect(map2.get(keys[5])).toBeUndefined();

      // Delete until only one remains - should convert to ValueNode
      let map3 = map2;
      for (let i = 0; i < keys.length; i++) {
        if (i !== 0 && i !== 5) {
          // Skip 0 and already deleted 5
          map3 = map3.delete(keys[i]);
        }
      }
      expect(map3.size).toBe(1);
      expect(map3.get(keys[0])).toBe(0);
    });

    it('should handle deep tree rebalancing with many collisions', () => {
      // Create and store keys to maintain object identity
      const keys: any[][] = [];
      for (let level = 0; level < 5; level++) {
        keys[level] = [];
        for (let branch = 0; branch < 32; branch++) {
          keys[level][branch] = {
            level,
            branch,
            // Custom hash to control tree structure
            toString: () => `L${level}B${branch}`,
          };
        }
      }

      let map = new PersistentMap<any, string>();

      // Add keys at different tree levels
      for (let level = 0; level < 5; level++) {
        for (let branch = 0; branch < 32; branch++) {
          const key = keys[level][branch];
          map = map.set(key, `${level}-${branch}`);
        }
      }

      expect(map.size).toBe(5 * 32);

      // Verify structural integrity
      for (let level = 0; level < 5; level++) {
        for (let branch = 0; branch < 32; branch++) {
          const key = keys[level][branch];
          expect(map.get(key)).toBe(`${level}-${branch}`);
        }
      }

      // Mass deletion to trigger node merging
      for (let branch = 0; branch < 16; branch++) {
        for (let level = 0; level < 5; level++) {
          const key = keys[level][branch];
          map = map.delete(key);
        }
      }

      expect(map.size).toBe(5 * 16);
    });

    it('should handle BranchNode merging during deletions', () => {
      // Create a map with specific structure
      let map = new PersistentMap<number, number>();

      // Add elements that will create branch nodes
      const values = [0, 32, 64, 96, 128, 160, 192, 224];
      values.forEach((v) => {
        map = map.set(v, v * 2);
      });

      expect(map.size).toBe(8);

      // Delete to trigger branch merging
      map = map.delete(32);
      map = map.delete(96);
      map = map.delete(160);
      map = map.delete(224);

      expect(map.size).toBe(4);
      expect(map.get(0)).toBe(0);
      expect(map.get(64)).toBe(128);
      expect(map.get(128)).toBe(256);
      expect(map.get(192)).toBe(384);
    });
  });

  describe('Edge cases with special values', () => {
    it('should handle NaN keys correctly', () => {
      const map = new PersistentMap<number, string>();

      const m1 = map.set(NaN, 'nan1');
      const m2 = m1.set(NaN, 'nan2'); // Should update same key

      expect(m1.size).toBe(1);
      expect(m2.size).toBe(1);
      expect(m2.get(NaN)).toBe('nan2');

      const m3 = m2.set(0 / 0, 'nan3'); // Another NaN
      expect(m3.size).toBe(1);
      expect(m3.get(NaN)).toBe('nan3');
    });

    it('should handle null and undefined distinctly', () => {
      const map = new PersistentMap<any, string>();

      const m1 = map.set(null, 'null');
      const m2 = m1.set(undefined, 'undefined');
      const m3 = m2.set(void 0, 'void0');

      expect(m2.size).toBe(2);
      expect(m3.size).toBe(2); // void 0 is same as undefined

      expect(m3.get(null)).toBe('null');
      expect(m3.get(undefined)).toBe('void0');
    });

    it('should handle symbols as keys', () => {
      const sym1 = Symbol('test');
      const sym2 = Symbol('test'); // Different symbol, same description
      const sym3 = Symbol.for('global');
      const sym4 = Symbol.for('global'); // Same global symbol

      let map = new PersistentMap<symbol, number>();

      map = map.set(sym1, 1);
      map = map.set(sym2, 2);
      map = map.set(sym3, 3);
      map = map.set(sym4, 4); // Should update sym3

      expect(map.size).toBe(3);
      expect(map.get(sym1)).toBe(1);
      expect(map.get(sym2)).toBe(2);
      expect(map.get(sym3)).toBe(4);
      expect(map.get(sym4)).toBe(4);
    });
  });

  describe('Performance and memory efficiency', () => {
    it('should efficiently handle 100k+ elements', () => {
      let map = new PersistentMap<number, number>();

      // Bulk insert
      const count = 100000;
      for (let i = 0; i < count; i++) {
        map = map.set(i, i * 2);
      }

      expect(map.size).toBe(count);

      // Random access
      const samples = [0, 1000, 50000, 99999];
      samples.forEach((i) => {
        expect(map.get(i)).toBe(i * 2);
      });

      // Bulk delete half
      for (let i = 0; i < count / 2; i++) {
        map = map.delete(i * 2); // Delete even numbers
      }

      expect(map.size).toBe(count / 2);

      // Verify remaining
      for (let i = 0; i < count; i++) {
        if (i % 2 === 0) {
          expect(map.has(i)).toBe(false);
        } else {
          expect(map.get(i)).toBe(i * 2);
        }
      }
    });

    it('should maintain structural sharing during updates', () => {
      const base = new PersistentMap<string, { value: number }>();

      // Create base map
      const obj1 = { value: 1 };
      const obj2 = { value: 2 };
      const obj3 = { value: 3 };

      const m1 = base.set('a', obj1).set('b', obj2).set('c', obj3);

      // Update one value
      const obj2Updated = { value: 22 };
      const m2 = m1.set('b', obj2Updated);

      // Verify structural sharing - unchanged objects should be same reference
      expect(m2.get('a')).toBe(obj1);
      expect(m2.get('b')).toBe(obj2Updated);
      expect(m2.get('c')).toBe(obj3);

      // Original map unchanged
      expect(m1.get('b')).toBe(obj2);
    });
  });

  describe('Iterator edge cases', () => {
    it('should handle empty map iterators', () => {
      const empty = new PersistentMap<string, number>();

      expect(Array.from(empty.keys())).toEqual([]);
      expect(Array.from(empty.values())).toEqual([]);
      expect(Array.from(empty.entries())).toEqual([]);

      let count = 0;
      empty.forEach(() => count++);
      expect(count).toBe(0);
    });

    it('should iterate in consistent order', () => {
      let map = new PersistentMap<number, string>();

      // Add in specific order
      const items = [5, 2, 8, 1, 9, 3, 7, 4, 6, 0];
      items.forEach((i) => {
        map = map.set(i, `val${i}`);
      });

      // Collect iteration results
      const keys1 = Array.from(map.keys());
      const keys2 = Array.from(map.keys());

      // Should be consistent between iterations
      expect(keys1).toEqual(keys2);
      expect(keys1.length).toBe(10);

      // All items should be present
      items.forEach((i) => {
        expect(keys1).toContain(i);
      });
    });
  });

  describe('Complex merge scenarios', () => {
    it('should handle merge with empty maps', () => {
      const empty = new PersistentMap<string, number>();
      const filled = new PersistentMap<string, number>()
        .set('a', 1)
        .set('b', 2);

      // Merge filled into empty
      let result = empty;
      filled.forEach((v, k) => {
        result = result.set(k, v);
      });

      expect(result.size).toBe(2);
      expect(result.get('a')).toBe(1);
      expect(result.get('b')).toBe(2);
    });

    it('should handle overlapping merges', () => {
      const map1 = new PersistentMap<string, number>()
        .set('a', 1)
        .set('b', 2)
        .set('c', 3);

      const map2 = new PersistentMap<string, number>()
        .set('b', 22)
        .set('c', 33)
        .set('d', 44);

      // Merge map2 into map1
      let merged = map1;
      map2.forEach((v, k) => {
        merged = merged.set(k, v);
      });

      expect(merged.size).toBe(4);
      expect(merged.get('a')).toBe(1);
      expect(merged.get('b')).toBe(22); // Overwritten
      expect(merged.get('c')).toBe(33); // Overwritten
      expect(merged.get('d')).toBe(44); // Added
    });
  });

  describe('asMutable and conversion', () => {
    it('should convert to mutable Map correctly', () => {
      const persistent = new PersistentMap<string, number>()
        .set('a', 1)
        .set('b', 2)
        .set('c', 3);

      const mutable = persistent.asMutable();

      expect(mutable).toBeInstanceOf(Map);
      expect(mutable.size).toBe(3);
      expect(mutable.get('a')).toBe(1);
      expect(mutable.get('b')).toBe(2);
      expect(mutable.get('c')).toBe(3);

      // Changes to mutable don't affect persistent
      mutable.set('d', 4);
      expect(persistent.has('d')).toBe(false);
      expect(mutable.has('d')).toBe(true);
    });

    it('should handle Symbol.toStringTag', () => {
      const map = new PersistentMap<string, number>();
      expect(Object.prototype.toString.call(map)).toBe(
        '[object PersistentMap]',
      );
    });
  });

  describe('Update with same value optimization', () => {
    it('should return same instance when setting identical value', () => {
      const map = new PersistentMap<string, number>().set('a', 1).set('b', 2);

      // Set same value
      const map2 = map.set('a', 1);
      expect(map2).toBe(map); // Same instance

      // Set different value
      const map3 = map.set('a', 2);
      expect(map3).not.toBe(map); // New instance
      expect(map3.get('a')).toBe(2);
    });

    it('should handle object value identity correctly', () => {
      const obj1 = { value: 1 };
      const obj2 = { value: 1 }; // Same content, different identity

      const map = new PersistentMap<string, object>().set('a', obj1);

      // Same object reference - should return same map
      const map2 = map.set('a', obj1);
      expect(map2).toBe(map);

      // Different object - should create new map
      const map3 = map.set('a', obj2);
      expect(map3).not.toBe(map);
      expect(map3.get('a')).toBe(obj2);
    });
  });
});
