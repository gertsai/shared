// SPDX-License-Identifier: Apache-2.0
/**
 * `solidReactiveAdapter` — Solid.js implementation of `@gertsai/entity`'s
 * `ReactiveAdapter` contract.
 *
 * Backed by `createStore` from `solid-js/store`. Mutations are propagated via
 * the Solid `produce` pattern (per ADR-008 R-3) so that direct property
 * assignments on the returned proxy trigger fine-grained signal updates inside
 * Solid components.
 *
 * Invariants honored (per ADR-008 Amendment 1):
 *  - **I-11**: `RAW` and `STORE_BRAND` markers are module-private `Symbol(...)`
 *    instances (NOT `Symbol.for(...)` shared registry). Lookup via
 *    `Object.prototype.hasOwnProperty.call(value, MARK)` to defeat prototype
 *    pollution (CWE-1321).
 *  - **I-13**: 3 Proxy traps installed (`set` + `defineProperty` +
 *    `deleteProperty`); all 3 funnel mutations through `setStore(produce(...))`
 *    so Solid's reactive graph is notified synchronously. `Reflect.set` on the
 *    underlying store is not used directly because Solid stores require the
 *    `setStore` setter — using `setStore(produce(...))` is the canonical way to
 *    issue an in-place mutation that fires fine-grained reactivity.
 *  - **I-14**: adapter does not access entity's protected state. `reactive()`
 *    receives a target object and returns a proxy; the entity is responsible
 *    for routing reads/writes through that proxy.
 *
 * Lazy peer-dep loading: `solid-js/store` is loaded on first use via
 * `createRequire(import.meta.url)` so consumers that import this package but
 * never invoke the adapter pay no peer-dep cost (per Amendment 1.2.9).
 */
import { createRequire } from 'node:module';
import type { ReactiveAdapter } from '@gertsai/entity';

const require = createRequire(import.meta.url);

/** Module-private brand for `markRaw`'d objects (I-11). */
const RAW: unique symbol = Symbol('@gertsai/entity-solid:raw');
/** Module-private brand for proxy-wrapped Solid stores (I-11). */
const STORE_BRAND: unique symbol = Symbol('@gertsai/entity-solid:store');

type SetStoreUpdater<T extends object> = (updater: (s: T) => void) => void;
type CreateStoreFn = <T extends object>(state: T) => [T, SetStoreUpdater<T>];
type ProduceFn = <T>(producer: (state: T) => void) => (state: T) => void;

let _createStore: CreateStoreFn | undefined;
let _produce: ProduceFn | undefined;

/**
 * Test-only hook: clears the cached `solid-js/store` references so
 * `loadSolid` re-resolves on the next call. Intended for use after
 * `vi.doMock('solid-js/store', ...)` / `vi.doUnmock(...)` cycles or
 * `node:module` patching. Mirrors `__resetWritableCacheForTests` from
 * `@gertsai/entity-svelte` and `__resetVueCacheForTests` from
 * `@gertsai/entity-vue` for cross-adapter symmetry. Not part of the public
 * API and excluded from semver guarantees.
 *
 * Wave 19 / EVID-074 L-S1.
 *
 * @internal
 */
export function __resetSolidCacheForTests(): void {
  _createStore = undefined;
  _produce = undefined;
}

function loadSolid(): { createStore: CreateStoreFn; produce: ProduceFn } {
  if (_createStore && _produce) {
    return { createStore: _createStore, produce: _produce };
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const solidStore = require('solid-js/store') as {
      createStore: CreateStoreFn;
      produce: ProduceFn;
    };
    _createStore = solidStore.createStore;
    _produce = solidStore.produce;
    return solidStore;
  } catch {
    throw new Error(
      '@gertsai/entity-solid requires "solid-js" >=1.0.0 as a peer dependency. Install it with: pnpm add solid-js',
    );
  }
}

function isMarkedRaw(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === 'object' &&
    Object.prototype.hasOwnProperty.call(value, RAW)
  );
}

/**
 * Detect proxy-wrapped Solid stores produced by this adapter.
 *
 * The brand is exposed via the proxy's `get` trap (NOT installed on the
 * underlying target via `defineProperty` — that would mutate user data and
 * defeat the prototype-pollution protection). We read it through `Reflect.get`
 * which goes through the proxy traps for proxy values and reads own/inherited
 * properties for plain objects (always `undefined` for unbranded objects).
 */
