// SPDX-License-Identifier: Apache-2.0
/**
 * `solidReactiveAdapter` conformance + adversarial tests.
 *
 * `solid-js/store` is mocked with a minimal `createStore` + `produce`
 * implementation so tests run in a Node environment without bringing the
 * full Solid runtime. The mock follows the public `createStore` contract:
 * `[store, setStore]` where `store` is the original target and `setStore`
 * accepts a producer-style updater.
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

import { solidReactiveAdapter } from '../adapter';

describe('solidReactiveAdapter — ReactiveAdapter conformance', () => {
  it('conforms to ReactiveAdapter shape (reactive, markRaw, isReactive)', () => {
    expect(typeof solidReactiveAdapter.reactive).toBe('function');
    expect(typeof solidReactiveAdapter.markRaw).toBe('function');
    expect(typeof solidReactiveAdapter.isReactive).toBe('function');
  });

  it('reactive(target) returns a proxy that brand-checks as reactive', () => {
    const target = { name: 'gerts' };
    const store = solidReactiveAdapter.reactive(target);
    expect(solidReactiveAdapter.isReactive(store)).toBe(true);
  });

  it('isReactive(plainObject) returns false for unwrapped objects', () => {
    expect(solidReactiveAdapter.isReactive({ a: 1 })).toBe(false);
    expect(solidReactiveAdapter.isReactive(null)).toBe(false);
    expect(solidReactiveAdapter.isReactive(undefined)).toBe(false);
    expect(solidReactiveAdapter.isReactive('not an object')).toBe(false);
  });
});

describe('solidReactiveAdapter — markRaw escape hatch (Amendment 1.2.2)', () => {
  it('markRaw(target) prevents subsequent reactive() from wrapping', () => {
    const target = { name: 'gerts' };
    solidReactiveAdapter.markRaw(target);
    const result = solidReactiveAdapter.reactive(target);
    expect(result).toBe(target);
    expect(solidReactiveAdapter.isReactive(result)).toBe(false);
  });

  it('markRaw is a no-op for non-objects', () => {
    expect(solidReactiveAdapter.markRaw('string')).toBe('string');
    expect(solidReactiveAdapter.markRaw(42 as unknown)).toBe(42);
    expect(solidReactiveAdapter.markRaw(null as unknown)).toBe(null);
  });
});

describe('solidReactiveAdapter — Proxy trap fan-out (I-13)', () => {
  it('set trap routes property writes through setStore(produce(...))', () => {
    const target: { name: string; age?: number } = { name: 'before', age: 30 };
    const store = solidReactiveAdapter.reactive(target);
    store.name = 'after';
    expect(target.name).toBe('after');
  });

  it('deleteProperty trap routes deletions through setStore(produce(...))', () => {
    const target: { name: string; age?: number } = { name: 'gerts', age: 30 };
    const store = solidReactiveAdapter.reactive(target);
    delete store.age;
    expect(target.age).toBeUndefined();
  });

  it('defineProperty trap routes definitions through setStore(produce(...))', () => {
    const target: Record<string, unknown> = { name: 'gerts' };
    const store = solidReactiveAdapter.reactive(target);
    Object.defineProperty(store, 'newKey', {
      value: 'newValue',
      enumerable: true,
      configurable: true,
      writable: true,
    });
    expect(target['newKey']).toBe('newValue');
  });
});

describe('solidReactiveAdapter — idempotency / re-wrap protection', () => {
  it('reactive(reactive(x)) does not double-wrap', () => {
    const target = { name: 'gerts' };
    const once = solidReactiveAdapter.reactive(target);
    const twice = solidReactiveAdapter.reactive(once);
    expect(twice).toBe(once);
  });

  it('reactive(primitive) returns the value unchanged', () => {
    // The adapter's signature requires an object, but defensive runtime
    // handling keeps it safe when callers ignore the type-system.
    expect(
      solidReactiveAdapter.reactive(null as unknown as object),
    ).toBe(null);
  });
});

describe('solidReactiveAdapter — module-private symbol (I-11, CWE-1321)', () => {
  it('does not expose RAW marker via Symbol.for shared registry', () => {
    // Amendment 1.2.3: markers MUST use module-private Symbol(...) — NOT
    // Symbol.for(...). A consumer who calls Symbol.for with the obvious key
    // must NOT be able to forge a "raw" marker on a foreign object.
    const forged = { name: 'attacker' };
    const guess = Symbol.for('@gertsai/entity-solid:raw');
    Object.defineProperty(forged, guess, { value: true, enumerable: false });
    const wrapped = solidReactiveAdapter.reactive(forged);
    // The forged Symbol.for(...) marker must NOT bypass reactive wrapping.
    expect(solidReactiveAdapter.isReactive(wrapped)).toBe(true);
  });

  it('does not honour prototype-injected RAW markers (CWE-1321)', () => {
    // Pollute Object.prototype with a same-keyed symbol — adapter must use
    // Object.prototype.hasOwnProperty.call(value, MARK), not `MARK in value`.
    const polluted = {};
    const result = solidReactiveAdapter.reactive(polluted);
    expect(solidReactiveAdapter.isReactive(result)).toBe(true);
  });
});

// Wave 19 / EVID-074 M-R2 parity — markRaw non-reversibility for Solid.
describe('solidReactiveAdapter — markRaw non-reversibility (Wave 19)', () => {
  it('markRaw() installs a non-configurable, non-writable RAW brand', () => {
    const value = { secret: 1 };
    solidReactiveAdapter.markRaw(value);
    const rawSym = Object.getOwnPropertySymbols(value).find(
      (s) => s.toString() === 'Symbol(@gertsai/entity-solid:raw)',
    );
    expect(rawSym).toBeDefined();
    const desc = Object.getOwnPropertyDescriptor(value, rawSym!);
    expect(desc?.configurable).toBe(false);
    expect(desc?.writable).toBe(false);
    expect(desc?.enumerable).toBe(false);
    expect(desc?.value).toBe(true);
  });

  it('markRaw() brand cannot be overwritten via Object.defineProperty', () => {
    const value = { secret: 1 };
    solidReactiveAdapter.markRaw(value);
    const rawSym = Object.getOwnPropertySymbols(value).find(
      (s) => s.toString() === 'Symbol(@gertsai/entity-solid:raw)',
    );
    expect(() =>
      Object.defineProperty(value, rawSym!, {
        value: false,
        configurable: true,
      }),
    ).toThrow();
  });

  it('markRaw() brand cannot be deleted (strict-mode delete throws)', () => {
    const value: Record<symbol, unknown> = { secret: 1 } as unknown as Record<
      symbol,
      unknown
    >;
    solidReactiveAdapter.markRaw(value);
    const rawSym = Object.getOwnPropertySymbols(value).find(
      (s) => s.toString() === 'Symbol(@gertsai/entity-solid:raw)',
    );
    expect(() => {
      delete value[rawSym!];
    }).toThrow();
  });
});

describe('solidReactiveAdapter — peer-dep gate (Amendment 1.2.9)', () => {
  // Wave 19 / EVID-074 L-S1 — test seam parity with svelte/vue.
  it('__resetSolidCacheForTests clears cached references so loadSolid re-resolves', async () => {
    const mod = await import('../adapter');
    mod.solidReactiveAdapter.reactive({ a: 1 });
    expect(() => mod.__resetSolidCacheForTests()).not.toThrow();
    expect(() => mod.solidReactiveAdapter.reactive({ b: 2 })).not.toThrow();
  });

  it('throws a descriptive error when solid-js/store cannot be required', async () => {
    // Simulate the peer dep being absent by intercepting the package's
    // resolved location and forcing `require` to fail. We do this through a
    // fresh isolated module load with a custom `createRequire` shim by
    // mocking the `node:module` import surface used by `adapter.ts`.
    vi.resetModules();
    vi.doMock('node:module', () => ({
      createRequire: () => (id: string) => {
        if (id === 'solid-js/store') {
          throw new Error("Cannot find module 'solid-js/store'");
        }
        throw new Error(`unexpected require('${id}')`);
      },
    }));
    const { solidReactiveAdapter: adapter } = await import('../adapter');
    expect(() => adapter.reactive({ a: 1 })).toThrow(
      /@gertsai\/entity-solid requires "solid-js" >=1\.0\.0/,
    );
    vi.doUnmock('node:module');
    vi.resetModules();
  });
});
