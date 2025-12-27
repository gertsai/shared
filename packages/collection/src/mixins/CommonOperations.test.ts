import { describe, expect, it } from 'vitest';
import { withCommonOps } from './CommonOperations';
import { MutableCollection } from '../core/MutableCollection';

describe('withCommonOps (CommonOperations)', () => {
  it('adds equals/isEmpty/at/keyAt/random/randomKey/compact/hasAll/hasAny/toString/toJSON/partition', () => {
    const base = new MutableCollection<string, number>([
      ['a', 1],
      ['b', 2],
      ['c', 3],
    ]);

    const coll = withCommonOps(base, (es) => new MutableCollection(es));

    // equals
    const same = new MutableCollection<string, number>([
      ['a', 1],
      ['b', 2],
      ['c', 3],
    ]);
    expect((coll as any).equals(same)).toBe(true);

    // isEmpty
    expect((coll as any).isEmpty()).toBe(false);

    // at/keyAt
    expect((coll as any).at(0)).toBe(1);
    expect((coll as any).keyAt(1)).toBe('b');

    // random / randomKey (non-deterministic; just assert membership/length)
    const r = (coll as any).random();
    expect([1, 2, 3]).toContain(r);
    const r2 = (coll as any).random(2) as number[];
    expect(r2.length).toBe(2);

    const rk = (coll as any).randomKey();
    expect(['a', 'b', 'c']).toContain(rk);
    const rk2 = (coll as any).randomKey(2) as string[];
    expect(rk2.length).toBe(2);

    // hasAll / hasAny
    expect((coll as any).hasAll('a', 'b')).toBe(true);
    expect((coll as any).hasAny('z', 'a')).toBe(true);

    // compact
    const withNulls = new MutableCollection<string, number | null | undefined>([
      ['a', 1],
      ['b', null],
      ['c', 3],
      ['d', undefined],
    ]);
    const withOps = withCommonOps(
      withNulls as any,
      (es) => new MutableCollection(es),
    );
    const compacted = (withOps as any).compact();
    expect(Array.from(compacted.entries())).toEqual([
      ['a', 1],
      ['c', 3],
    ]);

    // toString / toJSON basic shape
    expect(typeof (coll as any).toString()).toBe('string');
    expect((coll as any).toJSON()).toEqual([
      ['a', 1],
      ['b', 2],
      ['c', 3],
    ]);

    // partition
    const [evens, odds] = (coll as any).partition((v: number) => v % 2 === 0);
    expect(evens.get('b')).toBe(2);
    expect(odds.get('a')).toBe(1);
  });
});
