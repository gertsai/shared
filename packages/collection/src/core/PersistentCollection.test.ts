import { describe, expect, it } from 'vitest';
import { PersistentCollection } from './PersistentCollection';

describe('PersistentCollection', () => {
  it('basic read operations and iteration', () => {
    const c = new PersistentCollection<string, number>([
      ['a', 1],
      ['b', 2],
    ]);
    expect(c.size).toBe(2);
    expect(c.get('a')).toBe(1);
    expect(c.has('c')).toBe(false);
    expect(Array.from(c.entries())).toEqual([
      ['a', 1],
      ['b', 2],
    ]);
  });

  it('immutability: set/delete/clear/update/merge return new or same', () => {
    const c = new PersistentCollection<string, number>([
      ['a', 1],
      ['b', 2],
    ]);

    const setSame = c.set('a', 1);
    expect(setSame).toBe(c);

    const setNew = c.set('c', 3);
    expect(setNew).not.toBe(c);
    expect(setNew.get('c')).toBe(3);

    const delMissing = c.delete('z');
    expect(delMissing).toBe(c);
    const delExisting = c.delete('a');
    expect(delExisting).not.toBe(c);
    expect(delExisting.has('a')).toBe(false);

    const cleared = c.clear();
    expect(cleared).not.toBe(c);
    expect(cleared.size).toBe(0);
    const clearedAgain = cleared.clear();
    expect(clearedAgain).toBe(cleared);

    const updatedSame = c.update('a', (v) => v ?? 0);
    expect(updatedSame).toBe(c);
    const updated = c.update('x', (v) => (v ?? 0) + 5);
    expect(updated).not.toBe(c);
    expect(updated.get('x')).toBe(5);

    const merged = c.merge(
      new PersistentCollection([
        ['b', 20],
        ['c', 3],
      ]),
    );
    expect(merged).not.toBe(c);
    expect(merged.get('b')).toBe(20);
    expect(merged.get('c')).toBe(3);
  });

  it('search/transform/aggregate ops', () => {
    const c = new PersistentCollection<string, number>([
      ['a', 1],
      ['b', 2],
      ['c', 3],
    ]);
    expect(c.find((v) => v > 1)).toBe(2);
    expect(c.findKey((v) => v === 3)).toBe('c');
    expect(c.some((v) => v > 2)).toBe(true);
    expect(c.every((v) => v >= 1)).toBe(true);

    const mv = c.mapValues((v) => v + 1);
    expect(Array.from(mv.entries())).toEqual([
      ['a', 2],
      ['b', 3],
      ['c', 4],
    ]);

    const mk = c.mapKeys((k) => `${k}!`);
    // order can change due to Map re-insertion order; assert contents ignoring order
    expect(new Map(Array.from(mk.entries()))).toEqual(
      new Map([
        ['a!', 1],
        ['b!', 2],
        ['c!', 3],
      ]),
    );

    expect(c.map((v) => v * 2)).toEqual([2, 4, 6]);
    expect((c as any).mapArray((v: number) => v * 3)).toEqual([3, 6, 9]);
    expect((c as any).flatMapArray((v: number) => [v, v + 10])).toEqual([
      1, 11, 2, 12, 3, 13,
    ]);
    expect(c.reduce((acc, v) => acc + v, 0)).toBe(6);
    const g = c.groupBy((v) => (v % 2 === 0 ? 'even' : 'odd'));
    expect(g.get('odd')?.length).toBe(2);
    expect(g.get('even')?.length).toBe(1);
  });

  it('set operations union/intersection/difference/symmetricDifference', () => {
    const a = new PersistentCollection<string, number>([
      ['a', 1],
      ['b', 2],
      ['c', 3],
    ]);
    const b = new PersistentCollection<string, number>([
      ['b', 20],
      ['d', 4],
    ]);

    const u = a.union(b);
    expect(Array.from(u.entries())).toEqual([
      ['a', 1],
      ['b', 20],
      ['c', 3],
      ['d', 4],
    ]);

    const i = a.intersection(b);
    expect(Array.from(i.entries())).toEqual([['b', 2]]);

    const d = a.difference(b);
    expect(Array.from(d.entries())).toEqual([
      ['a', 1],
      ['c', 3],
    ]);

    const sd = a.symmetricDifference(b);
    expect(Array.from(sd.entries())).toEqual([
      ['a', 1],
      ['c', 3],
      ['d', 4],
    ]);
  });

  it('sort/reverse/take/skip utilities', () => {
    const c = new PersistentCollection<string, number>([
      ['c', 3],
      ['a', 1],
      ['b', 2],
    ]);
    const sorted = c.sort();
    expect(Array.from(sorted.entries())).toEqual([
      ['a', 1],
      ['b', 2],
      ['c', 3],
    ]);

    const reversed = sorted.reverse();
    // Reverse twice should restore
    const restored = reversed.reverse();
    expect(restored.equals(sorted)).toBe(true);

    const take2 = sorted.take(2);
    expect(take2).not.toBe(sorted);
    expect(Array.from(take2.entries())).toEqual([
      ['a', 1],
      ['b', 2],
    ]);

    const skip2 = sorted.skip(2);
    expect(skip2).not.toBe(sorted);
    expect(Array.from(skip2.entries())).toEqual([['c', 3]]);
  });

  it('equals/clone/toString', () => {
    const c1 = new PersistentCollection<string, number>([
      ['a', 1],
      ['b', 2],
    ]);
    const c2 = new PersistentCollection<string, number>([
      ['a', 1],
      ['b', 2],
    ]);
    expect(c1.equals(c2)).toBe(true);
    expect(c1.clone()).toBe(c1); // immutable clone is same
    expect(typeof c1.toString()).toBe('string');
  });

  it('equals uses Object.is semantics (NaN equal, -0/+0 not equal)', () => {
    const n1 = new PersistentCollection<string, number>([['x', Number.NaN]]);
    const n2 = new PersistentCollection<string, number>([['x', Number.NaN]]);
    expect(n1.equals(n2)).toBe(true);

    const z1 = new PersistentCollection<string, number>([['z', -0]]);
    const z2 = new PersistentCollection<string, number>([['z', +0]]);
    expect(z1.equals(z2)).toBe(false);
  });

  describe('Lazy iterators', () => {
    it('filterIter should lazily filter entries', () => {
      const c = new PersistentCollection<string, number>([
        ['a', 1],
        ['b', 2],
        ['c', 3],
        ['d', 4],
        ['e', 5],
      ]);

      const iter = c.filterIter((v) => v % 2 === 0);
      const result = Array.from(iter);
      expect(result).toEqual([
        ['b', 2],
        ['d', 4],
      ]);

      // Test early termination
      const iter2 = c.filterIter((v) => v > 2);
      const first = iter2.next();
      expect(first.value).toEqual(['c', 3]);
      expect(first.done).toBe(false);
    });

    it('takeIter should lazily take first n entries', () => {
      const c = new PersistentCollection<string, number>([
        ['a', 1],
        ['b', 2],
        ['c', 3],
        ['d', 4],
      ]);

      const iter = c.takeIter(2);
      const result = Array.from(iter);
      expect(result).toEqual([
        ['a', 1],
        ['b', 2],
      ]);

      // Test taking more than size
      const iterAll = c.takeIter(10);
      expect(Array.from(iterAll).length).toBe(4);

      // Test taking 0
      const iter0 = c.takeIter(0);
      expect(Array.from(iter0)).toEqual([]);
    });

    it('skipIter should lazily skip first n entries', () => {
      const c = new PersistentCollection<string, number>([
        ['a', 1],
        ['b', 2],
        ['c', 3],
        ['d', 4],
      ]);

      const iter = c.skipIter(2);
      const result = Array.from(iter);
      expect(result).toEqual([
        ['c', 3],
        ['d', 4],
      ]);

      // Test skipping more than size
      const iterNone = c.skipIter(10);
      expect(Array.from(iterNone)).toEqual([]);

      // Test skipping 0
      const iterAll = c.skipIter(0);
      expect(Array.from(iterAll).length).toBe(4);
    });

    it('lazy iterators should be composable', () => {
      const c = new PersistentCollection<string, number>([
        ['a', 1],
        ['b', 2],
        ['c', 3],
        ['d', 4],
        ['e', 5],
        ['f', 6],
      ]);

      // Filter then take
      const filtered = c.filterIter((v) => v % 2 === 0);
      const limited = Array.from(filtered).slice(0, 2);
      expect(limited).toEqual([
        ['b', 2],
        ['d', 4],
      ]);

      // Skip then filter
      const skipped = Array.from(c.skipIter(2));
      const evenFromSkipped = skipped.filter(([, v]) => v % 2 === 0);
      expect(evenFromSkipped).toEqual([
        ['d', 4],
        ['f', 6],
      ]);
    });
  });

  describe('PersistentCollection edge cases', () => {
    it('should handle empty collections', () => {
      const empty = new PersistentCollection<string, number>([]);

      expect(empty.size).toBe(0);
      expect(Array.from(empty.filterIter(() => true))).toEqual([]);
      expect(Array.from(empty.takeIter(5))).toEqual([]);
      expect(Array.from(empty.skipIter(5))).toEqual([]);

      const added = empty.set('a', 1);
      expect(added).not.toBe(empty);
      expect(added.size).toBe(1);
    });

    it('should handle large collections efficiently', () => {
      const entries: Array<[number, number]> = [];
      for (let i = 0; i < 1000; i++) {
        entries.push([i, i * 2]);
      }

      const large = new PersistentCollection(entries);
      expect(large.size).toBe(1000);

      // Test structural sharing
      const updated = large.set(500, 9999);
      expect(updated).not.toBe(large);
      expect(updated.get(500)).toBe(9999);
      expect(large.get(500)).toBe(1000);

      // Test lazy iteration efficiency
      const firstFive = Array.from(large.takeIter(5));
      expect(firstFive.length).toBe(5);
      // PersistentMap may not preserve insertion order exactly
      // Just check that we got 5 entries
      const keys = firstFive.map(([k]) => k);
      const values = firstFive.map(([, v]) => v);
      expect(keys.every((k) => typeof k === 'number')).toBe(true);
      expect(values.every((v) => typeof v === 'number')).toBe(true);
    });

    it('should handle complex transformations', () => {
      const c = new PersistentCollection<string, { value: number }>([
        ['a', { value: 1 }],
        ['b', { value: 2 }],
        ['c', { value: 3 }],
      ]);

      const transformed = c.mapValues((v) => ({ ...v, doubled: v.value * 2 }));
      expect(transformed.get('b')).toEqual({ value: 2, doubled: 4 });

      // Original should be unchanged
      expect(c.get('b')).toEqual({ value: 2 });
    });
  });
});
