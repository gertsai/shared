# @gertsai/entity-react

## 0.1.0

Initial release. React framework adapter for `@gertsai/entity` (Tier 2).

- `reactReactiveAdapter` — Proxy-based reactivity with `WeakMap` subscribe registry
  (CWE-401 / CWE-672 protected per ADR-008 Amendment I-12).
- `useEntity(entity)` hook using `React.useSyncExternalStore` for re-render binding.
- 3 Proxy traps (`set` + `defineProperty` + `deleteProperty`) for full mutation
  coverage; sync notify; version-snapshot `getSnapshot` for React identity
  tracking (per ADR-008 Amendment 1.2.10).
- Module-private `Symbol('raw')` markers (CWE-1321 protected per ADR-008 I-11).
- Peer-optional `react: >=18.0.0` (per ADR-008 Decision C, I-4).
- ReactiveAdapter contract conformance (3 base tests).
