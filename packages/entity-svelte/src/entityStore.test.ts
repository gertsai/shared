// SPDX-License-Identifier: Apache-2.0
/**
 * `entityStore<Data>(entity)` — Svelte `Readable<Entity<Data>>` factory
 * (ADR-008 Decision E §2 + Amendment 1.1.1).
 *
 * Verifies:
 *  - return shape is `Readable<Entity<Data>>` (subscribe receives the
 *    entity, not the data) — supports `$store._data.field` and
 *    `$store._uuid` template syntax;
 *  - subscribers fire on subsequent `entity.$patch(...)` mutations;
 *  - unsubscribe stops further notifications.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Entity } from '@gertsai/entity';
import { createMockWritable } from './test-helpers/mock-svelte-store';

vi.mock('svelte/store', () => ({
  writable: <T>(initial: T) => createMockWritable(initial),
}));

let entityStore: typeof import('./entity-store').entityStore;
let svelteReactiveAdapter: typeof import('./adapter').svelteReactiveAdapter;
let __resetWritableCacheForTests: typeof import('./adapter').__resetWritableCacheForTests;

beforeEach(async () => {
  vi.resetModules();
  const adapterMod = await import('./adapter');
  const storeMod = await import('./entity-store');
  svelteReactiveAdapter = adapterMod.svelteReactiveAdapter;
  __resetWritableCacheForTests = adapterMod.__resetWritableCacheForTests;
  entityStore = storeMod.entityStore;
});

afterEach(() => {
  __resetWritableCacheForTests();
});

interface UserData {
  name: string;
  email: string;
}

class User extends Entity<UserData> {
  $defaultData(): UserData {
    return { name: '', email: '' };
  }
}

describe('entityStore — Readable<Entity<Data>>', () => {
  it('subscribe receives the entity itself (not the data), enabling $store._data.field', () => {
    const user = new User({
      reactive: svelteReactiveAdapter,
      data: { name: 'Ada', email: 'ada@example.com' },
    });
    const store = entityStore(user);
    const seen: User[] = [];
    store.subscribe((v) => seen.push(v));
    expect(seen.length).toBe(1);
    expect(seen[0]).toBe(user);
    expect(seen[0]._uuid).toBe(user._uuid);
    expect(seen[0].$data.name).toBe('Ada');
  });

  it('subscriber fires on entity.$patch mutations', () => {
    const user = new User({
      reactive: svelteReactiveAdapter,
      data: { name: 'Ada', email: 'ada@example.com' },
    });
    const store = entityStore(user);
    let count = 0;
    store.subscribe(() => count++);
    expect(count).toBe(1);
    user.$patch({ name: 'Grace' });
    expect(count).toBe(2);
    expect(user.$data.name).toBe('Grace');
  });

  it('unsubscribe stops further notifications', () => {
    const user = new User({
      reactive: svelteReactiveAdapter,
      data: { name: 'Ada', email: 'ada@example.com' },
    });
    const store = entityStore(user);
    let count = 0;
    const unsub = store.subscribe(() => count++);
    expect(count).toBe(1);
    user.$patch({ name: 'Grace' });
    expect(count).toBe(2);
    unsub();
    user.$patch({ name: 'Hedy' });
    expect(count).toBe(2);
  });

  it('multiple subscribers each receive every notification', () => {
    const user = new User({
      reactive: svelteReactiveAdapter,
      data: { name: 'Ada', email: 'ada@example.com' },
    });
    const store = entityStore(user);
    let a = 0;
    let b = 0;
    store.subscribe(() => a++);
    store.subscribe(() => b++);
    expect(a).toBe(1);
    expect(b).toBe(1);
    user.$patch({ name: 'Grace' });
    expect(a).toBe(2);
    expect(b).toBe(2);
  });

  it('entityStore() called twice on the same entity does not double-wrap (idempotent reactive())', () => {
    const user = new User({
      reactive: svelteReactiveAdapter,
      data: { name: 'Ada', email: 'ada@example.com' },
    });
    const store1 = entityStore(user);
    const store2 = entityStore(user);
    let count = 0;
    store1.subscribe(() => count++);
    store2.subscribe(() => count++);
    expect(count).toBe(2);
    user.$patch({ name: 'Grace' });
    expect(count).toBe(4);
  });
});
