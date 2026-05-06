# @gertsai/entity-solid

## 0.1.0

Initial release. Solid reactivity adapter for `@gertsai/entity`:

- `solidReactiveAdapter` — `createStore`-backed reactive proxy with fine-grained tracking.
- `useEntity(entity)` — Solid store accessor returning `entity._data`.
- Module-private `Symbol('raw')` markers (CWE-1321 protected per ADR-008 I-13).
- Lazy peer-dep loading via `createRequire` — package imports without `solid-js` installed unless adapter is invoked.
- Peer-optional `solid-js: >=1.0.0`.

Per SPEC-013 W-3-8-12..16 + Amendment 1 + ADR-008 Decision D + invariants I-11..I-14.
