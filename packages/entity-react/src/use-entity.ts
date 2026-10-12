// SPDX-License-Identifier: Apache-2.0
/**
 * `useEntity(entity)` — React hook that subscribes to mutations on
 * `entity._data` (intercepted by `reactReactiveAdapter`) via
 * `React.useSyncExternalStore` with a version-snapshot wrapper per
 * ADR-008 Amendment 1.2.10.
 *
 * React loading strategy (no static imports — both would break a class
 * of consumers):
 *  - `import 'react'` would hard-require an OPTIONAL peer for everyone
 *    importing the barrel, including adapter-only users;
 *  - `import 'node:module'` breaks bundler/browser builds (the builtin
 *    gets externalized and is absent at runtime).
 *
 * Order: injected fn ({@link setUseSyncExternalStore} — what bundler
 * apps register once) → `process.getBuiltinModule('node:module')`
 * createRequire (Node ≥22.3, import-free) → peer-dep error.
 */
import type { Entity } from '@gertsai/entity';
import { subscribe, getVersion } from './adapter.js';

type UseSyncExternalStoreFn = <T>(
  subscribe: (callback: () => void) => () => void,
  getSnapshot: () => T,
) => T;

let _useSyncExternalStore: UseSyncExternalStoreFn | undefined;

/**
 * Register `React.useSyncExternalStore` for `useEntity`.
 *
 * Required in bundler/browser builds (no `createRequire` there) — call
 * once near app bootstrap:
 *
 * ```ts
 * import { useSyncExternalStore } from 'react';
 * import { setUseSyncExternalStore } from '@gertsai/entity-react';
 * setUseSyncExternalStore(useSyncExternalStore);
 * ```
 *
 * In Node runtimes this is optional — the hook auto-resolves `react`
 * through `process.getBuiltinModule('node:module')`.
 */
export function setUseSyncExternalStore(
  fn: UseSyncExternalStoreFn | undefined,
): void {
  _useSyncExternalStore = fn;
}

/**
 * Test seam kept for existing callers — now an alias of the public
 * {@link setUseSyncExternalStore}.
 *
 * @internal
 */
export function __setUseSyncExternalStoreForTests(
  fn: UseSyncExternalStoreFn | undefined,
): void {
  setUseSyncExternalStore(fn);
}

/** Minimal `node:module` surface needed to resolve the react peer. */
interface NodeModuleBuiltin {
  createRequire(url: string | URL): (id: string) => unknown;
}

function requireReact(): { useSyncExternalStore?: unknown } | undefined {
  // Node ≥22.3 exposes builtins without an import; absent elsewhere.
  if (typeof process === 'undefined') return undefined;
  const getBuiltin = (process as { getBuiltinModule?: (id: string) => unknown })
    .getBuiltinModule;
  if (typeof getBuiltin !== 'function') return undefined;
  const nodeModule = getBuiltin.call(process, 'node:module') as
    | NodeModuleBuiltin
    | undefined;
  if (typeof nodeModule?.createRequire !== 'function') return undefined;
  try {
    return nodeModule.createRequire(import.meta.url)('react') as {
      useSyncExternalStore?: unknown;
    };
  } catch {
    return undefined;
  }
}

function loadReact(): UseSyncExternalStoreFn {
  if (_useSyncExternalStore) return _useSyncExternalStore;
  const react = requireReact();
  if (typeof react?.useSyncExternalStore === 'function') {
    _useSyncExternalStore =
      react.useSyncExternalStore as UseSyncExternalStoreFn;
    return _useSyncExternalStore;
  }
  throw new Error(
    '@gertsai/entity-react requires "react" >=18.0.0 as a peer dependency. ' +
      'Install it with: pnpm add react — or, in bundler/browser builds, ' +
      'register it via setUseSyncExternalStore(useSyncExternalStore).',
  );
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
