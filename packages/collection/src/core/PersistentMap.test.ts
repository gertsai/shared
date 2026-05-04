import { describe, expect, it } from 'vitest';
import { PersistentMap } from './PersistentMap';

describe('PersistentMap', () => {
  it('sets and gets primitive keys immutably', () => {
    const m1 = new PersistentMap<string, number>();
    const m2 = m1.set('a', 1);
    const m3 = m2.set('b', 2);

    expect(m1.size).toBe(0);
    expect(m2.size).toBe(1);
    expect(m3.size).toBe(2);

    expect(m1.get('a')).toBeUndefined();
    expect(m2.get('a')).toBe(1);
    expect(m3.get('b')).toBe(2);
  });

  it('deletes keys immutably', () => {
    const m1 = new PersistentMap<string, number>();
    const m2 = m1.set('x', 10).set('y', 20);
    const m3 = m2.delete('x');
    const m4 = m3.delete('z'); // non-existing

    expect(m2.size).toBe(2);
    expect(m3.size).toBe(1);
    expect(m3.get('x')).toBeUndefined();
    expect(m3.get('y')).toBe(20);
    // deleting non-existing key returns same instance semantics (
    // here we just verify content unchanged)
    expect(m4.size).toBe(1);
    expect(m4.get('y')).toBe(20);
  });

  it('supports object keys by identity with stable hashing', () => {
    const k1 = { id: 1 };
    const k2 = { id: 1 };
    const m1 = new PersistentMap<object, string>();
    const m2 = m1.set(k1, 'v1');

    expect(m2.get(k1)).toBe('v1');
    expect(m2.get(k2)).toBeUndefined(); // different identity

    const m3 = m2.set(k2, 'v2');
    expect(m3.get(k1)).toBe('v1');
    expect(m3.get(k2)).toBe('v2');
    expect(Array.from(m3.entries()).length).toBe(2);
  });

  it('handles many inserts and iteration integrity', () => {
    let m = new PersistentMap<number, number>();
    for (let i = 0; i < 200; i++) {
      m = m.set(i, i * 2);
    }
    // no exceptions and all present
    for (let i = 0; i < 200; i++) {
      expect(m.get(i)).toBe(i * 2);
    }
    expect(Array.from(m.entries()).length).toBe(200);
  });

  it('instance semantics: delete non-existent returns same, clear on empty returns same', () => {
    const m1 = new PersistentMap<string, number>();
    const m2 = m1.delete('nope');
    expect(m2).toBe(m1);

    const m3 = new PersistentMap<string, number>();
    const m4 = m3.clear();
    expect(m4).toBe(m3);
  });

  describe('PersistentMap edge cases', () => {
    it('should handle hash collisions', () => {
      // Create keys that might have hash collisions
      const map = new PersistentMap<any, number>();

      // Simulate collision by using objects with same toString
      const key1 = { toString: () => 'collision', id: 1 };
      const key2 = { toString: () => 'collision', id: 2 };
      const key3 = { toString: () => 'collision', id: 3 };

      const m1 = map.set(key1, 1);
      const m2 = m1.set(key2, 2);
      const m3 = m2.set(key3, 3);

      expect(m3.size).toBe(3);
      expect(m3.get(key1)).toBe(1);
      expect(m3.get(key2)).toBe(2);
      expect(m3.get(key3)).toBe(3);

      // Test deletion with collisions
      const m4 = m3.delete(key2);
      expect(m4.size).toBe(2);
      expect(m4.get(key2)).toBeUndefined();
      expect(m4.get(key1)).toBe(1);
      expect(m4.get(key3)).toBe(3);
    });

    it('should test keys() iterator', () => {
      const map = new PersistentMap<string, number>().set('a', 1).set('b', 2).set('c', 3);

      const keys = Array.from(map.keys());
      expect(keys.length).toBe(3);
      expect(keys).toContain('a');
      expect(keys).toContain('b');
      expect(keys).toContain('c');

      // Test with empty map
      const emptyKeys = Array.from(new PersistentMap().keys());
      expect(emptyKeys).toEqual([]);
    });

    it('should test values() iterator', () => {
      const map = new PersistentMap<string, number>().set('a', 1).set('b', 2).set('c', 3);

      const values = Array.from(map.values());
      expect(values.length).toBe(3);
      expect(values).toContain(1);
      expect(values).toContain(2);
      expect(values).toContain(3);

      // Test with empty map
      const emptyValues = Array.from(new PersistentMap().values());
      expect(emptyValues).toEqual([]);
    });

    it('should test Symbol.toStringTag', () => {
      const map = new PersistentMap<string, number>();
      expect(map[Symbol.toStringTag]).toBe('PersistentMap');
      expect(Object.prototype.toString.call(map)).toBe('[object PersistentMap]');

      // Test with populated map
      const populatedMap = map.set('test', 123);
      expect(populatedMap[Symbol.toStringTag]).toBe('PersistentMap');
    });

    it('should test asMutable() method', () => {
      const persistent = new PersistentMap<string, number>().set('a', 1).set('b', 2).set('c', 3);

      const mutable = persistent.asMutable();
      expect(mutable).toBeInstanceOf(Map);
      expect(mutable.size).toBe(3);
      expect(mutable.get('a')).toBe(1);
      expect(mutable.get('b')).toBe(2);
      expect(mutable.get('c')).toBe(3);

      // Changes in mutable don't affect persistent
      mutable.set('d', 4);
      mutable.set('a', 999);
      expect(persistent.has('d')).toBe(false);
      expect(persistent.get('a')).toBe(1);

      // Test with empty map
      const emptyMutable = new PersistentMap().asMutable();
      expect(emptyMutable).toBeInstanceOf(Map);
      expect(emptyMutable.size).toBe(0);
    });

    it('should handle large datasets with potential collisions', () => {
      const map = new PersistentMap<number, number>();

      // Create many elements to force different node types
      let current = map;
      for (let i = 0; i < 10000; i++) {
        current = current.set(i, i * 2);
      }

      expect(current.size).toBe(10000);

      // Verify random access
      expect(current.get(0)).toBe(0);
      expect(current.get(5000)).toBe(10000);
      expect(current.get(9999)).toBe(19998);

      // Delete half of the elements
      for (let i = 0; i < 5000; i++) {
        current = current.delete(i);
      }

      expect(current.size).toBe(5000);
      expect(current.get(0)).toBeUndefined();
      expect(current.get(5000)).toBe(10000);
      expect(current.get(9999)).toBe(19998);

      // Test structural sharing - original should be unchanged
      expect(map.size).toBe(0);
    });

    it('should handle merge operations through entries', () => {
      const map1 = new PersistentMap<string, number>().set('a', 1).set('b', 2).set('c', 3);

      const map2 = new PersistentMap<string, number>().set('b', 20).set('d', 4).set('e', 5);

      // Merge map2 into map1
      let merged = map1;
      for (const [k, v] of map2.entries()) {
        merged = merged.set(k, v);
      }

      expect(merged.size).toBe(5);
      expect(merged.get('a')).toBe(1);
      expect(merged.get('b')).toBe(20); // Overwritten
      expect(merged.get('c')).toBe(3);
      expect(merged.get('d')).toBe(4);
      expect(merged.get('e')).toBe(5);

      // Original maps unchanged
      expect(map1.get('b')).toBe(2);
      expect(map1.size).toBe(3);
      expect(map2.size).toBe(3);
    });

    it('should handle Symbol.iterator', () => {
      const map = new PersistentMap<string, number>().set('x', 10).set('y', 20);

      const entries: Array<[string, number]> = [];
      for (const entry of map) {
        entries.push(entry);
      }

      expect(entries.length).toBe(2);
      expect(entries).toContainEqual(['x', 10]);
      expect(entries).toContainEqual(['y', 20]);
    });

    it('should handle complex nested operations', () => {
      // Test with nested maps as values
      const innerMap1 = new PersistentMap<string, number>().set('inner1', 100);
      const innerMap2 = new PersistentMap<string, number>().set('inner2', 200);

      const outerMap = new PersistentMap<string, PersistentMap<string, number>>()
        .set('first', innerMap1)
        .set('second', innerMap2);

      expect(outerMap.get('first')?.get('inner1')).toBe(100);
      expect(outerMap.get('second')?.get('inner2')).toBe(200);

      // Modify inner map
      const newInnerMap1 = innerMap1.set('inner1', 150);
      const newOuterMap = outerMap.set('first', newInnerMap1);

      expect(newOuterMap.get('first')?.get('inner1')).toBe(150);
      expect(outerMap.get('first')?.get('inner1')).toBe(100); // Original unchanged
    });

    it('should correctly handle undefined as value', () => {
      // FIX: has() should return true when key exists with undefined value
      const map = new PersistentMap<string, undefined | number>().set('a', undefined).set('b', 42);

      expect(map.has('a')).toBe(true); // Key exists with undefined value
      expect(map.has('b')).toBe(true);
      expect(map.has('c')).toBe(false); // Key doesn't exist

      expect(map.get('a')).toBeUndefined();
      expect(map.get('b')).toBe(42);
      expect(map.get('c')).toBeUndefined();

      expect(map.size).toBe(2);

      // Delete should work correctly
      const deleted = map.delete('a');
      expect(deleted.has('a')).toBe(false);
      expect(deleted.size).toBe(1);
    });

    it('should handle float keys with proper hashing', () => {
      // FIX: Float hashing should preserve precision
      const map = new PersistentMap<number, string>()
        .set(3.14159, 'pi')
        .set(2.71828, 'e')
        .set(1.41421, 'sqrt2');

      expect(map.get(3.14159)).toBe('pi');
      expect(map.get(2.71828)).toBe('e');
      expect(map.get(1.41421)).toBe('sqrt2');
      expect(map.size).toBe(3);

      // Very close but different floats should be different keys
      const map2 = map.set(3.141590001, 'almost-pi');

      expect(map2.get(3.14159)).toBe('pi');
      expect(map2.get(3.141590001)).toBe('almost-pi');
      expect(map2.size).toBe(4);
    });

    it('should handle special number values', () => {
      const map = new PersistentMap<number, string>()
        .set(Infinity, 'inf')
        .set(-Infinity, 'neg-inf')
        .set(0, 'zero')
        .set(-0, 'neg-zero'); // -0 has same hash as 0 but Object.is(0, -0) = false

      expect(map.get(Infinity)).toBe('inf');
      expect(map.get(-Infinity)).toBe('neg-inf');
      expect(map.get(0)).toBe('zero'); // 0 and -0 are different keys per Object.is
      expect(map.get(-0)).toBe('neg-zero');
      expect(map.size).toBe(4); // 0 and -0 are separate keys (hash collision, but different by Object.is)
    });
  });
});
