import { beforeEach, describe, expect, it } from 'vitest';
import { ImmutableCollection } from './ImmutableCollection';

describe('ImmutableCollection', () => {
  let collection: ImmutableCollection<string, number>;

  beforeEach(() => {
    collection = new ImmutableCollection([
      ['a', 1],
      ['b', 2],
      ['c', 3],
    ]);
  });

  describe('Basic operations', () => {
    it('should create immutable collection from entries', () => {
      expect(collection.size).toBe(3);
      expect(collection.get('a')).toBe(1);
      expect(collection.get('b')).toBe(2);
      expect(collection.get('c')).toBe(3);
    });

    it('should return new instance on set', () => {
      const updated = collection.set('d', 4);

      expect(updated).not.toBe(collection);
      expect(updated.size).toBe(4);
      expect(updated.get('d')).toBe(4);

      expect(collection.size).toBe(3);
      expect(collection.get('d')).toBeUndefined();
    });

    it('should return same instance if value unchanged', () => {
      const updated = collection.set('a', 1); // Same value

      expect(updated).toBe(collection);
      expect(updated.size).toBe(3);
    });

    it('should return new instance on delete', () => {
      const updated = collection.delete('b');

      expect(updated).not.toBe(collection);
      expect(updated.size).toBe(2);
      expect(updated.has('b')).toBe(false);

      expect(collection.size).toBe(3);
      expect(collection.has('b')).toBe(true);
    });

    it('should return same instance if key not found on delete', () => {
      const updated = collection.delete('z');

      expect(updated).toBe(collection);
      expect(updated.size).toBe(3);
    });

    it('should clear to empty collection', () => {
      const cleared = collection.clear();

      expect(cleared).not.toBe(collection);
      expect(cleared.size).toBe(0);
      expect(collection.size).toBe(3);
    });

    it('should return same instance if already empty on clear', () => {
      const empty = new ImmutableCollection<string, number>();
      const cleared = empty.clear();

      expect(cleared).toBe(empty);
    });
  });

  describe('Update operations', () => {
    it('should update value with updater function', () => {
      const updated = collection.update('a', (val) => (val ?? 0) + 10);

      expect(updated).not.toBe(collection);
      expect(updated.get('a')).toBe(11);
      expect(collection.get('a')).toBe(1);
    });

    it('should create new key with updater', () => {
      const updated = collection.update('z', (val) => (val ?? 0) + 100);

      expect(updated.size).toBe(4);
      expect(updated.get('z')).toBe(100);
    });

    it('should return same instance if update produces same value', () => {
      const updated = collection.update('a', (val) => val ?? 0); // Returns 1

      expect(updated).toBe(collection);
    });
  });

  describe('Filter operations', () => {
    it('should filter entries', () => {
      const filtered = collection.filter((value) => value > 1);

      expect(filtered).not.toBe(collection);
      expect(filtered.size).toBe(2);
      expect(filtered.has('a')).toBe(false);
      expect(filtered.get('b')).toBe(2);
      expect(filtered.get('c')).toBe(3);
    });

    it('should return same instance if nothing filtered', () => {
      const filtered = collection.filter(() => true);

      expect(filtered).toBe(collection);
    });
  });

  describe('Transform operations', () => {
    it('should map values', () => {
      const mapped = collection.mapValues((value) => value * 2);

      expect(mapped).not.toBe(collection);
      expect(mapped.get('a')).toBe(2);
      expect(mapped.get('b')).toBe(4);
      expect(mapped.get('c')).toBe(6);
    });

    it('mapArray returns array consistently', () => {
      const arr = (collection as any).mapArray((v: number) => v + 1);
      expect(arr).toEqual([2, 3, 4]);
    });

    it('flatMapArray returns array consistently', () => {
      const arr = (collection as any).flatMapArray((v: number) => [v, v * 2]);
      expect(arr).toEqual([1, 2, 2, 4, 3, 6]);
    });

    it('should return same instance if values unchanged', () => {
      const mapped = collection.mapValues((value) => value);

      expect(mapped).toBe(collection);
    });

    it('should map keys', () => {
      const mapped = collection.mapKeys((key) => key.toUpperCase());

      expect(mapped).not.toBe(collection);
      expect(mapped.get('A')).toBe(1);
      expect(mapped.get('B')).toBe(2);
      expect(mapped.get('C')).toBe(3);
    });

    it('should return same instance if keys unchanged', () => {
      const mapped = collection.mapKeys((key) => key);

      expect(mapped).toBe(collection);
    });

    it('mapEntriesCollection should map keys and values into a new immutable collection', () => {
      const base = new ImmutableCollection<string, number>([
        ['x', 1],
        ['y', 2],
      ]);
      const mapped = (base as any).mapEntriesCollection((k: string, v: number) => [
        k.toUpperCase(),
        v * 10,
      ]);
      expect(mapped.get('X')).toBe(10);
      expect(mapped.get('Y')).toBe(20);
      expect(mapped.size).toBe(2);
      // original unchanged
      expect(base.get('x')).toBe(1);
      expect(base.get('y')).toBe(2);
    });
  });

  describe('Set operations', () => {
    it('should perform union', () => {
      const other = new ImmutableCollection([
        ['c', 30],
        ['d', 4],
      ]);

      const result = collection.union(other);

      expect(result).not.toBe(collection);
      expect(result.size).toBe(4);
      expect(result.get('c')).toBe(30); // From other
      expect(result.get('d')).toBe(4);
    });

    it('should return same instance if union adds nothing', () => {
      const other = new ImmutableCollection([
        ['a', 1],
        ['b', 2],
      ]);

      const result = collection.union(other);

      expect(result).toBe(collection);
    });

    it('should return new instance if union overwrites values', () => {
      const other = new ImmutableCollection([
        ['a', 10],
        ['b', 20],
      ]);

      const result = collection.union(other);

      expect(result).not.toBe(collection);
      expect(result.get('a')).toBe(10);
      expect(result.get('b')).toBe(20);
    });

    it('should perform intersection', () => {
      const other = new ImmutableCollection([
        ['b', 20],
        ['c', 30],
        ['d', 4],
      ]);

      const result = collection.intersection(other);

      expect(result).not.toBe(collection);
      expect(result.size).toBe(2);
      expect(result.has('a')).toBe(false);
      expect(result.get('b')).toBe(2);
      expect(result.get('c')).toBe(3);
    });

    it('should return same instance if intersection changes nothing', () => {
      const other = new ImmutableCollection([
        ['a', 1],
        ['b', 2],
        ['c', 3],
        ['d', 4],
      ]);

      const result = collection.intersection(other);

      expect(result).toBe(collection);
    });

    it('should perform difference', () => {
      const other = new ImmutableCollection([
        ['b', 20],
        ['d', 4],
      ]);

      const result = collection.difference(other);

      expect(result).not.toBe(collection);
      expect(result.size).toBe(2);
      expect(result.get('a')).toBe(1);
      expect(result.has('b')).toBe(false);
    });

    it('should return same instance if difference removes nothing', () => {
      const other = new ImmutableCollection([
        ['d', 4],
        ['e', 5],
      ]);

      const result = collection.difference(other);

      expect(result).toBe(collection);
    });

    it('should perform symmetric difference', () => {
      const other = new ImmutableCollection([
        ['b', 20],
        ['d', 4],
      ]);

      const result = collection.symmetricDifference(other);

      expect(result).not.toBe(collection);
      expect(result.size).toBe(3);
      expect(result.get('a')).toBe(1);
      expect(result.has('b')).toBe(false);
      expect(result.get('c')).toBe(3);
      expect(result.get('d')).toBe(4);
    });

    it('should return same instance if both empty in symmetric difference', () => {
      const empty1 = new ImmutableCollection<string, number>();
      const empty2 = new ImmutableCollection<string, number>();

      const result = empty1.symmetricDifference(empty2);

      expect(result).toBe(empty1);
    });
  });

  describe('Sort operations', () => {
    it('should sort and return new instance', () => {
      const unsorted = new ImmutableCollection([
        ['c', 3],
        ['a', 1],
        ['b', 2],
      ]);

      const sorted = unsorted.sort();

      expect(sorted).not.toBe(unsorted);
      const entries = Array.from(sorted.entries());
      expect(entries[0]).toEqual(['a', 1]);
      expect(entries[1]).toEqual(['b', 2]);
      expect(entries[2]).toEqual(['c', 3]);
    });

    it('should return same instance if already sorted', () => {
      const sorted = collection.sort(); // Already sorted by key

      expect(sorted).toBe(collection);
    });

    it('lazy takeIter/skipIter do not allocate full arrays', () => {
      const t = Array.from((collection as any).takeIter(2));
      expect(t).toEqual([
        ['a', 1],
        ['b', 2],
      ]);
      const s = Array.from((collection as any).skipIter(2));
      expect(s).toEqual([['c', 3]]);
    });

    it('should return same instance on sort with 0 or 1 elements', () => {
      const empty = new ImmutableCollection<string, number>();
      const single = new ImmutableCollection([['a', 1]]);

      expect(empty.sort()).toBe(empty);
      expect(single.sort()).toBe(single);
    });

    it('should reverse and return new instance', () => {
      const reversed = collection.reverse();

      expect(reversed).not.toBe(collection);
      const entries = Array.from(reversed.entries());
      expect(entries[0]).toEqual(['c', 3]);
      expect(entries[1]).toEqual(['b', 2]);
      expect(entries[2]).toEqual(['a', 1]);
    });

    it('should return same instance on reverse with 0 or 1 elements', () => {
      const empty = new ImmutableCollection<string, number>();
      const single = new ImmutableCollection([['a', 1]]);

      expect(empty.reverse()).toBe(empty);
      expect(single.reverse()).toBe(single);
    });
  });

  describe('Merge operations', () => {
    it('should merge collections', () => {
      const other1 = new ImmutableCollection([['d', 4]]);
      const other2 = new ImmutableCollection([
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

    it('should return same instance if merge adds nothing', () => {
      const empty = new ImmutableCollection<string, number>();
      const result = collection.merge(empty);

      expect(result).toBe(collection);
    });
  });

  describe('Batch mutations', () => {
    it('should perform batch mutations efficiently', () => {
      const result = collection.withMutations((mutable) => {
        mutable.set('a', 10);
        mutable.set('d', 4);
        mutable.delete('b');
      });

      expect(result).not.toBe(collection);
      expect(result.size).toBe(3);
      expect(result.get('a')).toBe(10);
      expect(result.has('b')).toBe(false);
      expect(result.get('d')).toBe(4);
    });

    it('should return same instance if no actual changes', () => {
      const result = collection.withMutations((mutable) => {
        mutable.set('a', 1); // Same value
        mutable.delete('z'); // Doesn't exist
      });

      expect(result).toBe(collection);
    });
  });

  describe('Conversion operations', () => {
    it('should convert to array', () => {
      const array = collection.toArray();

      expect(array).toEqual([
        ['a', 1],
        ['b', 2],
        ['c', 3],
      ]);
    });

    it('should convert to object', () => {
      const obj = collection.toObject();

      expect(obj).toEqual({
        a: 1,
        b: 2,
        c: 3,
      });
    });

    it('should convert to Map', () => {
      const map = collection.toMap();

      expect(map).toBeInstanceOf(Map);
      expect(map.size).toBe(3);
      expect(map.get('a')).toBe(1);
    });

    it('should convert to Set of values', () => {
      const set = collection.toSet();

      expect(set).toBeInstanceOf(Set);
      expect(set.size).toBe(3);
      expect(set.has(1)).toBe(true);
      expect(set.has(2)).toBe(true);
      expect(set.has(3)).toBe(true);
    });

    it('should convert to JSON', () => {
      const json = collection.toJSON();

      expect(json).toEqual([
        ['a', 1],
        ['b', 2],
        ['c', 3],
      ]);
    });
  });

  describe('mergeWithKeep', () => {
    it('treats undefined values as present in self', () => {
      const base = new ImmutableCollection<string, number | undefined>([['a', undefined]]);
      const other = new ImmutableCollection<string, string>();

      const result = base.mergeWithKeep(
        other,
        () => ({ keep: true, value: 'self' }),
        () => ({ keep: true, value: 'other' }),
        () => ({ keep: true, value: 'both' }),
      );

      expect(result.get('a')).toBe('self');
    });
  });

  describe('Static methods', () => {
    it('should create from entries', () => {
      const coll = ImmutableCollection.from([
        ['x', 1],
        ['y', 2],
      ]);

      expect(coll.size).toBe(2);
      expect(coll.get('x')).toBe(1);
    });

    it('should create from individual entries', () => {
      const coll = ImmutableCollection.of(['x', 1], ['y', 2]);

      expect(coll.size).toBe(2);
      expect(coll.get('y')).toBe(2);
    });

    it('should create empty collection', () => {
      const coll = ImmutableCollection.empty<string, number>();

      expect(coll.size).toBe(0);
    });

    it('should check if value is immutable', () => {
      expect(ImmutableCollection.isImmutable(collection)).toBe(true);
      expect(ImmutableCollection.isImmutable(new Map())).toBe(false);
      expect(ImmutableCollection.isImmutable(null)).toBe(false);
      expect(ImmutableCollection.isImmutable({})).toBe(false);
    });
  });

  describe('Properties', () => {
    it('should have isImmutable property', () => {
      expect(collection.isImmutable).toBe(true);
    });

    it('should be iterable', () => {
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
  });

  it('equals uses Object.is semantics (NaN equal, -0/+0 not equal)', () => {
    const n1 = new ImmutableCollection<string, number>([['x', Number.NaN]]);
    const n2 = new ImmutableCollection<string, number>([['x', Number.NaN]]);
    expect(n1.equals(n2)).toBe(true);

    const z1 = new ImmutableCollection<string, number>([['z', -0]]);
    const z2 = new ImmutableCollection<string, number>([['z', +0]]);
    expect(z1.equals(z2)).toBe(false);
  });
});
