// SPDX-License-Identifier: Apache-2.0
/**
 * `useEntity` — accessor returning the Entity's `_data` field for use inside
 * Solid components.
 *
 * Entity instances built with `solidReactiveAdapter` already wrap `_data` in a
 * Solid store proxy at construction time. Consumers read `store.field` for
 * fine-grained reactive tracking; writes go through Entity APIs (which mutate
 * `_data` properties directly — those writes hit the proxy's `set` trap and
 * propagate via `setStore(produce(...))`).
 *
 * Per ADR-008 Decision D and SPEC-013 W-3-8-14.
 */
import type { Entity } from '@gertsai/entity';

/**
 * Returns the Solid store-backed `$data` accessor for an Entity instance.
 *
 * Solid components read `store.field` for fine-grained reactive tracking.
 * The proxy returned by `solidReactiveAdapter.reactive(...)` already routes
 * reads through the underlying Solid store, so simply exposing `$data`
 * (the read-only `_data` view) is enough — no extra hook subscription is
 * needed because Solid tracks signal reads transitively.
 *
 * @example
 * ```tsx
 * function Profile() {
 *   const store = useEntity(user);
 *   return <h1>{store.name}</h1>;
 * }
 * ```
 */
export function useEntity<Data extends object>(
  entity: Entity<Data>,
): Readonly<Data> {
  return entity.$data;
}
