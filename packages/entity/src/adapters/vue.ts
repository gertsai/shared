// SPDX-License-Identifier: Apache-2.0
/**
 * `vueReactiveAdapter` — Vue 3 `ReactiveAdapter` for `@gertsai/entity`.
 *
 * Inlined implementation (Wave 12.C-fix-1 PRD-033 FR-001): the canonical
 * source previously lived in the standalone `@gertsai/entity-vue` package,
 * but that created a `peerDependencies` cycle (entity peer-depended on
 * entity-vue which depended on entity). The cycle is dissolved here by
 * keeping the adapter source local to `@gertsai/entity` and removing the
 * `@gertsai/entity-vue` peer from `package.json`.
 *
 * Lazy-loads `@vue/runtime-core` via `createRequire(import.meta.url)` so
 * users who never import the `/vue` subpath never pay for the peer dep.
 * The dependency is declared `peerDependenciesMeta.optional` in
 * `package.json` — install Vue explicitly to use this adapter.
 *
 * The local brand symbol below is module-private (`Symbol(...)`, NOT
 * `Symbol.for(...)`) per ADR-008 I-11 to avoid global-registry collisions
 * (CWE-1321 prevention).
 */
import { createRequire } from 'node:module';
import type { ReactiveAdapter } from '../types';

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
      '@gertsai/entity/vue requires "@vue/runtime-core" >=3.0.0 as a peer dependency. Install it with: pnpm add @vue/runtime-core',
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
