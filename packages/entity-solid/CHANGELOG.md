# @gertsai/entity-solid

## 2.0.0

### Patch Changes

- Updated dependencies [80ca808]
  - @gertsai/entity@1.1.0

## 1.0.0

### Minor Changes

- 7c3535f: Initial release of `@gertsai/entity-solid` — Solid.js framework adapter for `@gertsai/entity`. Ships `solidReactiveAdapter` (createStore + produce-backed reactive proxy with 3 Proxy traps for fine-grained Solid signal updates) and `useEntity` accessor. Module-private Symbol markers (CWE-1321 protected per ADR-008 I-11). Lazy peer-dep loading via `createRequire(import.meta.url)` (Amendment 1.2.9). Peer-optional `solid-js: >=1.0.0`. Per ADR-008 Decision D + SPEC-013 W-3-8-12..16 + Amendment 1 invariants I-11..I-14.

### Patch Changes

- Updated dependencies [c19e12a]
- Updated dependencies [7c3535f]
  - @gertsai/entity@1.0.0

## 0.1.0

Initial release. Solid reactivity adapter for `@gertsai/entity`:

- `solidReactiveAdapter` — `createStore`-backed reactive proxy with fine-grained tracking.
- `useEntity(entity)` — Solid store accessor returning `entity._data`.
- Module-private `Symbol('raw')` markers (CWE-1321 protected per ADR-008 I-13).
- Lazy peer-dep loading via `createRequire` — package imports without `solid-js` installed unless adapter is invoked.
- Peer-optional `solid-js: >=1.0.0`.

Per SPEC-013 W-3-8-12..16 + Amendment 1 + ADR-008 Decision D + invariants I-11..I-14.
