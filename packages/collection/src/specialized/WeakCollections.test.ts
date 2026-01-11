import { WeakBiMap, WeakCollection, WeakValueMap } from './index';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

describe('specialized weak collections', () => {
  let originalFR: any;
  let registeredHeldValues: unknown[] = [];

  beforeAll(() => {
    originalFR = (globalThis as any).FinalizationRegistry;
    (globalThis as any).FinalizationRegistry = class {
      register(_target: object, heldValue: unknown) {
        registeredHeldValues.push(heldValue);
      }
      unregister() {}
    };
  });

  afterAll(() => {
    (globalThis as any).FinalizationRegistry = originalFR;
  });

  const resetHeldValues = () => {
    registeredHeldValues = [];
  };
  it('WeakCollection basic set/get/has/delete and metadata', () => {
    resetHeldValues();
    const w = new WeakCollection<object, number>();
    const k1 = {};
    const k2 = {};
    w.set(k1, 1).set(k2, 2);
    expect(w.get(k1)).toBe(1);
    expect(w.has(k2)).toBe(true);
    w.setMetadata(k1, { tag: 't' });
    expect(w.getMetadata(k1)).toEqual({ tag: 't' });
    expect(w.delete(k1)).toBe(true);
    expect(w.get(k1)).toBeUndefined();
    expect(registeredHeldValues[0]).not.toBe(k1);
    expect(registeredHeldValues[1]).not.toBe(k2);
  });

  it('WeakBiMap bidirectional set/get/delete', () => {
    const b = new WeakBiMap<object, object>();
    const k1 = {};
    const v1 = {};
    b.set(k1, v1);
    expect(b.get(k1)).toBe(v1);
    expect(b.getKey(v1)).toBe(k1);
    expect(b.has(k1)).toBe(true);
    expect(b.hasValue(v1)).toBe(true);
    expect(b.delete(k1)).toBe(true);
    expect(b.get(k1)).toBeUndefined();
  });

  it('WeakValueMap keeps strong keys and weak values semantics (no real GC)', () => {
    const m = new WeakValueMap<string, { v: number }>();
    const val = { v: 1 };
    m.set('a', val);
    expect(m.get('a')).toBe(val);
    expect(m.has('a')).toBe(true);
    expect(Array.from(m.keys())).toContain('a');
    expect(Array.from(m.values())).toContain(val);
    expect(Array.from(m.entries())[0][0]).toBe('a');
    expect(m.size).toBe(1);
    expect(m.delete('a')).toBe(true);
    expect(m.get('a')).toBeUndefined();
  });

  it('WeakCollection filter/mapValues with provided keys iterable', () => {
    resetHeldValues();
    const w = new WeakCollection<object, number>();
    const k1 = {};
    const k2 = {};
    const k3 = {};
    w.set(k1, 1).set(k2, 2).set(k3, 3);
    // limit selection by keys [k2, k3]
    const subsetKeys = [k2, k3];
    const filtered = w.filter((v) => v > 2, subsetKeys);
    expect(Array.from(filtered.keys()).length).toBe(1);
    expect(filtered.get(k3)).toBe(3);

    const mapped = w.mapValues((v) => v * 10, subsetKeys);
    expect(mapped.get(k2)).toBe(20);
    expect(mapped.get(k3)).toBe(30);
    expect(mapped.get(k1)).toBeUndefined();
  });

  it('WeakCollection setWithCallback does not retain key as held value', () => {
    resetHeldValues();
    const w = new WeakCollection<object, number>();
    const key = {};
    w.setWithCallback(key, 1, () => {});
    expect(registeredHeldValues[0]).not.toBe(key);
  });

  it('WeakValueMap iterators reflect deletes', () => {
    const m = new WeakValueMap<string, { v: number }>();
    const va = { v: 1 };
    const vb = { v: 2 };
    m.set('a', va).set('b', vb);
    expect(Array.from(m.keys()).sort()).toEqual(['a', 'b']);
    expect(Array.from(m.entries()).length).toBe(2);
    // delete 'a' and ensure iterators reflect the change
    expect(m.delete('a')).toBe(true);
    expect(Array.from(m.keys())).toEqual(['b']);
    const ents = Array.from(m.entries());
    expect(ents.length).toBe(1);
    expect(ents[0][0]).toBe('b');
  });
});
