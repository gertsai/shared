// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, vi } from 'vitest';
import { Entity } from './Entity';
import type { EntityOpts } from './types';

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

  it('$patch mutates data and emits "patched" with payload', () => {
    const e = new TestEntity({ uid: 'u1', data: { name: 'A' } });
    const handler = vi.fn();
    e.on('patched', handler);

    e.$patch({ name: 'B', age: 99 });

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

  it('$patch throws after $destroy', () => {
    const e = new TestEntity();
    e.$destroy();
    expect(() => e.$patch({ name: 'X' })).toThrow(/destroyed Entity/);
  });
});
