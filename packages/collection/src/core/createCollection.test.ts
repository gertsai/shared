import { describe, expect, it } from 'vitest';
import {
  createCollection,
  createImmutableCollection,
  createLightweightCollection,
  createLightweightImmutableCollection,
  createMutableCollection,
} from './createCollection';
import { MutableCollection } from './MutableCollection';
import { ImmutableCollection } from './ImmutableCollection';
import { PersistentCollection } from './PersistentCollection';

describe('createCollection factories', () => {
  it('creates mutable with mixins when withAll=true', () => {
    const c = createCollection<string, number>(
      [
        ['a', 1],
        ['b', 2],
      ],
      { immutable: false, withAll: true },
    );
    // runtime checks
    expect(c).toBeInstanceOf(MutableCollection);
    expect(typeof (c as any).withMutations).toBe('function');
    expect(typeof (c as any).getIn).toBe('function');
    expect(typeof (c as any).at).toBe('function');
  });

  it('creates immutable Map engine with mixins', () => {
    const c = createCollection<string, number>(
      [
        ['a', 1],
        ['b', 2],
      ],
      { immutable: true, immutableEngine: 'map', withAll: true },
    );
    expect(c).toBeInstanceOf(ImmutableCollection);
    // extended is intentionally disabled for immutable; but batch/deep/positional apply
    expect(typeof (c as any).withMutations).toBe('function');
    expect(typeof (c as any).getIn).toBe('function');
    expect(typeof (c as any).at).toBe('function');
    expect(typeof (c as any).random).not.toBe('function');
  });

  it('creates persistent (HAMT) and disables all mixins', () => {
    const c = createCollection<string, number>(
      [
        ['a', 1],
        ['b', 2],
      ],
      { immutable: true, immutableEngine: 'hamt', withAll: true },
    );
    expect(c).toBeInstanceOf(PersistentCollection);
    expect((c as any).withMutations).toBeUndefined();
    expect((c as any).getIn).toBeUndefined();
    expect((c as any).random).toBeUndefined();
  });

  it('convenience creators return instances with expected APIs', () => {
    const m = createMutableCollection<string, number>();
    m.set('a', 1);
    expect(m.get('a')).toBe(1);

    const im = createImmutableCollection<string, number>([['x', 1]]);
    const im2 = (im as any).set('x', 2);
    expect(im2).not.toBe(im);
    expect((im2 as any).get('x')).toBe(2);

    const lw = createLightweightCollection<string, number>([['k', 5]]);
    lw.set('q', 7);
    expect(lw.get('q')).toBe(7);

    const lwi = createLightweightImmutableCollection<string, number>([
      ['k', 5],
    ]);
    const lwi2 = (lwi as any).set('k', 6);
    expect(lwi2).not.toBe(lwi);
    expect((lwi2 as any).get('k')).toBe(6);
  });

  it('applies individual mixins on mutable collection', () => {
    const pos = createCollection<string, number>(
      [
        ['a', 1],
        ['b', 2],
      ],
      { immutable: false, withPositional: true },
    );
    expect(typeof (pos as any).at).toBe('function');
    expect((pos as any).firstKey()).toBe('a');

    const deep = createCollection<string, any>([['a', { x: { y: 1 } }]], {
      immutable: false,
      withDeep: true,
    });
    expect((deep as any).getIn(['a', 'x', 'y'])).toBe(1);

    const batch = createCollection<string, number>(
      [
        ['a', 1],
        ['b', 2],
        ['b2', 2],
      ],
      { immutable: false, withBatch: true },
    );
    const uq = (batch as any).unique();
    expect(uq.size).toBe(2);
    const gb = (batch as any).groupBy((v: number) => (v % 2 === 0 ? 'e' : 'o'));
    expect(gb.get('e')?.size ?? 0).toBe(2);
  });

  it('applies individual mixins on immutable Map engine (Extended disabled)', () => {
    const pos = createCollection<string, number>(
      [
        ['a', 1],
        ['b', 2],
      ],
      { immutable: true, immutableEngine: 'map', withPositional: true },
    );
    expect(typeof (pos as any).at).toBe('function');

    const deep = createCollection<string, any>([['a', { x: { y: 1 } }]], {
      immutable: true,
      immutableEngine: 'map',
      withDeep: true,
    });
    expect((deep as any).getIn(['a', 'x', 'y'])).toBe(1);

    const batch = createCollection<string, number>(
      [
        ['a', 1],
        ['b', 2],
        ['b2', 2],
      ],
      { immutable: true, immutableEngine: 'map', withBatch: true },
    );
    const uq = (batch as any).unique();
    expect(uq.size).toBe(2);

    // ExtendedOps should be disabled for immutable variant
    expect(typeof (batch as any).random).toBe('undefined');
  });
});
