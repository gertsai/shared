// SPDX-License-Identifier: Apache-2.0
/**
 * `@gertsai/entity-svelte` — `svelteReactiveAdapter` implementation.
 *
 * Proxy-based reactivity backed by Svelte `writable` stores. Each reactive
 * `target` gets a sibling `writable(target)` cached in a module-private
 * `WeakMap` so callbacks GC with the wrapped object (CWE-401, ADR-008 I-12).
 * Three Proxy traps (`set` / `defineProperty` / `deleteProperty`) call
 * `store.set({ ...target })` synchronously; a per-target boolean re-entrancy
 * guard prevents infinite loops if a subscriber mutates the same target
 * (CWE-674, ADR-008 I-13). Raw markers use a module-private `Symbol('raw')`
 * looked up via `hasOwnProperty` to avoid prototype-pollution
 * (CWE-1321, ADR-008 I-11). Svelte runtime is resolved lazily via
 * `createRequire(import.meta.url)` so the adapter loads in both ESM and CJS
 * tsup output (ADR-008 Amendment 1.2.9).
 *
 * Per ADR-008 Decision E + Amendment invariants I-11..I-14.
 */
import { createRequire } from 'node:module';
import type { ReactiveAdapter } from '@gertsai/entity';

const require = createRequire(import.meta.url);

const RAW = Symbol('raw');
const REACTIVE_BRAND = Symbol('svelte-reactive');

/** Minimal shape of `svelte/store`'s `Writable<T>` used by this adapter. */
interface Writable<T> {
  set(value: T): void;
  subscribe(callback: (value: T) => void): () => void;
  update(updater: (value: T) => T): void;
}

const stores = new WeakMap<object, Writable<object>>();
const reentrancyGuard = new WeakMap<object, boolean>();

let cachedWritable: (<T>(initial: T) => Writable<T>) | undefined;

function loadWritable(): <T>(initial: T) => Writable<T> {
  if (cachedWritable) return cachedWritable;
  try {
    const svelteStore = require('svelte/store') as {
      writable: <T>(initial: T) => Writable<T>;
    };
    cachedWritable = svelteStore.writable;
    return cachedWritable;
  } catch {
    throw new Error(
      '@gertsai/entity-svelte requires "svelte" >=4.0.0 as a peer dependency. Install it with: pnpm add svelte',
    );
  }
}

/**
 * Test-only hook: clears the cached `svelte/store.writable` reference so
 * `loadWritable` re-resolves on the next call. Intended for use after
 * `vi.doMock('svelte/store', ...)` / `vi.doUnmock(...)` cycles. Not part of
 * the public API and excluded from semver guarantees.
 *
 * @internal
 */
export function __resetWritableCacheForTests(): void {
  cachedWritable = undefined;
}

function notify(target: object): void {
  if (reentrancyGuard.get(target)) return;
  reentrancyGuard.set(target, true);
  try {
    const store = stores.get(target);
    if (store) {
      store.set({ ...target });
    }
  } finally {
    reentrancyGuard.set(target, false);
  }
}

export const svelteReactiveAdapter: ReactiveAdapter = {
  reactive<T extends object>(target: T): T {
    if (target === null || typeof target !== 'object') return target;
    if (Object.prototype.hasOwnProperty.call(target, RAW)) return target;
    if (Object.prototype.hasOwnProperty.call(target, REACTIVE_BRAND))
      return target;

    const writable = loadWritable();
    if (!stores.has(target)) {
      stores.set(target, writable<object>(target));
    }

    const proxy = new Proxy(target, {
      set(t, key, value): boolean {
        const result = Reflect.set(t, key, value);
        notify(t);
        return result;
      },
      defineProperty(t, key, attrs): boolean {
        const result = Reflect.defineProperty(t, key, attrs);
        notify(t);
        return result;
      },
      deleteProperty(t, key): boolean {
        const result = Reflect.deleteProperty(t, key);
        notify(t);
        return result;
      },
    });
    Object.defineProperty(proxy, REACTIVE_BRAND, {
      value: true,
      enumerable: false,
      configurable: false,
      writable: false,
    });
    // Mirror the target → store mapping under the proxy key as well so
    // `getStore(proxy)` resolves identically to `getStore(target)`.
    // Required because `Entity#$data` exposes the proxy (the wrapped
    // shape) — `entityStore` looks up the backing writable through that
    // public view rather than the protected `_data` field.
    stores.set(proxy, stores.get(target)!);
    return proxy as T;
  },

  markRaw<T>(value: T): T {
    if (value !== null && typeof value === 'object') {
      Object.defineProperty(value as object, RAW, {
        value: true,
        enumerable: false,
        configurable: false,
        writable: false,
      });
    }
    return value;
  },

  isReactive(value: unknown): boolean {
    return (
      value !== null &&
      typeof value === 'object' &&
      Object.prototype.hasOwnProperty.call(value, REACTIVE_BRAND)
    );
  },
};

/**
 * Look up the backing Svelte `Writable` store for a previously-`reactive`'d
 * target. Returned as a `{ subscribe }`-shaped projection so consumers
 * (notably `entityStore`) cannot accidentally `.set` past the Proxy
 * mutation channel (ADR-008 I-14 — adapters do not expose entity state
 * mutation outside the ReactiveAdapter contract).
 */
export function getStore(
  target: object,
): { subscribe: (callback: (value: object) => void) => () => void } | undefined {
  const store = stores.get(target);
  if (!store) return undefined;
  return { subscribe: store.subscribe.bind(store) };
}
