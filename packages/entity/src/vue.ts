// SPDX-License-Identifier: Apache-2.0
/**
 * `@gertsai/entity/vue` — optional Vue `ReactiveAdapter` adapter.
 *
 * Imports `@vue/runtime-core` lazily via `require` so users who never
 * import this subpath never pay for the peer dep. The dependency is declared
 * `peerDependenciesMeta.optional` in `package.json` — install Vue explicitly
 * to use this adapter.
 *
 * Per PRD-002 FR-W4-002 (UI-framework reactivity is opt-in, not required).
 */
import type { ReactiveAdapter } from './types';

type ShallowReactiveFn = <T extends object>(t: T) => T;
type MarkRawFn = <T>(v: T) => T;
type IsReactiveFn = (v: unknown) => boolean;

let _shallowReactive: ShallowReactiveFn | undefined;
let _markRaw: MarkRawFn | undefined;
let _isReactive: IsReactiveFn | undefined;

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
    // eslint-disable-next-line @typescript-eslint/no-require-imports
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
      "@gertsai/entity/vue: missing peer dep '@vue/runtime-core'. Install with `pnpm add @vue/runtime-core`.",
    );
  }
}

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
