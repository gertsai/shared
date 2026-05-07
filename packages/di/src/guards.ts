// SPDX-License-Identifier: Apache-2.0
/**
 * @fileoverview
 * Runtime type guards and assertions for DI primitives.
 *
 * These helpers complement the compile-time type system in `./types` with
 * narrow, additive runtime checks. They never throw on the happy path and
 * never alter existing API semantics — they sit alongside the existing
 * exports and are opt-in for consumers that want defensive validation.
 *
 * Patterns inspired by Orchestra orchlab/di (Apache 2.0 — sibling package
 * shape; this module is fresh code with no orchlab counterpart).
 */

import type { IDestroyable, ServiceIdentifier, ServiceType } from './types';

/**
 * Runtime type guard — checks whether `value` conforms to {@link IDestroyable}.
 *
 * Useful in DI consumers that want to defensively cascade `$destroy()` over
 * heterogeneous collections (mixed services + raw resources) without falling
 * back to `instanceof AbstractService`, which would couple them to a specific
 * base class.
 *
 * @param value - Any candidate value
 * @returns `true` when `value` is a non-null object exposing a `$destroy` method
 *
 * @example
 * ```typescript
 * const resources: unknown[] = [service, plainObject, anotherService];
 * for (const r of resources) {
 *   if (isDestroyable(r)) r.$destroy();
 * }
 * ```
 */
export function isDestroyable(value: unknown): value is IDestroyable {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { $destroy?: unknown }).$destroy === 'function'
  );
}

/**
 * Runtime type guard for {@link ServiceIdentifier} values.
 *
 * Service identifiers in `@gertsai/di` are `Symbol`s (returned by
 * {@link createIdentifier}) cast to a branded `string &` shape. At runtime
 * the only invariant we can verify is the symbol-ness; the type brand is a
 * compile-time fiction.
 *
 * @param value - Any candidate value
 * @returns `true` when `value` is a `symbol`
 *
 * @example
 * ```typescript
 * function safeRegister(id: unknown, factory: ServiceFactory<MyService>) {
 *   if (!isServiceIdentifier(id)) throw new TypeError('Bad identifier');
 *   diContainer.registerGlobalService(id, factory);
 * }
 * ```
 */
export function isServiceIdentifier<T extends ServiceType = ServiceType>(
  value: unknown,
): value is ServiceIdentifier<T> {
  return typeof value === 'symbol';
}

/**
 * Asserts that `value` is a {@link ServiceIdentifier}, throwing a `TypeError`
 * with a descriptive message otherwise.
 *
 * Use this at trust boundaries (e.g. parsing config-driven service keys)
 * where a malformed identifier should fail fast with a clear diagnostic
 * rather than surface as a downstream `Service factory not found` error.
 *
 * @param value - Any candidate value
 * @param label - Optional context label included in the thrown message
 * @throws {TypeError} when `value` is not a `symbol`
 *
 * @example
 * ```typescript
 * function lookup(rawId: unknown) {
 *   assertServiceIdentifier(rawId, 'lookup#rawId');
 *   return diContainer.$sd.get(rawId);
 * }
 * ```
 */
export function assertServiceIdentifier<T extends ServiceType = ServiceType>(
  value: unknown,
  label = 'value',
): asserts value is ServiceIdentifier<T> {
  if (typeof value !== 'symbol') {
    throw new TypeError(
      `assertServiceIdentifier: expected ${label} to be a symbol service ` +
        `identifier, received ${typeof value}.`,
    );
  }
}
