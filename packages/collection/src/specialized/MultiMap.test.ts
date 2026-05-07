import { describe, expect, it } from 'vitest';
import { MultiMap } from './MultiMap';

describe('MultiMap', () => {
  it('adds and retrieves multiple values per key', () => {
    const mm = new MultiMap<string, number>();
    mm.add('a', 1).add('a', 2).add('b', 3);

    expect(mm.getAll('a').toSorted()).toEqual([1, 2]);
    expect(mm.getFirst('a')).toBe(1);
    expect(mm.totalValues).toBe(3);
  });

  it('removes value and cleans up empty keys', () => {
    const mm = new MultiMap<string, number>();
    mm.add('a', 1).add('a', 2);
    expect(mm.removeValue('a', 1)).toBe(true);
    expect(mm.getAll('a')).toEqual([2]);
    expect(mm.removeValue('a', 2)).toBe(true);
    expect(mm.has('a')).toBe(false);
  });
});
