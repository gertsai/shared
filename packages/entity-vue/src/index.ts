// SPDX-License-Identifier: Apache-2.0
/**
 * `@gertsai/entity-vue` — Vue 3 `ReactiveAdapter` for `@gertsai/entity`.
 *
 * Lazy-loads `@vue/runtime-core` via `createRequire(import.meta.url)` so users
 * who never import this package never pay for the peer dep. The dependency is
 * declared `peerDependenciesMeta.optional` in `package.json` — install Vue
 * explicitly to use this adapter.
 *
 * Per ADR-008 Decision B + Amendment 1.2.9 + I-3 (backward-compat: the
 * `@gertsai/entity/vue` subpath re-exports from this package).
 */
import { createRequire } from 'node:module';
import type { ReactiveAdapter } from '@gertsai/entity';

const require = createRequire(import.meta.url);

type ShallowReactiveFn = <T extends object>(t: T) => T;
type MarkRawFn = <T>(v: T) => T;
type IsReactiveFn = (v: unknown) => boolean;

let _shallowReactive: ShallowReactiveFn | undefined;
let _markRaw: MarkRawFn | undefined;
let _isReactive: IsReactiveFn | undefined;

/**
 * Test-only hook: clears the cached `@vue/runtime-core` references so
 * `loadVue` re-resolves on the next call. Intended for use after
 * `vi.doMock('@vue/runtime-core', ...)` / `vi.doUnmock(...)` cycles or
 * `Module._load` patching. Mirrors `__resetWritableCacheForTests` from
 * `@gertsai/entity-svelte` and `__resetSolidCacheForTests` from
 * `@gertsai/entity-solid` for cross-adapter symmetry. Not part of the
 * public API and excluded from semver guarantees.
 *
 * Wave 19 / EVID-074 M-V1.
 *
 * @internal
 */
export function __resetVueCacheForTests(): void {
  _shallowReactive = undefined;
  _markRaw = undefined;
  _isReactive = undefined;
}

function loadVue(): {
  shallowReactive: ShallowReactiveFn;
  markRaw: MarkRawFn;
  isReactive: IsReactiveFn;
} {
  if (_shallowReactive && _markRaw && _isReactive) {
    return {
      shallowReactive: _shallowReactive,
      markRaw: _markRaw,
      isReactive: _isReactive,
    };
  }
  try {
    const vue = require('@vue/runtime-core') as {
      shallowReactive: ShallowReactiveFn;
      markRaw: MarkRawFn;
      isReactive: IsReactiveFn;
    };
    _shallowReactive = vue.shallowReactive;
    _markRaw = vue.markRaw;
    _isReactive = vue.isReactive;
    return vue;
  } catch {
    throw new Error(
      '@gertsai/entity-vue requires "@vue/runtime-core" >=3.0.0 as a peer dependency. Install it with: pnpm add @vue/runtime-core',
    );
  }
}

/**
 * Vue 3 `ReactiveAdapter` implementation.
 *
 * **Notify timing**: `microtask` — Vue's `shallowReactive` delegates to the
 * Vue effect scheduler, which batches and flushes updates after the current
 * microtask boundary. Synchronous reads of a freshly-written property on the
 * proxy will reflect the new value, but downstream `watchEffect` / template
 * re-renders fire after `await nextTick()`. See `ReactiveAdapter` JSDoc in
 * `@gertsai/entity/types` for the cross-adapter timing contract (Wave 19,
 * EVID-074 H-V1).
 */
export const vueReactiveAdapter: ReactiveAdapter = {
  reactive<T extends object>(target: T): T {
    return loadVue().shallowReactive(target);
  },
  markRaw<T>(value: T): T {
    return loadVue().markRaw(value);
  },
  isReactive(value: unknown): boolean {
    return loadVue().isReactive(value);
  },
};
