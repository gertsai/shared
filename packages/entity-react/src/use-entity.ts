// SPDX-License-Identifier: Apache-2.0
/**
 * `useEntity(entity)` — React hook that subscribes to mutations on
 * `entity._data` (intercepted by `reactReactiveAdapter`) via
 * `React.useSyncExternalStore` with a version-snapshot wrapper per
 * ADR-008 Amendment 1.2.10.
 */
import { createRequire } from 'node:module';
import type { Entity } from '@gertsai/entity';
import { subscribe, getVersion } from './adapter.js';

type UseSyncExternalStoreFn = <T>(
  subscribe: (callback: () => void) => () => void,
  getSnapshot: () => T,
) => T;

let _useSyncExternalStore: UseSyncExternalStoreFn | undefined;

/**
 * Test seam: inject a `useSyncExternalStore` implementation (or `undefined`
 * to clear). Public for unit tests of `useEntity`; production code SHOULD
 * NOT call this — it is documented but unsupported.
 *
 * @internal
 */
export function __setUseSyncExternalStoreForTests(
  fn: UseSyncExternalStoreFn | undefined,
): void {
  _useSyncExternalStore = fn;
}

function loadReact(): UseSyncExternalStoreFn {
  if (_useSyncExternalStore) return _useSyncExternalStore;
  try {
    const requireFn = createRequire(import.meta.url);
    const react = requireFn('react') as {
      useSyncExternalStore: UseSyncExternalStoreFn;
    };
    if (typeof react.useSyncExternalStore !== 'function') {
      throw new Error('useSyncExternalStore is not a function');
    }
    _useSyncExternalStore = react.useSyncExternalStore;
    return _useSyncExternalStore;
  } catch {
    throw new Error(
      '@gertsai/entity-react requires "react" >=18.0.0 as a peer dependency. Install it with: pnpm add react',
    );
  }
}

interface EntitySnapshot<Data extends object> {
  readonly data: Data;
  readonly version: number;
}

/**
 * Subscribe a React component to an entity's data mutations.
 *
 * Returns the entity's reactive `$data` reference. The hook uses
 * `React.useSyncExternalStore` and a version counter so that the same
 * proxy reference (which never changes identity post-construction) still
 * triggers a re-render whenever any mutation goes through the adapter's
 * Proxy traps.
 */
export function useEntity<Data extends object>(
  entity: Entity<Data>,
): Readonly<Data> {
  const useSyncExternalStore = loadReact();
  const data = entity.$data as Data;
  const snapshot = useSyncExternalStore<EntitySnapshot<Data>>(
    (cb) => subscribe(data, cb),
    () => ({ data, version: getVersion(data) }),
  );
  return snapshot.data;
}
