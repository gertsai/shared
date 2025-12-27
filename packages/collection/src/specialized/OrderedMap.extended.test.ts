import { describe, expect, it } from 'vitest';
import { OrderedMap } from './OrderedMap';

describe('OrderedMap Extended Tests', () => {
  describe('Basic operations', () => {
    it('should maintain insertion order', () => {
      const map = new OrderedMap<string, number>();

      map.set('third', 3);
      map.set('first', 1);
      map.set('second', 2);

      const entries = Array.from(map.entries());
      expect(entries).toEqual([
        ['third', 3],
        ['first', 1],
        ['second', 2],
      ]);
    });

    it('should update value without changing order', () => {
      const map = new OrderedMap<string, number>([
        ['a', 1],
        ['b', 2],
        ['c', 3],
      ]);

      map.set('b', 20); // Update existing

      const entries = Array.from(map.entries());
      expect(entries).toEqual([
        ['a', 1],
        ['b', 20],
        ['c', 3],
      ]);
    });

    it('should handle deletion correctly', () => {
      const map = new OrderedMap<string, number>([
        ['a', 1],
        ['b', 2],
        ['c', 3],
        ['d', 4],
      ]);

      map.delete('b');

      const entries = Array.from(map.entries());
      expect(entries).toEqual([
        ['a', 1],
        ['c', 3],
        ['d', 4],
      ]);
      expect(map.isConsistent()).toBe(true);
    });

    it('should clear all entries', () => {
      const map = new OrderedMap<string, number>([
        ['a', 1],
        ['b', 2],
      ]);

      map.clear();

      expect(map.size).toBe(0);
      expect(map.getFirstKey()).toBeUndefined();
      expect(map.getLastKey()).toBeUndefined();
      expect(map.isConsistent()).toBe(true);
    });
  });

  describe('Movement operations', () => {
    it('should move key to front', () => {
      const map = new OrderedMap<string, number>([
        ['a', 1],
        ['b', 2],
        ['c', 3],
      ]);

      const moved = map.moveToFront('c');

      expect(moved).toBe(true);
      expect(Array.from(map.keys())).toEqual(['c', 'a', 'b']);
    });

    it('should move key to back', () => {
      const map = new OrderedMap<string, number>([
        ['a', 1],
        ['b', 2],
        ['c', 3],
      ]);

      const moved = map.moveToBack('a');

      expect(moved).toBe(true);
      expect(Array.from(map.keys())).toEqual(['b', 'c', 'a']);
    });

    it('should not move if already at position', () => {
      const map = new OrderedMap<string, number>([
        ['a', 1],
        ['b', 2],
      ]);

      expect(map.moveToFront('a')).toBe(false); // Already at front
      expect(map.moveToBack('b')).toBe(false); // Already at back
    });

    it('should move before another key', () => {
      const map = new OrderedMap<string, number>([
        ['a', 1],
        ['b', 2],
        ['c', 3],
        ['d', 4],
      ]);

      const moved = map.moveBefore('d', 'b');

      expect(moved).toBe(true);
      expect(Array.from(map.keys())).toEqual(['a', 'd', 'b', 'c']);
    });

    it('should move after another key', () => {
      const map = new OrderedMap<string, number>([
        ['a', 1],
        ['b', 2],
        ['c', 3],
        ['d', 4],
      ]);

      const moved = map.moveAfter('a', 'c');

      expect(moved).toBe(true);
      expect(Array.from(map.keys())).toEqual(['b', 'c', 'a', 'd']);
    });

    it('should handle invalid movements', () => {
      const map = new OrderedMap<string, number>([
        ['a', 1],
        ['b', 2],
      ]);

      expect(map.moveBefore('a', 'a')).toBe(false); // Same key
      expect(map.moveBefore('x', 'a')).toBe(false); // Non-existent key
      expect(map.moveBefore('a', 'x')).toBe(false); // Non-existent target
      expect(map.moveAfter('b', 'b')).toBe(false); // Same key
    });
  });

  describe('Positional access', () => {
    it('should get/remove entry at index', () => {
      const map = new OrderedMap<string, number>([
        ['a', 1],
        ['b', 2],
        ['c', 3],
      ]);

      expect(map.entryAt(0)).toEqual(['a', 1]);
      expect(map.entryAt(1)).toEqual(['b', 2]);
      expect(map.entryAt(2)).toEqual(['c', 3]);
      expect(map.entryAt(3)).toBeUndefined();
      expect(map.entryAt(-1)).toBeUndefined();
    });

    it('should remove entry at index', () => {
      const map = new OrderedMap<string, number>([
        ['a', 1],
        ['b', 2],
        ['c', 3],
      ]);

      const removed = map.removeAt(1);

      expect(removed).toEqual(['b', 2]);
      expect(map.size).toBe(2);
      expect(Array.from(map.keys())).toEqual(['a', 'c']);
    });

    it('should get index of key', () => {
      const map = new OrderedMap<string, number>([
        ['a', 1],
        ['b', 2],
        ['c', 3],
      ]);

      expect(map.indexOf('a')).toBe(0);
      expect(map.indexOf('b')).toBe(1);
      expect(map.indexOf('c')).toBe(2);
      expect(map.indexOf('x')).toBe(-1);
    });
  });

  describe('Stack/Queue operations', () => {
    it('should shift (remove first)', () => {
      const map = new OrderedMap<string, number>([
        ['a', 1],
        ['b', 2],
        ['c', 3],
      ]);

      const shifted = map.shift();

      expect(shifted).toEqual(['a', 1]);
      expect(map.size).toBe(2);
      expect(map.getFirstKey()).toBe('b');
    });

    it('should pop (remove last)', () => {
      const map = new OrderedMap<string, number>([
        ['a', 1],
        ['b', 2],
        ['c', 3],
      ]);

      const popped = map.pop();

      expect(popped).toEqual(['c', 3]);
      expect(map.size).toBe(2);
      expect(map.getLastKey()).toBe('b');
    });

    it('should unshift (add at beginning)', () => {
      const map = new OrderedMap<string, number>([
        ['b', 2],
        ['c', 3],
      ]);

      map.unshift('a', 1);

      expect(Array.from(map.keys())).toEqual(['a', 'b', 'c']);
    });

    it('should handle unshift with existing key', () => {
      const map = new OrderedMap<string, number>([
        ['a', 1],
        ['b', 2],
        ['c', 3],
      ]);

      map.unshift('b', 20); // Update and move to front

      expect(Array.from(map.entries())).toEqual([
        ['b', 20],
        ['a', 1],
        ['c', 3],
      ]);
    });

    it('should handle empty map operations', () => {
      const map = new OrderedMap<string, number>();

      expect(map.shift()).toBeUndefined();
      expect(map.pop()).toBeUndefined();
      expect(map.getFirstValue()).toBeUndefined();
      expect(map.getLastValue()).toBeUndefined();
    });
  });

  describe('Insert operations', () => {
    it('should insert before specific key', () => {
      const map = new OrderedMap<string, number>([
        ['a', 1],
        ['c', 3],
      ]);

      const inserted = map.insertBefore('c', 'b', 2);

      expect(inserted).toBe(true);
      expect(Array.from(map.entries())).toEqual([
        ['a', 1],
        ['b', 2],
        ['c', 3],
      ]);
    });

    it('should insert after specific key', () => {
      const map = new OrderedMap<string, number>([
        ['a', 1],
        ['c', 3],
      ]);

      const inserted = map.insertAfter('a', 'b', 2);

      expect(inserted).toBe(true);
      expect(Array.from(map.entries())).toEqual([
        ['a', 1],
        ['b', 2],
        ['c', 3],
      ]);
    });

    it('should not insert if key already exists', () => {
      const map = new OrderedMap<string, number>([
        ['a', 1],
        ['b', 2],
      ]);

      const inserted = map.insertBefore('b', 'a', 10);

      expect(inserted).toBe(false); // 'a' already exists
      expect(map.get('a')).toBe(1); // Value unchanged
    });

    it('should handle insert at boundaries', () => {
      const map = new OrderedMap<string, number>([['b', 2]]);

      map.insertBefore('b', 'a', 1);
      map.insertAfter('b', 'c', 3);

      expect(Array.from(map.keys())).toEqual(['a', 'b', 'c']);
    });
  });

  describe('Trim operations', () => {
    it('should trim to maximum size', () => {
      const map = new OrderedMap<string, number>([
        ['a', 1],
        ['b', 2],
        ['c', 3],
        ['d', 4],
        ['e', 5],
      ]);

      map.trimTo(3);

      expect(map.size).toBe(3);
      expect(Array.from(map.keys())).toEqual(['c', 'd', 'e']);
    });

    it('should handle trim to zero', () => {
      const map = new OrderedMap<string, number>([
        ['a', 1],
        ['b', 2],
      ]);

      map.trimTo(0);

      expect(map.size).toBe(0);
    });

    it('should handle trim to larger than current size', () => {
      const map = new OrderedMap<string, number>([
        ['a', 1],
        ['b', 2],
      ]);

      map.trimTo(10);

      expect(map.size).toBe(2);
    });

    it('should handle negative trim', () => {
      const map = new OrderedMap<string, number>([
        ['a', 1],
        ['b', 2],
      ]);

      map.trimTo(-1);

      expect(map.size).toBe(2); // No change
    });
  });

  describe('Reorder operations', () => {
    it('should reorder by comparator', () => {
      const map = new OrderedMap<string, number>([
        ['c', 3],
        ['a', 1],
        ['b', 2],
      ]);

      map.reorder((a, b) => a[0].localeCompare(b[0])); // Sort by key

      expect(Array.from(map.keys())).toEqual(['a', 'b', 'c']);
    });

    it('should reorder by value', () => {
      const map = new OrderedMap<string, number>([
        ['high', 100],
        ['low', 10],
        ['medium', 50],
      ]);

      map.reorder((a, b) => a[1] - b[1]); // Sort by value ascending

      expect(Array.from(map.entries())).toEqual([
        ['low', 10],
        ['medium', 50],
        ['high', 100],
      ]);
    });
  });

  describe('Iteration', () => {
    it('should iterate in order', () => {
      const map = new OrderedMap<string, number>([
        ['first', 1],
        ['second', 2],
        ['third', 3],
      ]);

      const keys: string[] = [];
      const values: number[] = [];

      for (const [key, value] of map) {
        keys.push(key);
        values.push(value);
      }

      expect(keys).toEqual(['first', 'second', 'third']);
      expect(values).toEqual([1, 2, 3]);
    });

    it('should iterate in reverse order', () => {
      const map = new OrderedMap<string, number>([
        ['a', 1],
        ['b', 2],
        ['c', 3],
      ]);

      const entries = Array.from(map.entriesReverse());

      expect(entries).toEqual([
        ['c', 3],
        ['b', 2],
        ['a', 1],
      ]);
    });
  });

  describe('Edge cases', () => {
    it('should handle object keys', () => {
      const key1 = { id: 1 };
      const key2 = { id: 2 };
      const key3 = { id: 3 };

      const map = new OrderedMap<object, string>();

      map.set(key2, 'two');
      map.set(key1, 'one');
      map.set(key3, 'three');

      const keys = Array.from(map.keys());
      expect(keys).toEqual([key2, key1, key3]); // Insertion order
    });

    it('should handle large collection', () => {
      const map = new OrderedMap<number, number>();

      for (let i = 0; i < 1000; i++) {
        map.set(i, i * 2);
      }

      expect(map.size).toBe(1000);
      expect(map.getFirstKey()).toBe(0);
      expect(map.getLastKey()).toBe(999);
      expect(map.indexOf(500)).toBe(500);

      // Check order maintained
      let prev = -1;
      for (const [key] of map) {
        expect(key).toBe(prev + 1);
        prev = key;
      }
    });

    it('should maintain consistency after complex operations', () => {
      const map = new OrderedMap<string, number>([
        ['a', 1],
        ['b', 2],
        ['c', 3],
        ['d', 4],
      ]);

      map.moveToFront('c');
      map.delete('b');
      map.set('e', 5);
      map.moveAfter('a', 'd');
      map.unshift('z', 26);

      expect(map.isConsistent()).toBe(true);
      expect(map.size).toBe(5);
    });
  });

  describe('Clone and toString', () => {
    it('should clone correctly', () => {
      const original = new OrderedMap<string, number>([
        ['a', 1],
        ['b', 2],
      ]);

      const cloned = original.clone();

      expect(cloned).not.toBe(original);
      expect(Array.from(cloned.entries())).toEqual(
        Array.from(original.entries()),
      );

      // Modify clone shouldn't affect original
      cloned.set('c', 3);
      expect(original.has('c')).toBe(false);
    });

    it('should have meaningful string representation', () => {
      const map = new OrderedMap<string, number>([
        ['a', 1],
        ['b', 2],
      ]);

      const str = map.toString();

      expect(str).toContain('OrderedMap');
      expect(str).toContain('2');
      expect(str).toContain('a: 1');
      expect(str).toContain('b: 2');
    });
  });

  describe('First/Last accessors', () => {
    it('should get first and last keys/values', () => {
      const map = new OrderedMap<string, number>([
        ['first', 100],
        ['middle', 200],
        ['last', 300],
      ]);

      expect(map.getFirstKey()).toBe('first');
      expect(map.getFirstValue()).toBe(100);
      expect(map.getLastKey()).toBe('last');
      expect(map.getLastValue()).toBe(300);
    });

    it('should handle single element', () => {
      const map = new OrderedMap<string, number>([['only', 42]]);

      expect(map.getFirstKey()).toBe('only');
      expect(map.getLastKey()).toBe('only');
      expect(map.getFirstValue()).toBe(42);
      expect(map.getLastValue()).toBe(42);
    });
  });
});
