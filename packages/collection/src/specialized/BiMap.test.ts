import { describe, expect, it } from 'vitest';
import { BiMap } from './BiMap';

describe('BiMap', () => {
  it('maintains one-to-one mapping with upsert', () => {
    const bm = new BiMap<string, string>();
    bm.set('a', 'x');
    bm.set('b', 'y');
    // upsert value y to key a should remove previous key b
    bm.upsert('a', 'y');
    expect(bm.get('a')).toBe('y');
    expect(bm.has('b')).toBe(false);
  });

  it('delete by value works and inverse stays consistent', () => {
    const bm = new BiMap<string, number>([
      ['a', 1],
      ['b', 2],
    ]);
    expect(bm.deleteValue(1)).toBe(true);
    expect(bm.has('a')).toBe(false);
    expect(bm.isConsistent()).toBe(true);
  });

  it('invert produces reversed mapping', () => {
    const bm = new BiMap<string, number>([
      ['a', 1],
      ['b', 2],
    ]);
    const inv = bm.invert();
    expect(inv.get(1)).toBe('a');
    expect(inv.get(2)).toBe('b');
  });
});
