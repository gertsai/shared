// SPDX-License-Identifier: Apache-2.0
/**
 * `@gertsai/entity-svelte` — Svelte framework adapter for `@gertsai/entity`.
 *
 * Public API:
 *  - `svelteReactiveAdapter`: `ReactiveAdapter` implementation backed by
 *    Svelte `writable` stores (Proxy + WeakMap registry + 3 traps + sync
 *    notify + re-entrancy guard).
 *  - `entityStore<Data>(entity)`: factory returning
 *    `Readable<Entity<Data>>` for use with the `$entityStore._data.field`
 *    template syntax.
 *
 * Per ADR-008 Decision E + Amendment invariants I-11..I-14.
 */
export { svelteReactiveAdapter } from './adapter.js';
export { entityStore, type Readable } from './entity-store.js';
