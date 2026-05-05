// SPDX-License-Identifier: Apache-2.0
/**
 * Default `ReactiveAdapter` — plain object pass-through.
 *
 * Suitable for server-side and framework-free consumers. Mutations on
 * `Entity._data` happen directly on the underlying object; consumers who
 * need reactivity wire in `@gertsai/entity/vue` (or a custom adapter).
 */
import type { ReactiveAdapter } from '../types';

const RAW_MARKER = Symbol.for('@gertsai/entity:raw');

export const plainReactiveAdapter: ReactiveAdapter = {
  reactive<T extends object>(target: T): T {
    return target;
  },
  markRaw<T>(value: T): T {
    if (value && typeof value === 'object') {
      (value as unknown as Record<symbol, true>)[RAW_MARKER] = true;
    }
    return value;
  },
  isReactive(_value: unknown): boolean {
    return false;
  },
};

/** Exported for tests + interop with future custom adapters. */
export const RAW_MARKER_SYMBOL = RAW_MARKER;
