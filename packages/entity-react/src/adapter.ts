// SPDX-License-Identifier: Apache-2.0
/**
 * `@gertsai/entity-react` — `reactReactiveAdapter` implementation.
 *
 * Proxy-based reactivity with a per-target subscriber registry stored in a
 * `WeakMap`, a per-target version counter for `React.useSyncExternalStore`
 * snapshot tracking, and three Proxy traps (`set` / `defineProperty` /
 * `deleteProperty`) that synchronously notify subscribers.
 *
 * Per ADR-008 Decision C + Amendment invariants I-11..I-14.
 */
import type { ReactiveAdapter } from '@gertsai/entity';

const RAW = Symbol('raw');

const subscribers = new WeakMap<object, Set<() => void>>();
const versions = new WeakMap<object, { value: number }>();
const reentrancyGuard = new WeakMap<object, boolean>();
const reactiveProxies = new WeakSet<object>();
const targetToProxy = new WeakMap<object, object>();
const proxyToTarget = new WeakMap<object, object>();

function resolveTarget(value: object): object {
  return proxyToTarget.get(value) ?? value;
}

function notify(target: object): void {
  if (reentrancyGuard.get(target)) return;
  reentrancyGuard.set(target, true);
  try {
    const v = versions.get(target);
    if (v) v.value++;
    const subs = subscribers.get(target);
    if (subs) {
      for (const cb of subs) cb();
    }
  } finally {
    reentrancyGuard.set(target, false);
  }
}

/**
 * Register a callback that will be invoked synchronously after every mutation
 * of `target` (intercepted by the adapter's Proxy traps). Returns an
 * unsubscribe function. Safe to call repeatedly with the same `target`.
 */
export function subscribe(target: object, callback: () => void): () => void {
  const t = resolveTarget(target);
  let subs = subscribers.get(t);
  if (!subs) {
    subs = new Set();
    subscribers.set(t, subs);
  }
  subs.add(callback);
  return () => {
    const set = subscribers.get(t);
    if (set) set.delete(callback);
  };
}

/**
 * Read the current version counter for `target`. Incremented on every
 * mutation intercepted by the Proxy traps. Used by `useEntity`'s
 * `getSnapshot` for React identity-stable change detection per
 * ADR-008 Amendment 1.2.10.
 */
export function getVersion(target: object): number {
  const t = resolveTarget(target);
  let v = versions.get(t);
  if (!v) {
    v = { value: 0 };
    versions.set(t, v);
  }
  return v.value;
}

export const reactReactiveAdapter: ReactiveAdapter = {
  reactive<T extends object>(target: T): T {
    if (target === null || typeof target !== 'object') return target;
    if (Object.prototype.hasOwnProperty.call(target, RAW)) return target;
    if (reactiveProxies.has(target)) return target;
    const cached = targetToProxy.get(target);
    if (cached) return cached as T;

    if (!versions.has(target)) versions.set(target, { value: 0 });

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
    reactiveProxies.add(proxy);
    targetToProxy.set(target, proxy);
    proxyToTarget.set(proxy, target);
    return proxy as T;
  },

  /**
   * Mark `value` as **permanently** opted out of reactive wrapping.
   *
   * The `RAW` brand is installed via `Object.defineProperty` with
   * `configurable: false`, `writable: false` (Sprint 3.10 W-3-10-13
   * clarification). This is INTENTIONAL — once a value is marked raw,
   * the brand cannot be deleted or overwritten by downstream code. The
   * effect is one-way: there is no `unmarkRaw` escape hatch.
   *
   * Rationale: a reversible brand would let an attacker (or a buggy
   * library composing the entity tree) re-enable reactivity on a value
   * the application explicitly excluded — silently breaking the
   * invariant that raw refs never trigger updates. If a consumer needs
   * a fresh, unbranded copy of the same data they should clone the
   * value (e.g. `structuredClone(value)`) and brand the copy instead.
   */
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
      value !== null && typeof value === 'object' && reactiveProxies.has(value)
    );
  },
};
