// SPDX-License-Identifier: Apache-2.0
/**
 * Default `ReactiveAdapter` — plain object pass-through.
 *
 * Suitable for server-side and framework-free consumers. Mutations on
 * `Entity._data` happen directly on the underlying object; consumers who
 * need reactivity wire in `@gertsai/entity/vue` (or a custom adapter).
 *
 * Per PRD-033 FR-003 (Wave 12.C-fix-1): the raw-brand symbol is now
 * **module-private** (`Symbol(...)`, NOT `Symbol.for(...)`) per ADR-008
 * I-11 to prevent global-registry collisions / forgery (CWE-1321), and
 * is installed via `Object.defineProperty` with `configurable: false`,
 * `writable: false`, `enumerable: false` so the brand cannot be deleted
 * or overwritten by downstream code. This harmonises the plain adapter
 * with the canonical react-adapter form (see
 * `packages/entity-react/src/adapter.ts`).
 */
import type { ReactiveAdapter } from '../types';

// Module-private symbol — NOT in the global registry per ADR-008 I-11.
const RAW_MARKER = Symbol('@gertsai/entity:raw');

function isMarkedRaw(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === 'object' &&
    Object.prototype.hasOwnProperty.call(value, RAW_MARKER)
  );
}

export const plainReactiveAdapter: ReactiveAdapter & {
  readonly isMarkedRaw: (value: unknown) => boolean;
} = {
  reactive<T extends object>(target: T): T {
    return target;
  },
  markRaw<T>(value: T): T {
    if (value && typeof value === 'object') {
      // Locked brand — cannot be deleted or overwritten.
      Object.defineProperty(value as object, RAW_MARKER, {
        value: true,
        configurable: false,
        writable: false,
        enumerable: false,
      });
    }
    return value;
  },
  isReactive(_value: unknown): boolean {
    return false;
  },
  /** Test/interop helper — checks the module-private brand. */
  isMarkedRaw,
};
