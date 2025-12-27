import { describe, expect, it } from 'vitest';
import { BaseCollection } from './BaseCollection';

describe('BaseCollection', () => {
  it('constructs from entries and exposes basic getters', () => {
    const c = new BaseCollection<string, number>([
      ['a', 1],
      ['b', 2],
    ]);
    expect(c.size).toBe(2);
    expect(c.get('a')).toBe(1);
    expect(c.has('z')).toBe(false);
  });

  it('is iterable and supports forEach with thisArg', () => {
    const c = new BaseCollection<string, number>([
      ['x', 10],
      ['y', 20],
    ]);
    const seen: Array<[string, number]> = [];
    const ctx = { mul: 2 };
    c.forEach(function (this: typeof ctx, v, k) {
      seen.push([k, v * this.mul]);
    }, ctx);
    expect(seen).toEqual([
      ['x', 20],
      ['y', 40],
    ]);
    expect(Array.from(c)).toEqual([
      ['x', 10],
      ['y', 20],
    ]);
  });

  it('search operations find/findKey/some/every/filter', () => {
    const c = new BaseCollection<string, number>([
      ['a', 1],
      ['b', 2],
      ['c', 3],
    ]);
    expect(c.find((v) => v > 1)).toBe(2);
    expect(c.findKey((v) => v === 3)).toBe('c');
    expect(c.some((v) => v === 2)).toBe(true);
    expect(c.every((v) => v > 0)).toBe(true);

    const filtered = c.filter((v) => v >= 2);
    expect(filtered).not.toBe(c);
    expect(Array.from(filtered.entries())).toEqual([
      ['b', 2],
      ['c', 3],
    ]);
    // lazy filterIter
    const lazy = Array.from((c as any).filterIter((v: number) => v > 1));
    expect(lazy).toEqual([
      ['b', 2],
      ['c', 3],
    ]);
  });

  it('transform operations map/mapArray/mapValues/mapKeys/flatMap/flatMapArray/flatMapCollection', () => {
    const c = new BaseCollection<string, number>([
      ['a', 1],
      ['b', 2],
    ]);
    expect(c.map((v) => v * 2)).toEqual([2, 4]);
    expect((c as any).mapArray((v: number) => v * 3)).toEqual([3, 6]);

    const mv = c.mapValues((v) => v + 1);
    expect(Array.from(mv.entries())).toEqual([
      ['a', 2],
      ['b', 3],
    ]);

    const mk = c.mapKeys((k) => `${k}!`);
    expect(Array.from(mk.entries())).toEqual([
      ['a!', 1],
      ['b!', 2],
    ]);

    expect(c.flatMap((v) => [v, v * 10])).toEqual([1, 10, 2, 20]);
    expect((c as any).flatMapArray((v: number) => [v, v + 1])).toEqual([
      1, 2, 2, 3,
    ]);

    const fm = c.flatMapCollection((v, k) => new BaseCollection([[k, v * 3]]));
    expect(Array.from(fm.entries())).toEqual([
      ['a', 3],
      ['b', 6],
    ]);
  });

  it('mapEntriesCollection maps key and value into a new collection', () => {
    const c = new BaseCollection<string, number>([
      ['a', 1],
      ['b', 2],
    ]);
    const mapped = (c as any).mapEntriesCollection((k: string, v: number) => [
      k.toUpperCase(),
      v * 5,
    ]);
    expect(Array.from(mapped.entries())).toEqual([
      ['A', 5],
      ['B', 10],
    ]);
    // original unchanged
    expect(c.get('a')).toBe(1);
    expect(c.get('b')).toBe(2);
  });

  it('aggregate operations reduce/groupBy/count', () => {
    const c = new BaseCollection<string, number>([
      ['a', 1],
      ['b', 2],
      ['c', 1],
    ]);
    expect(c.reduce((acc, v) => acc + v, 0)).toBe(4);
    const g = c.groupBy((v) => v);
    expect(g.get(1)).toEqual([
      ['a', 1],
      ['c', 1],
    ]);
    expect(c.count((v) => v === 1)).toBe(2);
  });

  it('conversions toArray/toObject/toObjectWithKey/toMap/toSet', () => {
    const c = new BaseCollection<string, number>([
      ['a', 1],
      ['b', 2],
    ]);
    expect(c.toArray()).toEqual([
      ['a', 1],
      ['b', 2],
    ]);
    expect(c.toObject()).toEqual({ a: 1, b: 2 });
    expect(c.toObjectWithKey((k) => `:${k}` as const)).toEqual({
      ':a': 1,
      ':b': 2,
    });
    const m = c.toMap();
    expect(m).toBeInstanceOf(Map);
    expect(m.get('a')).toBe(1);
    const s = c.toSet();
    expect(s).toBeInstanceOf(Set);
    expect(s.has(2)).toBe(true);
  });

  it('utils isEmpty/first/last/take/skip/equals/clone/toString', () => {
    const c = new BaseCollection<string, number>([
      ['a', 1],
      ['b', 2],
      ['c', 3],
    ]);
    expect(c.isEmpty()).toBe(false);
    expect(c.first()).toBe(1);
    expect(c.last()).toBe(3);
    expect(c.take(2)).toEqual([
      ['a', 1],
      ['b', 2],
    ]);
    expect(c.skip(2)).toEqual([['c', 3]]);
    // lazy iterators
    expect(Array.from((c as any).takeIter(2))).toEqual([
      ['a', 1],
      ['b', 2],
    ]);
    expect(Array.from((c as any).skipIter(2))).toEqual([['c', 3]]);
    const same = new BaseCollection<string, number>([
      ['a', 1],
      ['b', 2],
      ['c', 3],
    ]);
    expect(c.equals(same)).toBe(true);
    const clone = c.clone();
    expect(clone).not.toBe(c);
    expect(clone.equals(c)).toBe(true);
    expect(typeof c.toString()).toBe('string');
  });

  it('equals uses Object.is semantics (NaN equal, -0/+0 not equal)', () => {
    const a = new BaseCollection<string, number>([['x', Number.NaN]]);
    const b = new BaseCollection<string, number>([['x', Number.NaN]]);
    expect(a.equals(b)).toBe(true);

    const c1 = new BaseCollection<string, number>([['z', -0]]);
    const c2 = new BaseCollection<string, number>([['z', +0]]);
    expect(c1.equals(c2)).toBe(false);
  });
});
