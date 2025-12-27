import { describe, expect, it } from 'vitest';
import { Seq, cachedSeq } from './seq';

describe('Seq cache semantics', () => {
  it('withCache caches results across iterations', () => {
    const data: Array<[string, number]> = [
      ['a', 1],
      ['b', 2],
      ['c', 3],
      ['d', 4],
      ['e', 5],
    ];
    let calls = 0;
    const s = new Seq<string, number>(data)
      .filter((v) => {
        calls++;
        return v > 2;
      })
      .withCache();

    expect(s.toArray()).toEqual([3, 4, 5]);
    expect(calls).toBe(5);
    // second iteration should be cached
    expect(s.toArray()).toEqual([3, 4, 5]);
    expect(calls).toBe(5);
  });

  it('cachedSeq materializes source and supports repeated chains', () => {
    let iters = 0;
    function* gen(): Generator<[string, number]> {
      iters++;
      yield ['a', 1];
      yield ['b', 2];
      yield ['c', 3];
    }

    const s = cachedSeq(gen());
    expect(
      s
        .filter((v) => v > 1)
        .map((v) => v * 2)
        .toArray(),
    ).toEqual([4, 6]);
    expect(s.take(2).toArray()).toEqual([1, 2]);
    expect(iters).toBe(1);
  });

  it('invalidateCache resets cached results', () => {
    const data: Array<[string, number]> = [
      ['a', 1],
      ['b', 2],
      ['c', 3],
      ['d', 4],
      ['e', 5],
    ];
    let calls = 0;
    const s = new Seq<string, number>(data)
      .filter((v) => {
        calls++;
        return v >= 1;
      })
      .withCache();

    expect(s.toArray()).toEqual([1, 2, 3, 4, 5]);
    expect(calls).toBe(5);
    // Cached
    expect(s.toArray()).toEqual([1, 2, 3, 4, 5]);
    expect(calls).toBe(5);
    // Invalidate and re-run
    s.invalidateCache();
    expect(s.toArray()).toEqual([1, 2, 3, 4, 5]);
    expect(calls).toBe(10);
  });

  it('different chains do not share operation-level cache', () => {
    const data: Array<[string, number]> = [
      ['a', 1],
      ['b', 2],
      ['c', 3],
    ];
    const base = new Seq<string, number>(data).withCache();

    let f1 = 0;
    const r1 = base
      .filter((v) => {
        f1++;
        return v > 1;
      })
      .toArray();
    expect(r1).toEqual([2, 3]);

    let f2 = 0;
    const r2 = base
      .map((v) => {
        f2++;
        return v * 1;
      })
      .toArray();
    expect(r2).toEqual([1, 2, 3]);

    expect(f1).toBe(3);
    expect(f2).toBe(3);
  });

  it('toString reflects operations count', () => {
    const data: Array<[string, number]> = [
      ['a', 1],
      ['b', 2],
    ];
    const s0 = new Seq<string, number>(data);
    expect(s0.toString()).toContain('operations: 0');
    const s1 = s0.filter((v) => v > 0);
    expect(s1.toString()).toContain('operations: 1');
    const s2 = s1.map((v) => v * 2);
    expect(s2.toString()).toContain('operations: 2');
  });
});
