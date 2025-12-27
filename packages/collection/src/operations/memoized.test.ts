import { describe, expect, it } from 'vitest';
import {
  createMemoizedBatch,
  memoizedChunk,
  memoizedFilter,
  memoizedFind,
  memoizedMap,
  memoizedMapValues,
  memoizedReduce,
  memoizedSort,
  withMemoization,
} from './memoized';

describe('operations/memoized', () => {
  const map = new Map<string, number>([
    ['a', 1],
    ['b', 2],
    ['c', 3],
  ]);

  it('memoizedMap returns cached array instance for same inputs', () => {
    const r1 = memoizedMap(map, (v) => v * 2);
    const r2 = memoizedMap(map, (v) => v * 2);
    expect(r1).toBe(r2);
    expect(r1).toEqual([2, 4, 6]);
  });

  it('memoizedMapValues returns cached Map instance for same inputs', () => {
    const r1 = memoizedMapValues(map, (v) => v + 1);
    const r2 = memoizedMapValues(map, (v) => v + 1);
    expect(r1).toBe(r2);
    expect(Array.from(r1.entries())).toEqual([
      ['a', 2],
      ['b', 3],
      ['c', 4],
    ]);
  });

  it('memoizedFilter/find/reduce/sort/chunk cache by arguments', () => {
    const f1 = memoizedFilter(map, (v) => v % 2 === 1);
    const f2 = memoizedFilter(map, (v) => v % 2 === 1);
    expect(f1).toBe(f2);

    const found1 = memoizedFind(map, (v) => v > 2);
    const found2 = memoizedFind(map, (v) => v > 2);
    expect(found1).toBe(found2);

    const sum1 = memoizedReduce(map, (acc, v) => acc + v, 0);
    const sum2 = memoizedReduce(map, (acc, v) => acc + v, 0);
    expect(sum1).toBe(sum2);
    expect(sum1).toBe(6);

    const s1 = memoizedSort(map);
    const s2 = memoizedSort(map);
    expect(s1).toBe(s2);

    const c1 = memoizedChunk(map, 2);
    const c2 = memoizedChunk(map, 2);
    expect(c1).toBe(c2);
    const chunks = Array.from(c1);
    expect(chunks.length).toBe(2);
  });

  it('withMemoization wraps and caches results', () => {
    const op = (m: Map<string, number>, mul: number) =>
      Array.from(m.values()).map((v) => v * mul);
    const wrapped = withMemoization(op);
    const r1 = wrapped(map, 3);
    const r2 = wrapped(map, 3);
    expect(r1).toBe(r2);
    expect(r1).toEqual([3, 6, 9]);
  });

  it('createMemoizedBatch memoizes multiple ops and supports clearCache', () => {
    const ops = createMemoizedBatch({
      f: (x: number) => x * 2,
      g: (x: number) => x + 1,
    });
    const a1 = ops.f(5);
    const a2 = ops.f(5);
    expect(a1).toBe(a2);
    const b1 = ops.g(10);
    const b2 = ops.g(10);
    expect(b1).toBe(b2);
    // clearCache should not throw and subsequent calls still work
    ops.clearCache();
    const a3 = ops.f(5);
    expect(a3).toBe(10);
  });
});
