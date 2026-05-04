import { describe, expect, it } from 'vitest';
import {
  createImmutableCollection,
  createMutableCollection,
} from '../core/createCollection';
import { Seq } from '../seq';
import type { ReadableCollection } from '../types/interfaces';

describe('BatchOps', () => {
  it('groupBy/countBy/unique/uniqueBy/takeWhile/skipWhile/flip', () => {
    // Use createMutableCollection which includes all mixins
    const c = createMutableCollection<string, number>([
      ['a', 1],
      ['b', 2],
      ['c', 2],
      ['d', 3],
    ]);

    const g = c.groupBy((v: number) => v % 2);
    const group0 = g.get(0) as ReadableCollection<string, number> | undefined;
    const group1 = g.get(1) as ReadableCollection<string, number> | undefined;
    // Check that both groups exist
    expect(group0).toBeDefined();
    expect(group1).toBeDefined();
    // Now check sizes - use optional chaining to satisfy TypeScript
    expect((group0?.size ?? 0) + (group1?.size ?? 0)).toBe(4);

    const cnt = c.countBy((v: number) => (v > 1 ? 'gt1' : 'le1'));
    expect(cnt.get('gt1')).toBe(3);
    expect(cnt.get('le1')).toBe(1);

    const uq = c.unique();
    expect(uq.size).toBe(3);
    const uqBy = c.uniqueBy((v: number) => v % 2);
    expect(uqBy.size).toBe(2);

    const tw = c.takeWhile((v: number) => v < 3);
    expect(tw.size).toBe(3);
    const sw = c.skipWhile((v: number) => v < 3);
    expect(sw.size).toBe(1);

    const flipped = c.flip();
    // flip swaps key/value; values here are not unique, size should be <= keys count
    expect([...flipped.values()]).toContain('d');

    // edge: takeWhile all true
    const all = c.takeWhile(() => true);
    expect(all.size).toBe(4);
    // edge: takeWhile none true (predicate false from start)
    const none = c.takeWhile(() => false);
    expect(none.size).toBe(0);

    // edge: skipWhile all true -> empty, none true -> same size
    const skipAll = c.skipWhile(() => true);
    expect(skipAll.size).toBe(0);
    const skipNone = c.skipWhile(() => false);
    expect(skipNone.size).toBe(4);
  });

  it('withMutations works correctly on mutable collections', () => {
    const c = createMutableCollection<string, number>([['a', 1]]);
    const res = c.withMutations((mutable) => {
      mutable.set('b', 2);
      mutable.delete('a');
    });

    expect(res.has('a')).toBe(false);
    expect(res.get('b')).toBe(2);
    // For mutable, it returns the same instance
    expect(res).toBe(c);
  });

  it('withMutations works correctly on immutable collections', () => {
    const c = createImmutableCollection<string, number>([['a', 1]]);
    const res = c.withMutations((mutable) => {
      mutable.set('b', 2);
      mutable.delete('a');
    });

    // Original is unchanged
    expect(c.has('a')).toBe(true);
    expect(c.has('b')).toBe(false);

    // New collection has the changes
    expect(res.has('a')).toBe(false);
    expect(res.get('b')).toBe(2);
    expect(res).not.toBe(c);
  });

  it('asMutable and asImmutable switch modes', () => {
    const immutable = createImmutableCollection<string, number>([['a', 1]]);

    // asMutable() returns a mutable collection with WritableCollection interface
    const mutable = immutable.asMutable();
    mutable.set('b', 2);

    expect(mutable.get('b')).toBe(2);

    // Original immutable is unchanged (immutable returns new instance on set)
    const immutableAfterSet = immutable.set('c', 3);
    expect(immutable.has('c')).toBe(false); // Original unchanged
    expect(immutableAfterSet.has('c')).toBe(true); // New instance has the change

    // Convert back to immutable
    const immutableAgain = mutable.asImmutable();
    // Need to cast because immutableAgain doesn't have set() method in its type
    const newImmutable = (immutableAgain as any).set('c', 3);
    expect(immutableAgain.has('c')).toBe(false);
    expect(newImmutable.has('c')).toBe(true);
  });

  it('toSeq converts collection to a lazy sequence', () => {
    const c = createMutableCollection<string, number>([['a', 1]]);
    const seq = c.toSeq();
    expect(seq).toBeInstanceOf(Seq);

    const result = seq
      .map((v: number) => v * 10)
      .filter((v: number) => v > 5)
      .toArray();

    expect(result).toEqual([10]);
  });
});
