# @gertsai/entity-react

## 3.0.0

### Patch Changes

- Updated dependencies [9de7cf7]
  - @gertsai/entity@1.2.0

## 2.0.1

### Patch Changes

- fed737c: Wave 19 — close 5 HIGH + 7 MED findings from EVID-074 (Wave 18 entity adapter audit).

  Tests: 75 → **119** across 4 adapter packages (+44 new tests, +8 files). Workspace typecheck 0 errors across 45 projects.

  **FR-001 (H-V1) — notify-timing JSDoc**:

  - `@gertsai/entity` `ReactiveAdapter` interface JSDoc explicitly names per-adapter notify timing
  - Vue: microtask via Vue flush queue
  - React: sync
  - Svelte: sync
  - Solid: sync via Solid store
  - Consumers swapping adapters now have contract documented

  **FR-002 (H-R1, H-Sv1) — re-entrancy contract pin**:

  - entity-react + entity-svelte `re-entrancy.test.ts`: 10 new tests asserting the contract
  - **Decision: pin contract + JSDoc, do NOT change adapter.** Audit conflated implementation order with semantic correctness. The implementation IS correct: underlying target IS mutated (inner trap's `Reflect.set` runs before `notify()` early-returns); only the explicit notification is suppressed. `useSyncExternalStore` reads live proxy + live version on next snapshot.
  - Tests pin: no stack overflow, target reflects final mutation, subscribers fire at-most-once per outer burst, version counter bumps once per burst, subsequent non-re-entrant writes produce fresh notifications.

  **FR-003 (H-S1, M-S1, M-S3) — Solid test parity**:

  - 4 new Solid test files mirroring entity-react/svelte: `proxy-traps.test.ts`, `re-entrancy.test.ts`, `weakmap-gc.test.ts`, `prototype-pollution.test.ts`
  - All run against **real `solid-js/store`** runtime (no `vi.mock`) per audit L-S2
  - Solid 1.x → 2.x behavioural drift now observable in CI
  - 16 → 38 tests in entity-solid (+22, +137%)

  **FR-004 (H-S2) — Solid set trap try/catch**:

  - All 3 Solid traps (`set`, `deleteProperty`, `defineProperty`) wrap `setStore(produce(...))` in try/catch
  - Write failures now surface (re-thrown) instead of silently reporting `true`

  **FR-005 (M-Sv1) — entityStore adapter check**:

  - `entityStore()` now calls `svelteReactiveAdapter.isReactive(target)` and throws informative Error if entity built with foreign adapter
  - 2 new tests pin behavior

  **FR-006 (M-V1, L-S1) — \_\_resetCacheForTests**:

  - Added `__resetVueCacheForTests` + `__resetSolidCacheForTests` as `@internal` exports mirroring svelte's `__resetWritableCacheForTests`
  - 2 new tests exercise the seams

  **FR-007 (M-R2) — markRaw non-reversibility tests**:

  - 4 new tests per adapter (12 total) asserting `markRaw` invariants
  - **Vue note**: Vue's own `markRaw` uses `__v_skip` with `configurable: true, writable: false` (NOT `configurable: false` like React/Svelte/Solid). Vue tests assert Vue's actual contract rather than imposing stricter shape — audit's claim "all four use configurable: false" was inaccurate for Vue.

  **Behaviour break (Solid only)**: FR-004 changes Solid's `set`/`deleteProperty`/`defineProperty` from silent-fail-with-true to throw-on-failure. Pre-fix code that silently relied on writes succeeding (where they were actually failing) will now surface the failure. Minor bump for entity-solid; other adapters patch.

  After Wave 18+19, all entity adapter audit findings closed. Remaining EVID-074 LOW items (5) + Wave 20 candidates (React WeakMap state consolidation + subscriber API lift into `ReactiveAdapter` interface for v1.0.0) deferred.

  Refs: PRD-057, EVID-074 (Wave 18 audit), ADR-008, Sprint 3.8 W-3-8-{1..21}.

- Updated dependencies [fed737c]
  - @gertsai/entity@1.1.2

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
