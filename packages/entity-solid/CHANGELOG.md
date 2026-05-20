# @gertsai/entity-solid

## 2.1.0

### Minor Changes

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

### Patch Changes

- Updated dependencies [fed737c]
  - @gertsai/entity@1.1.2

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
