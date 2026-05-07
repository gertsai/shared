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
