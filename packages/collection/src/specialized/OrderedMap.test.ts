import { describe, expect, it } from 'vitest';
import { OrderedMap } from './OrderedMap';

describe('OrderedMap', () => {
  it('maintains insertion order and supports moves', () => {
    const om = new OrderedMap<string, number>();
    om.set('a', 1).set('b', 2).set('c', 3);
    expect(Array.from(om.entries())).toEqual([
      ['a', 1],
      ['b', 2],
      ['c', 3],
    ]);
    om.moveToFront('c');
    expect(Array.from(om.entries())).toEqual([
      ['c', 3],
      ['a', 1],
      ['b', 2],
    ]);
    om.moveToBack('c');
    expect(Array.from(om.entries())).toEqual([
      ['a', 1],
      ['b', 2],
      ['c', 3],
    ]);
    expect(om.isConsistent()).toBe(true);
  });

  it('no-op moves for missing key keep consistency', () => {
    const om = new OrderedMap<string, number>();
    om.set('a', 1).set('b', 2);
    om.moveToFront('missing');
    om.moveToBack('missing');
    expect(Array.from(om.entries())).toEqual([
      ['a', 1],
      ['b', 2],
    ]);
    expect(om.isConsistent()).toBe(true);
  });
});
