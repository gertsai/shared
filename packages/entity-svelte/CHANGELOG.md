# @gertsai/entity-svelte

## 1.0.0

### Minor Changes

- 7c3535f: Initial release. Svelte framework adapter for @gertsai/entity (Tier 2).

  - `svelteReactiveAdapter` — Proxy-based reactivity backed by `writable` Svelte store:
    - **3 Proxy traps** (set + defineProperty + deleteProperty) all sync notify per ADR-008 I-13.
    - **`Reflect.set(target, key, value)` without external receiver** per Amendment 1.2.5.
    - **WeakMap target→writable mapping** per ADR-008 I-12.
    - **Module-private `Symbol('raw')` markers** per ADR-008 I-11.
    - **Re-entrancy guard** prevents Svelte writable infinite loop (CWE-674) per Amendment 1.2.6.
  - `entityStore(entity)` returns `Readable<Entity<Data>>` — compatible with Svelte template syntax `{$entityStore._data.field}` per ADR-008 Amendment 1.1.1.
  - Lazy `createRequire('svelte/store')` peer-dep load.
  - Peer-optional `svelte: >=4.0.0`.

### Patch Changes

- Updated dependencies [c19e12a]
- Updated dependencies [7c3535f]
  - @gertsai/entity@1.0.0

## 0.1.0

### Minor Changes

Initial release. Svelte framework adapter for `@gertsai/entity` (Tier 2). Per
ADR-008 Decision E + Amendment invariants I-11..I-14 — satisfies the
`ReactiveAdapter` contract from `@gertsai/entity` and ships an
`entityStore` factory for Svelte's `$store` template syntax.

- `svelteReactiveAdapter` — Proxy-based reactivity with a
  `writable`-backed store cached per target in a `WeakMap` (CWE-401
  protected per ADR-008 I-12). Three Proxy traps
  (`set` / `defineProperty` / `deleteProperty`) synchronously notify the
  backing store; a per-target re-entrancy guard prevents infinite loops
  (CWE-674 protected per ADR-008 I-13). `set` trap uses
  `Reflect.set(target, key, value)` without an external receiver
  (CWE-20 / CWE-362 protected).
- `entityStore<Data>(entity)` returns a `Readable<Entity<Data>>`
  compatible with the `$entityStore._data.field` template syntax
  (ADR-008 Amendment 1.1.1).
- Module-private `Symbol('raw')` markers looked up via
  `Object.prototype.hasOwnProperty.call` (CWE-1321 protected per
  ADR-008 I-11).
- Lazy `require('svelte/store')` via `createRequire(import.meta.url)`
  works in both ESM and CJS tsup output (ADR-008 Amendment 1.2.9).
- Peer-optional `svelte: >=4.0.0` — adapter loads only when
  `svelteReactiveAdapter.reactive(...)` is called.
