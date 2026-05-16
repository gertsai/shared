# @gertsai/entity-react

## 2.0.0

### Patch Changes

- Updated dependencies [80ca808]
  - @gertsai/entity@1.1.0

## 1.0.0

### Minor Changes

- 7c3535f: Initial release. React framework adapter for @gertsai/entity (Tier 2).

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

### Patch Changes

- 782a3e0: Sprint 3.10 — Wave 5 P2 polish batch (additive non-breaking).

  `@gertsai/errors` (MINOR — observable behavior change for nested redaction):

  - `wrapUnknownError(x, kind?, correlationId?)` — `kind?` now applied via closed allow-list `'INTERNAL' | 'EXTERNAL'` (TS 2-arity union). `isAppError(x)` early-return preserved (no kind override on already-typed errors). Mitigates CWE-285 (error coercion for auth bypass).
  - `AppError` constructor JSDoc note re shallow `Object.freeze` (deep-freeze deferred).
  - `redactDetails()` now deep-scans recursively (max depth 5, breadth cap 1000, WeakSet anti-cycle, non-plain objects passthrough — Date/RegExp/Buffer left as-is). Mitigates CWE-209 nested info exposure + CWE-400/674 DoS via crafted payloads.
  - `errors/internal.ts` JSDoc clarification (catch-all `D` intentional; subclassing path documented).
  - README cross-references switched to absolute repo URLs (post-publish friendliness; scope expanded to all 13 Wave 5 package READMEs).

  Other Wave 5 packages (PATCH — JSDoc/comment polish, no behavior change):

  - `@gertsai/tenant-resolver`: `MOLECULER_*_HINT` message split (`NON_MOLECULER_CTX_ERROR` vs `MOLECULER_PEER_DEP_ERROR`), `PathStrategy` `...` wildcard JSDoc (trailing-only), `lookupHeader()` precedence note (exact-case-first short-circuit).
  - `@gertsai/runtime-context`: `requireAuthContextWithDataAccess` JSDoc clarified Session.dataAccessUuid getter fallback semantic.
  - `@gertsai/entity-storage`: `BaseEntityStorageService.upsert` 2-RTT cost JSDoc (cross-link KNOWN-ISSUES §10).
  - `@gertsai/entity-react`: `markRaw` `configurable: false` JSDoc (escape-hatch intentionally irreversible).
  - `@gertsai/rest-request-manager`: log `error.cause` chain on transport failure (5-level WeakSet bounded).
  - `@gertsai/async-utils`: `retry` JSDoc cross-ref to thundering herd Sprint 3.9 Amendment 1.2.7 default `'full'` jitter rationale.

  Refs ADR-010 §A + Amendment 1 §A1.2 (wrapUnknownError allow-list) + §A1.3 (redactDetails deep-scan).

- Updated dependencies [c19e12a]
- Updated dependencies [7c3535f]
  - @gertsai/entity@1.0.0

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