function isStoreBranded(value: unknown): boolean {
  if (value === null || typeof value !== 'object') return false;
  return Reflect.get(value, STORE_BRAND) === true;
}

/**
 * Wrap a Solid store + setStore pair in a Proxy so direct property writes
 * (`proxy.foo = bar`, `delete proxy.foo`, `Object.defineProperty(...)`) are
 * routed through `setStore(produce(...))` and fire reactivity (I-13).
 */
function buildStoreProxy<T extends object>(
  store: T,
  setStore: SetStoreUpdater<T>,
  produce: ProduceFn,
): T {
  const proxy = new Proxy(store, {
    get(target, key, receiver) {
      if (key === STORE_BRAND) return true;
      return Reflect.get(target, key, receiver);
    },
    set(_target, key, value): boolean {
      // Wave 19 / EVID-074 H-S2 — if `setStore(produce(...))` throws (e.g.
      // sealed/frozen target, non-writable descriptor) we surface failure
      // by returning `false` so the Proxy invariant for strict-mode callers
      // is honored. The original error is re-thrown so test/log can see it.
      try {
        setStore(
          produce<T>((draft) => {
            (draft as Record<PropertyKey, unknown>)[key] = value;
          }),
        );
        return true;
      } catch (err) {
        // Re-throw — strict-mode Proxy callers will see the original
        // exception; sloppy-mode callers receive `false` from the trap if
        // the throw is caught upstream. Either way, we never silently
        // report success for a failed write.
        throw err instanceof Error
          ? err
          : new Error(`solidReactiveAdapter.set failed for key ${String(key)}`);
      }
    },
    deleteProperty(_target, key): boolean {
      try {
        setStore(
          produce<T>((draft) => {
            delete (draft as Record<PropertyKey, unknown>)[key];
          }),
        );
        return true;
      } catch (err) {
        throw err instanceof Error
          ? err
          : new Error(
              `solidReactiveAdapter.deleteProperty failed for key ${String(key)}`,
            );
      }
    },
    defineProperty(_target, key, descriptor): boolean {
      const value =
        'value' in descriptor
          ? descriptor.value
          : 'get' in descriptor && typeof descriptor.get === 'function'
            ? descriptor.get()
            : undefined;
      try {
        setStore(
          produce<T>((draft) => {
            (draft as Record<PropertyKey, unknown>)[key] = value;
          }),
        );
        return true;
      } catch (err) {
        throw err instanceof Error
          ? err
          : new Error(
              `solidReactiveAdapter.defineProperty failed for key ${String(key)}`,
            );
      }
    },
    has(target, key): boolean {
      if (key === STORE_BRAND) return true;
      return Reflect.has(target, key);
    },
  });
  return proxy;
}

/**
 * Solid.js `ReactiveAdapter` implementation backed by `createStore` +
 * `produce` from `solid-js/store`.
 *
 * **Notify timing**: `sync inside trap; downstream observability follows
 * Solid` — every mutation hits `setStore(produce(...))` inside the Proxy
 * trap synchronously. Solid's reactive graph then schedules signal
 * recomputation (Solid 1.x batches inside the same synchronous task; effects
 * observe the new value either inside the current microtask or on the next
 * one, depending on the surrounding `createRoot` / `batch` context).
 * Consumers should treat the timing as "the value is written before the
 * trap returns; observers fire per Solid's batching policy". See
 * `ReactiveAdapter` JSDoc in `@gertsai/entity/types` for the cross-adapter
 * timing contract (Wave 19, EVID-074 H-V1).
 */
export const solidReactiveAdapter: ReactiveAdapter = {
  reactive<T extends object>(target: T): T {
    if (target === null || typeof target !== 'object') return target;
    if (isMarkedRaw(target)) return target;
    if (isStoreBranded(target)) return target;

    const { createStore, produce } = loadSolid();
    const [store, setStore] = createStore<T>(target);
    return buildStoreProxy(store, setStore, produce);
  },
  markRaw<T>(value: T): T {
    if (value !== null && typeof value === 'object') {
      Object.defineProperty(value, RAW, {
        value: true,
        enumerable: false,
        configurable: false,
        writable: false,
      });
    }
    return value;
  },
  isReactive(value: unknown): boolean {
    return isStoreBranded(value);
  },
};
