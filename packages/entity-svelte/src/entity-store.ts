// SPDX-License-Identifier: Apache-2.0
/**
 * `entityStore<Data>(entity): Readable<Entity<Data>>` — Svelte store factory
 * that yields a `Readable<Entity<Data>>` so consumers can use the canonical
 * `$entityStore._data.field` template syntax (ADR-008 Amendment 1.1.1) while
 * still reaching the entity's own API surface (e.g., `$entityStore._uuid`).
 *
 * Implementation: ensures `entity._data` is wrapped by
 * `svelteReactiveAdapter.reactive` (idempotent — no-op on a previously-wrapped
 * target via the `REACTIVE_BRAND` guard in `adapter.ts`), then bridges the
 * underlying `writable(entity._data)` store into a `Readable<Entity<Data>>`
 * that emits the entity reference itself on every mutation. The entity
 * identity is stable; `$store._data` reads through the live reactive proxy.
 *
 * Per ADR-008 Decision E §2 + Amendment 1.1.1.
 */
import type { Entity } from '@gertsai/entity';
import { getStore, svelteReactiveAdapter } from './adapter.js';

/** Minimal shape of `svelte/store`'s `Readable<T>` used by this factory. */
export interface Readable<T> {
  subscribe(callback: (value: T) => void): () => void;
}

export function entityStore<Data extends object>(
  entity: Entity<Data>,
): Readable<Entity<Data>> {
  // `Entity#$data` is a `Readonly<Data>` view of the protected `_data` field
  // and returns the same object reference — adequate for adapter wrapping
  // without breaching the protected contract (ADR-008 I-14).
  const target = entity.$data as Data;
  svelteReactiveAdapter.reactive(target);
  const store = getStore(target);

  return {
    subscribe(callback: (value: Entity<Data>) => void): () => void {
      if (!store) {
        callback(entity);
        return () => undefined;
      }
      // Svelte's `writable.subscribe` synchronously fires `cb(currentValue)`
      // on subscribe — we delegate to it so consumers see exactly one
      // initial emission, matching the Svelte store contract.
      return store.subscribe(() => callback(entity));
    },
  };
}
