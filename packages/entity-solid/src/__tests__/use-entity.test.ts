// SPDX-License-Identifier: Apache-2.0
/**
 * `useEntity` accessor — returns the entity's `$data` reference.
 *
 * `solid-js/store` is mocked so we can construct an `Entity` with the Solid
 * adapter without bringing the real Solid runtime into the Node test process.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('solid-js/store', () => {
  const produce =
    <T,>(producer: (s: T) => void) =>
    (state: T) => {
      producer(state);
    };
  const createStore = <T extends object>(state: T) => {
    let current = state;
    const setStore = (updater: (s: T) => void) => {
      updater(current);
    };
    return [current, setStore] as const;
  };
  return { createStore, produce };
});

import { Entity } from '@gertsai/entity';
import { solidReactiveAdapter } from '../adapter';
import { useEntity } from '../use-entity';

interface UserData extends Record<string, unknown> {
  name: string;
  age: number;
}

class UserEntity extends Entity<UserData> {
  $defaultData(): UserData {
    return { name: 'anon', age: 0 };
  }
}

describe('useEntity', () => {
  it('returns the same reference as entity.$data', () => {
    const user = new UserEntity({
      data: { name: 'gerts', age: 30 },
      reactive: solidReactiveAdapter,
    });
    const store = useEntity(user);
    expect(store).toBe(user.$data);
  });

  it('reflects entity field reads through the Solid store proxy', () => {
    const user = new UserEntity({
      data: { name: 'gerts', age: 30 },
      reactive: solidReactiveAdapter,
    });
    const store = useEntity(user);
    expect(store.name).toBe('gerts');
    expect(store.age).toBe(30);
  });

  it('reflects entity mutations through $patch', () => {
    const user = new UserEntity({
      data: { name: 'before', age: 0 },
      reactive: solidReactiveAdapter,
    });
    const store = useEntity(user);
    user.$patch({ name: 'after', age: 99 });
    expect(store.name).toBe('after');
    expect(store.age).toBe(99);
  });
});
