import { describe, expect, it } from 'vitest';
import { createMutableCollection } from '../core/createCollection';

describe('PositionalAccess', () => {
  it('at/keyAt/firstKey/lastKey/firstEntry/lastEntry', () => {
    const c = createMutableCollection<string, number>([
      ['a', 1],
      ['b', 2],
      ['c', 3],
    ]);
    expect((c as any).at(0)).toBe(1);
    expect((c as any).at(-1)).toBe(3);
    expect((c as any).keyAt(1)).toBe('b');
    expect((c as any).firstKey()).toBe('a');
    expect((c as any).lastKey()).toBe('c');
    expect((c as any).firstEntry()).toEqual(['a', 1]);
    expect((c as any).lastEntry()).toEqual(['c', 3]);
  });

  it('out of range returns undefined', () => {
    const c = createMutableCollection<string, number>([['a', 1]]);
    expect((c as any).at(5)).toBeUndefined();
    expect((c as any).keyAt(-5)).toBeUndefined();
  });

  it('resolves methods via prototype when feature flag enabled', () => {
    const prev = (globalThis as Record<string, unknown>)
      .__ORCH_COLLECTION_USE_PROTO_MIXINS__;
    (
      globalThis as Record<string, unknown>
    ).__ORCH_COLLECTION_USE_PROTO_MIXINS__ = true;
    try {
      const c = createMutableCollection<string, number>([
        ['a', 1],
        ['b', 2],
        ['c', 3],
      ]);
      // Methods should be available and work correctly via prototype
      expect((c as any).at(1)).toBe(2);
      expect((c as any).keyAt(-1)).toBe('c');
      expect((c as any).firstKey()).toBe('a');
      expect((c as any).lastKey()).toBe('c');
      expect((c as any).firstEntry()).toEqual(['a', 1]);
      expect((c as any).lastEntry()).toEqual(['c', 3]);
    } finally {
      if (prev === undefined) {
        delete (globalThis as Record<string, unknown>)
          .__ORCH_COLLECTION_USE_PROTO_MIXINS__;
      } else {
        (
          globalThis as Record<string, unknown>
        ).__ORCH_COLLECTION_USE_PROTO_MIXINS__ = prev;
      }
    }
  });
});
