import { describe, expect, it } from 'vitest';
import { chunk, filterMap, reject, zip, zipWithIndex } from './transform';
import { duplicates, isDisjoint, isSubset, isSuperset, uniqueBy } from './set';
import { frequency, max, median, min, minMax, mode } from './aggregate';
import {
  every,
  find,
  findKey,
  findLast,
  findLastKey,
  includes,
  some,
} from './search';

describe('operations edge cases', () => {
  const entries: Array<[string, number]> = [
    ['a', 1],
    ['b', 2],
    ['c', 3],
  ];

  it('chunk size 1 and > length', () => {
    expect(Array.from(chunk(entries, 1))).toEqual([
      [['a', 1]],
      [['b', 2]],
      [['c', 3]],
    ]);
    expect(Array.from(chunk(entries, 10))).toEqual([entries]);
  });

  it('uniqueBy with collisions', () => {
    const res = uniqueBy(entries, (v) => v % 2);
    expect(Array.from(res.values()).sort()).toEqual([1, 2]);
  });

  it('set algebra helpers', () => {
    const a = entries;
    const b: Array<[string, number]> = [
      ['b', 2],
      ['d', 4],
    ];
    expect(isSubset(b, a)).toBe(false);
    expect(isSuperset(a, b)).toBe(false);
    expect(isDisjoint(a, [['x', 9]])).toBe(true);
    const dups = duplicates(
      [
        ['x', 1],
        ['y', 1],
        ['z', 2],
      ],
      (v) => v,
    );
    expect(dups.length).toBe(2);
  });

  it('transform zip/zipWithIndex/reject/filterMap', () => {
    const zipped = Array.from(zip(entries, entries));
    expect(zipped.length).toBe(3);
    const withIdx = Array.from(zipWithIndex(entries));
    expect(withIdx[2][1]).toBe(2);
    const r = reject(entries, (v) => v < 2);
    expect(Array.from(r.values())).toEqual([2, 3]);
    const fm = filterMap(entries, (v) => (v % 2 === 0 ? v * 10 : undefined));
    expect(fm).toEqual([20]);
  });

  it('search find/findKey/findLast/findLastKey includes/some/every', () => {
    expect(find(entries, (v) => v > 2)).toBe(3);
    expect(findKey(entries, (v) => v === 2)).toBe('b');
    expect(findLast(entries, (v) => v >= 2)).toBe(3);
    expect(findLastKey(entries, (v) => v >= 2)).toBe('c');
    expect(includes(entries, 1)).toBe(true);
    expect(some(entries, (v) => v === 2)).toBe(true);
    expect(every(entries, (v) => v >= 1)).toBe(true);
  });

  it('aggregate min/max/minMax/median/mode/frequency', () => {
    expect(min(entries as any)).toBe(1);
    expect(max(entries as any)).toBe(3);
    expect(minMax(entries)).toEqual([1, 3]);
    expect(median(entries as any)).toBe(2);
    expect(mode(entries)).toBe(1); // first is fine with equal counts
    expect(Array.from(frequency(entries).entries()).length).toBe(3);
  });
});
