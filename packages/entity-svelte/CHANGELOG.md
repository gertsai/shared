# @gertsai/entity-svelte

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
