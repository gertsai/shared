---
'@gertsai/entity-react': minor
---

Initial release. React framework adapter for @gertsai/entity (Tier 2).

- `reactReactiveAdapter` — Proxy-based reactivity:
  - **3 Proxy traps** (set + defineProperty + deleteProperty) all sync notify subscribers per ADR-008 I-13.
  - **`Reflect.set(target, key, value)` without external receiver** prevents bypass via attacker-controlled receiver per Amendment 1.2.5.
  - **WeakMap subscribe registry** per ADR-008 I-12 (CWE-401 memory leak / CWE-672 use-after-free protection).
  - **Module-private `Symbol('raw')` markers** per ADR-008 I-11 (CWE-1321 prototype pollution protection).
  - Re-entrancy guard prevents stack overflow on subscribers that mutate same target.
- `useEntity(entity)` hook using `useSyncExternalStore` for React re-render binding.
- `getSnapshot()` returns version snapshot wrapper per Amendment 1.2.10 — fixes React identity tracking.
- Lazy `createRequire('react')` peer-dep load.
- Peer-optional `react: >=18.0.0`.
