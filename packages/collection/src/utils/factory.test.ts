import { describe, expect, it } from 'vitest';
import {
  createCollectionFrom,
  createEmptyLike,
  createFilteredCollection,
  createMappedKeysCollection,
  createMappedValuesCollection,
  ensureCollection,
} from './factory';
import { MutableCollection } from '../core/MutableCollection';
import { ImmutableCollection } from '../core/ImmutableCollection';
import { BaseCollection } from '../core/BaseCollection';

describe('utils/factory', () => {
  it('createCollectionFrom preserves source mutability', () => {
    const m = new MutableCollection<string, number>([['a', 1]]);
    const res1 = createCollectionFrom(m, [['b', 2]]);
    expect(res1).toBeInstanceOf(MutableCollection);

    const im = new ImmutableCollection<string, number>([['a', 1]]);
    const res2 = createCollectionFrom(im, [['b', 2]]);
    expect(res2).toBeInstanceOf(ImmutableCollection);

    const base = new BaseCollection<string, number>([['a', 1]]);
    const res3 = createCollectionFrom(base, [['b', 2]]);
    expect(res3).toBeInstanceOf(BaseCollection);

    const map = new Map<string, number>([['a', 1]]);
    const res4 = createCollectionFrom(map as any, [['b', 2]]);
    expect(res4).toBeInstanceOf(MutableCollection);
  });

  it('createFilteredCollection filters items', () => {
    const m = new MutableCollection<string, number>([
      ['a', 1],
      ['b', 2],
      ['c', 3],
    ]);
    const filtered = createFilteredCollection(m, (v) => v >= 2);
    expect(Array.from(filtered.entries())).toEqual([
      ['b', 2],
      ['c', 3],
    ]);
  });

  it('createFilteredCollection all-false returns empty of same kind', () => {
    const m = new MutableCollection<string, number>([['a', 1]]);
    const res = createFilteredCollection(m, () => false);
    expect(res.size).toBe(0);
    expect(res.constructor.name.includes('MutableCollection')).toBe(true);

    const im = new ImmutableCollection<string, number>([['a', 1]]);
    const resIm = createFilteredCollection(im, () => false);
    expect(resIm.size).toBe(0);
    expect(resIm.constructor.name.includes('ImmutableCollection')).toBe(true);
  });

  it('createMappedValuesCollection maps values with same mutability', () => {
    const im = new ImmutableCollection<string, number>([['a', 1]]);
    const mappedIm = createMappedValuesCollection(im, (v) => v + 1);
    expect(mappedIm).toBeInstanceOf(ImmutableCollection);
    expect(mappedIm.get('a')).toBe(2);

    const m = new MutableCollection<string, number>([['a', 1]]);
    const mappedM = createMappedValuesCollection(m, (v) => v + 1);
    expect(mappedM).toBeInstanceOf(MutableCollection);
    expect(mappedM.get('a')).toBe(2);
  });

  it('createMappedKeysCollection maps keys with same mutability', () => {
    const im = new ImmutableCollection<string, number>([['a', 1]]);
    const mappedIm = createMappedKeysCollection(im, (k) => `${k}!`);
    expect(mappedIm).toBeInstanceOf(ImmutableCollection);
    expect(mappedIm.get('a!')).toBe(1);

    const m = new MutableCollection<string, number>([['a', 1]]);
    const mappedM = createMappedKeysCollection(m, (k) => `${k}!`);
    expect(mappedM).toBeInstanceOf(MutableCollection);
    expect(mappedM.get('a!')).toBe(1);
  });

  it('createEmptyLike produces empty collection of same kind', () => {
    expect(
      createEmptyLike(new ImmutableCollection()).constructor.name.includes(
        'ImmutableCollection',
      ),
    ).toBe(true);
    expect(
      createEmptyLike(new MutableCollection()).constructor.name.includes(
        'MutableCollection',
      ),
    ).toBe(true);
    expect(
      createEmptyLike(new BaseCollection()).constructor.name.includes(
        'BaseCollection',
      ),
    ).toBe(true);
  });

  it('ensureCollection wraps Map or Iterable into MutableCollection', () => {
    const fromMap = ensureCollection(new Map([['a', 1]]));
    // Validate behavior rather than constructor
    (fromMap as MutableCollection<string, number>).set('b', 2);
    expect(fromMap.get('b')).toBe(2);

    const fromIterable = ensureCollection([
      ['x', 1],
      ['y', 2],
    ] as Iterable<[string, number]>);
    (fromIterable as MutableCollection<string, number>).set('z', 9);
    expect(fromIterable.get('z')).toBe(9);

    const existing = new MutableCollection<string, number>([['a', 1]]);
    expect(ensureCollection(existing)).toBe(existing);
  });
});
