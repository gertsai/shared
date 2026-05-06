---
'@gertsai/entity-svelte': minor
---

Initial release. Svelte framework adapter for @gertsai/entity (Tier 2).

- `svelteReactiveAdapter` — Proxy-based reactivity backed by `writable` Svelte store:
  - **3 Proxy traps** (set + defineProperty + deleteProperty) all sync notify per ADR-008 I-13.
  - **`Reflect.set(target, key, value)` without external receiver** per Amendment 1.2.5.
  - **WeakMap target→writable mapping** per ADR-008 I-12.
  - **Module-private `Symbol('raw')` markers** per ADR-008 I-11.
  - **Re-entrancy guard** prevents Svelte writable infinite loop (CWE-674) per Amendment 1.2.6.
- `entityStore(entity)` returns `Readable<Entity<Data>>` — compatible with Svelte template syntax `{$entityStore._data.field}` per ADR-008 Amendment 1.1.1.
- Lazy `createRequire('svelte/store')` peer-dep load.
- Peer-optional `svelte: >=4.0.0`.
