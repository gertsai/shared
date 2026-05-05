// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, vi } from 'vitest';
import { Entity } from './Entity';
import { plainReactiveAdapter } from './adapters/plain';
import type { EntityOpts, ReactiveAdapter } from './types';

interface UserData {
  name: string;
  age: number;
  active: boolean;
}

class TestEntity extends Entity<UserData> {
  override $defaultData(): UserData {
    return { name: 'Default', age: 0, active: true };
  }
  constructor(opts: EntityOpts<UserData> = {}) {
    super(opts);
  }
}

describe('Entity', () => {
  it('merges $defaultData with opts.data (data overrides defaults)', () => {
    const e = new TestEntity({ data: { name: 'Alice', age: 30 } });
    expect(e.$data).toEqual({ name: 'Alice', age: 30, active: true });
  });

  it('uses provided uid when given', () => {
    const e = new TestEntity({ uid: 'fixed-uid' });
    expect(e._uuid).toBe('fixed-uid');
  });

  it('generates uid via default UuidProvider (crypto.randomUUID) when omitted', () => {
    const e1 = new TestEntity();
    const e2 = new TestEntity();
    expect(typeof e1._uuid).toBe('string');
    expect(e1._uuid).not.toBe(e2._uuid);
    // RFC 4122 UUID v4 length = 36 chars (8-4-4-4-12).
    expect(e1._uuid.length).toBe(36);
  });

  it('uses custom UuidProvider when supplied', () => {
    const provider = vi.fn(() => 'custom-uid-42');
    const e = new TestEntity({ uuidProvider: provider });
    expect(e._uuid).toBe('custom-uid-42');
    expect(provider).toHaveBeenCalledTimes(1);
  });

  // ---------------- F-6: function-as-uid getter ----------------

  it('uid as function evaluates lazily on every _uuid access', () => {
    const provider = vi.fn(() => 'lazy-uid');
    const e = new TestEntity({ uid: provider });
    // Not called eagerly during construction.
    expect(provider).toHaveBeenCalledTimes(0);
    expect(e._uuid).toBe('lazy-uid');
    expect(e._uuid).toBe('lazy-uid');
    expect(provider).toHaveBeenCalledTimes(2);
  });

  it('uid as function reflects upstream changes (mirrors Orchestra behaviour)', () => {
    let current = 'first';
    const e = new TestEntity({ uid: () => current });
    expect(e._uuid).toBe('first');
    current = 'second';
    expect(e._uuid).toBe('second');
  });

  // ---------------- F-7: uidPath ----------------

  it('exposes opts.uidPath via $uidPath (undefined by default)', () => {
    const e1 = new TestEntity();
    expect(e1.$uidPath).toBeUndefined();
    const path = ['tenant-1', 'project-1', 'entity-1'] as const;
    const e2 = new TestEntity({ uidPath: path });
    expect(e2.$uidPath).toEqual(path);
  });

  // ---------------- F-2: $patch boolean + per-key gating ----------------

  it('$patch mutates data and emits "patched" with payload', () => {
    const e = new TestEntity({ uid: 'u1', data: { name: 'A' } });
    const handler = vi.fn();
    e.on('patched', handler);

    const result = e.$patch({ name: 'B', age: 99 });

    expect(result).toBe(true);
    expect(e.$data.name).toBe('B');
    expect(e.$data.age).toBe(99);
    expect(e.$data.active).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
    const payload = handler.mock.calls[0]![0] as {
      partial: Partial<UserData>;
      data: UserData;
    };
    expect(payload.partial).toEqual({ name: 'B', age: 99 });
    expect(payload.data).toBe(e.$data);
  });

  it('$patch with identical data returns false and does not emit', () => {
    const e = new TestEntity({ data: { name: 'Alice', age: 30 } });
    const handler = vi.fn();
    e.on('patched', handler);

    const result = e.$patch({ name: 'Alice', age: 30 });

    expect(result).toBe(false);
    expect(handler).not.toHaveBeenCalled();
  });

  it('$patch with mixed changed/unchanged keys writes only the changed ones', () => {
    const e = new TestEntity({ data: { name: 'Alice', age: 30 } });
    const handler = vi.fn();
    e.on('patched', handler);

    const result = e.$patch({ name: 'Alice', age: 31 });

    expect(result).toBe(true);
    expect(e.$data.age).toBe(31);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('$patch(partial, false) bypasses equality check and always emits', () => {
    const e = new TestEntity({ data: { name: 'Alice', age: 30 } });
    const handler = vi.fn();
    e.on('patched', handler);

    const result = e.$patch({ name: 'Alice', age: 30 }, false);

    expect(result).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('$patch throws after $destroy', () => {
    const e = new TestEntity();
    e.$destroy();
    expect(() => e.$patch({ name: 'X' })).toThrow(/destroyed Entity/);
  });

  // ---------------- F-4: toJSONObject + toJSON ----------------

  it('toJSONObject returns { _uid, data } in the expected shape', () => {
    const e = new TestEntity({ uid: 'u-42', data: { name: 'Alice', age: 7 } });
    const obj = e.toJSONObject();
    expect(obj).toEqual({
      _uid: 'u-42',
      data: { name: 'Alice', age: 7, active: true },
    });
  });

  it('toJSON round-trips via JSON.parse', () => {
    const e = new TestEntity({ uid: 'u-7', data: { name: 'Bob' } });
    const restored = JSON.parse(e.toJSON()) as {
      _uid: string;
      data: UserData;
    };
    expect(restored._uid).toBe('u-7');
    expect(restored.data).toEqual({ name: 'Bob', age: 0, active: true });
  });

  // ---------------- F-5: markRaw(this) ----------------

  it('calls reactive adapter markRaw(this) during construction', () => {
    const markRawSpy = vi.fn(<T>(v: T): T => v);
    const adapter: ReactiveAdapter = {
      reactive: <T extends object>(t: T) => plainReactiveAdapter.reactive(t),
      markRaw: (v) => {
        markRawSpy(v);
        return v;
      },
      isReactive: () => false,
    };
    const e = new TestEntity({ reactive: adapter });
    expect(markRawSpy).toHaveBeenCalledTimes(1);
    expect(markRawSpy).toHaveBeenCalledWith(e);
  });
});
