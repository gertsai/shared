---
depth: standard
id: SPEC-013
kind: spec
last_modified_at: 2026-05-06T19:56:14.015054+00:00
last_modified_by: claude-code/2.1.131
links:
- target: PRD-003
  relation: based_on
- target: ADR-008
  relation: based_on
status: active
title: 'Sprint 3.8 — Wave 5 Phase 3 (4 entity framework adapters: vue + react + solid + svelte)'
---

# SPEC-013: Sprint 3.8 — Wave 5 Phase 3

## Summary

Wave 5 Phase 3 = ship **4 entity framework adapter packages**: `@gertsai/entity-vue` (E+ extract), `@gertsai/entity-react` (F fresh), `@gertsai/entity-solid` (F fresh), `@gertsai/entity-svelte` (F fresh). Per PRD-003 G-5 + ADR-008 Decisions A, B, C, D, E, F. Estimated ~28h dev + 4h orchestration ≈ 1 working week.

Scope strictly bounded — NO Sprint 3.9 work. Branch `feat/sprint-3-8-wave-5-phase-3` off `feat/sprint-3-7-wave-5-phase-2` (preserves Wave 5 Phase 2 baseline).

## Scope

### Track 1: `@gertsai/entity-vue` (T1, F+E+ markers, Tier 2)

NEW Tier 2 package per ADR-008 Decision B. Lifts `vueReactiveAdapter` from `packages/entity/src/vue.ts` to standalone package; existing `entity/vue` subpath becomes re-export shim.

- **W-3-8-1**: Create `packages/entity-vue/` skeleton — `package.json`, `tsconfig.json`, `tsup.config.ts`, `vitest.config.mts`, `src/index.ts`, `src/__tests__/`, `LICENSE` symlink, `README.md`, `CHANGELOG.md`.
  - peerDependencies: `@gertsai/entity: workspace:^`, `@vue/runtime-core: >=3.0.0`.
  - peerDependenciesMeta: `@vue/runtime-core: { optional: true }`.
  - Single export root + `./package.json`.
  - Strategy marker: **F** (fresh package, code lifted).

- **W-3-8-2**: Implement `vueReactiveAdapter` in `src/index.ts` — lift verbatim from `packages/entity/src/vue.ts` (preserve lazy `require('@vue/runtime-core')` pattern; preserve error message wording).

- **W-3-8-3**: Optional `useEntity<Data>(entity: Entity<Data>): Ref<Data> | Data` composable — Vue users typically access `entity._data` directly via reactive proxy (no extra hook needed). Sprint 3.8 ships type re-exports for ergonomics; full composable optional / can defer.

- **W-3-8-4**: Tests (≥10 tests):
  - ReactiveAdapter conformance: 3 base tests (reactive identity, markRaw side-effect, isReactive truth).
  - vue-specific: shallowReactive proxy behavior; markRaw skips wrapping; isReactive correctly identifies vue-wrapped objects.
  - peer-dep gate: missing `@vue/runtime-core` → clear error message.
  - Mock `@vue/runtime-core` for tests (or skip with vi-mocks).

- **W-3-8-5**: README per Sprint 3.6 §template — Install (with peer-dep gate), Quickstart, API table, Security/Caveats, Cross-references к ADR-008, License.

- **W-3-8-6** (E+ refactor): team-lead Phase B replaces `packages/entity/src/vue.ts` impl with re-export shim:
  ```typescript
  // SPDX-License-Identifier: Apache-2.0
  // Backward-compat shim: canonical home of vueReactiveAdapter is now
  // @gertsai/entity-vue (Sprint 3.8 / ADR-008 Decision B).
  export { vueReactiveAdapter } from '@gertsai/entity-vue';
  ```
  + add peerDependencies entry on `@gertsai/entity-vue: workspace:^` in `packages/entity/package.json`.
  + verify existing entity tests pass (regression invariant ADR-008 I-3).

### Track 2: `@gertsai/entity-react` (T2, F marker, Tier 2)

Fresh Tier 2 package per ADR-008 Decision C.

- **W-3-8-7**: Create `packages/entity-react/` skeleton.
  - peerDependencies: `@gertsai/entity: workspace:^`, `react: >=18.0.0`.
  - peerDependenciesMeta: `react: { optional: true }`.
  - Strategy marker: **F**.

- **W-3-8-8**: Implement `reactReactiveAdapter` — `src/adapter.ts`:
  - Internal `Map<object, Set<() => void>>` for subscribe registry per reactive target.
  - Internal `Map<object, number>` for version counter (incremented on mutation).
  - `reactive<T extends object>(target)`:
    - If `markRaw` flag set → return target as-is.
    - Otherwise wrap in `Proxy<T>` with `set` trap incrementing version + notifying subscribers.
    - Cache by target ref to avoid double-wrapping.
  - `markRaw<T>(value)`: sets `Symbol.for('@gertsai/entity-react:raw')` flag.
  - `isReactive(value)`: checks Proxy brand symbol.

- **W-3-8-9**: Implement `useEntity<Data>(entity: Entity<Data>): Data` hook — `src/use-entity.ts`:
  - Uses `React.useSyncExternalStore`:
    - `subscribe(callback)`: registers callback in adapter's subscribe set for `entity._data`; returns unsubscribe.
    - `getSnapshot()`: returns `entity._data` (referential equality preserved unless mutation occurred).
  - Returns `entity._data` for component reads.
  - `import type { Entity } from '@gertsai/entity'` (type-only).
  - `import type { } from 'react'` + lazy runtime require OR conditional dynamic import (worker discretion per ergonomics).

- **W-3-8-10**: Tests (≥15 tests):
  - ReactiveAdapter conformance: 3 base tests.
  - Proxy mutation triggers subscribe callback; mutation on markRaw'd value does NOT trigger.
  - Multiple subscribers all notified.
  - Subscribe/unsubscribe lifecycle (no leak on unmount).
  - useEntity hook integration test:
    - Mock React's `useSyncExternalStore` (or use `@testing-library/react-hooks` if installed).
    - Render entity, mutate `_data`, assert hook returns latest snapshot.
    - Unmount cleans up subscriber.
  - Edge: mutate before subscribe — getSnapshot returns latest data correctly.

- **W-3-8-11**: README per Sprint 3.6 §template — Install, Quickstart (component example with useEntity hook), API table, Security/Caveats (Proxy overhead disclosure, markRaw escape hatch), Cross-references, License.

### Track 3: `@gertsai/entity-solid` (T3, F marker, Tier 2)

Fresh Tier 2 package per ADR-008 Decision D.

- **W-3-8-12**: Create `packages/entity-solid/` skeleton.
  - peerDependencies: `@gertsai/entity: workspace:^`, `solid-js: >=1.0.0`.
  - peerDependenciesMeta: `solid-js: { optional: true }`.
  - Strategy marker: **F**.

- **W-3-8-13**: Implement `solidReactiveAdapter` — `src/adapter.ts`:
  - `reactive<T extends object>(target)`:
    - If `markRaw` flag → return target as-is.
    - Otherwise wrap with Solid `createStore(target)` and return store proxy. Store provides fine-grained reactivity (Solid tracks reads).
  - `markRaw<T>(value)`: sets `Symbol.for('@gertsai/entity-solid:raw')`.
  - `isReactive(value)`: checks Solid store brand (Solid stores have `$NAME` symbol or use `unwrap` to detect).

- **W-3-8-14**: Implement `useEntity<Data>(entity: Entity<Data>): Store<Data>` — `src/use-entity.ts`:
  - Returns the Solid store accessor for `entity._data`.
  - Solid users access `store.field` directly in JSX — fine-grained tracking automatic.

- **W-3-8-15**: Tests (≥12 tests):
  - ReactiveAdapter conformance: 3 base.
  - createStore wrapping; store mutation via setStore triggers Solid effects.
  - markRaw escape hatch.
  - useEntity returns store accessor.
  - Mock Solid runtime for tests OR use Solid's actual test utils if installed.

- **W-3-8-16**: README per template.

### Track 4: `@gertsai/entity-svelte` (T4, F marker, Tier 2)

Fresh Tier 2 package per ADR-008 Decision E.

- **W-3-8-17**: Create `packages/entity-svelte/` skeleton.
  - peerDependencies: `@gertsai/entity: workspace:^`, `svelte: >=4.0.0`.
  - peerDependenciesMeta: `svelte: { optional: true }`.
  - Strategy marker: **F**.

- **W-3-8-18**: Implement `svelteReactiveAdapter` — `src/adapter.ts`:
  - Internal `Map<object, Writable<object>>` for object→store mapping.
  - `reactive<T extends object>(target)`:
    - If `markRaw` flag → return target as-is.
    - Otherwise wrap in Proxy that calls `store.set(...)` on mutation; cache target→store map.
  - `markRaw<T>(value)`: sets `Symbol.for('@gertsai/entity-svelte:raw')`.
  - `isReactive(value)`: checks Proxy brand.

- **W-3-8-19**: Implement `entityStore<Data>(entity: Entity<Data>): Readable<Entity<Data>>` — `src/entity-store.ts`:
  - Wraps entity in Svelte `writable(entity)` store.
  - Subscribes to entity's internal change events (or polls `_data` ref) to trigger store update.
  - Returns `Readable<Entity<Data>>` (consumer cannot directly mutate; use entity API).
  - Compatible with Svelte `$entityStore` syntax in templates.

- **W-3-8-20**: Tests (≥12 tests):
  - ReactiveAdapter conformance: 3 base.
  - Proxy mutation updates writable store; subscribers notified.
  - markRaw escape hatch.
  - entityStore returns Readable<Entity>; subscribe → callback fires on mutation; unsubscribe stops.
  - Mock Svelte's writable/Readable for tests.

- **W-3-8-21**: README per template.

### Track 5: Phase B Integration (T5, team-lead solo)

- **W-3-8-22**: `pnpm install` → lockfile updated; verify 4 new packages recognized; m9s-example has no install issues.
- **W-3-8-23**: `pnpm build` — 35 packages + m9s-example green.
- **W-3-8-24**: `pnpm test` — target ≥4697 + ~50 added (entity-vue ~10 + entity-react ~15 + entity-solid ~12 + entity-svelte ~12 = ~49) → target ≥4746.
- **W-3-8-25**: `pnpm typecheck`, `pnpm run lint`, `pnpm run depcruise`, `pnpm publint` — all green.
- **W-3-8-26**: E+ refactor for `@gertsai/entity` — replace `packages/entity/src/vue.ts` impl with re-export shim from `@gertsai/entity-vue`; add peer-dep on entity-vue. Verify entity regression tests pass.
- **W-3-8-27**: Update `CLAUDE.md` tier table 31 → 35; add 4 rows.
- **W-3-8-28**: Create 4 changesets (entity-vue minor + entity patch; entity-react minor; entity-solid minor; entity-svelte minor).

### Track 6: Phase C+D Audit + Evidence (T6, team-lead solo)

- **W-3-8-29**: Post-Build fidelity audit — 4 reviewers parallel (entity-vue-fidelity, entity-react-fidelity, entity-solid-fidelity, entity-svelte-fidelity).
- **W-3-8-30**: Address P0/P1 findings (if any).
- **W-3-8-31**: Create EVID-015 (verdict=supports, CL3, structured measurements).
- **W-3-8-32**: Activate SPEC-013.
- **W-3-8-33**: Single atomic commit `feat(monorepo): Sprint 3.8 — Wave 5 Phase 3`.
- **W-3-8-34**: Hindsight retain Group 40.

## Out of scope

- Sprint 3.9 (4 Orchestra HIGH candidates) — separate sprint.
- React `useEntityField<Data, K>` granular hook — defer (W-3-8-9 ships only base `useEntity`).
- Vue Composition API `useEntity` composable beyond type re-exports — defer; Vue users access reactive `_data` directly.
- Solid produce / setStore overrides — defer; Sprint 3.8 uses default createStore semantics.
- Svelte derived store helpers — defer; Sprint 3.8 ships base `entityStore` only.
- HTTP framework adapters for runtime-context — Wave 6+.
- TypedToken<T> for ProviderContext — Wave 6+.
- v0.2.0 publish gate — separate user confirmation.

## Strategy markers

| Track | Marker | Meaning |
|-------|--------|---------|
| T1 entity-vue | F (NEW package) + E+ (entity vue subpath becomes shim) | Fresh package + Enhancement of entity additive shim refactor |
| T2 entity-react | F | Fresh fully implementation |
| T3 entity-solid | F | Fresh |
| T4 entity-svelte | F | Fresh |

## Data Models

### `@gertsai/entity-vue` exports

```typescript
export { vueReactiveAdapter } from './adapter.js';
// optional Sprint 3.8.x: useEntity composable
```

### `@gertsai/entity-react` exports

```typescript
export { reactReactiveAdapter } from './adapter.js';
export { useEntity } from './use-entity.js';
// useEntity<Data>(entity: Entity<Data>): Data — uses React.useSyncExternalStore
```

### `@gertsai/entity-solid` exports

```typescript
export { solidReactiveAdapter } from './adapter.js';
export { useEntity } from './use-entity.js';
// useEntity<Data>(entity: Entity<Data>): Store<Data> from solid-js/store
```

### `@gertsai/entity-svelte` exports

```typescript
export { svelteReactiveAdapter } from './adapter.js';
export { entityStore } from './entity-store.js';
// entityStore<Data>(entity: Entity<Data>): Readable<Entity<Data>>
```

## Acceptance Checklist

- [ ] T1 (W-3-8-1..6): @gertsai/entity-vue NEW + entity vue subpath shim refactor; existing tests pass; ≥10 tests in entity-vue.
- [ ] T2 (W-3-8-7..11): @gertsai/entity-react NEW; ReactiveAdapter + useEntity hook; ≥15 tests.
- [ ] T3 (W-3-8-12..16): @gertsai/entity-solid NEW; ReactiveAdapter + useEntity store accessor; ≥12 tests.
- [ ] T4 (W-3-8-17..21): @gertsai/entity-svelte NEW; ReactiveAdapter + entityStore Readable; ≥12 tests.
- [ ] T5 (W-3-8-22..28): full repo verify green; CLAUDE.md tier 31 → 35; 4 changesets.
- [ ] T6 (W-3-8-29..34): post-Build audit done; EVID-015 active; SPEC-013 active; commit; Hindsight retain.

## Sprint 3.8 acceptance bundle

1. 4 framework adapter packages publishable as 0.1.0 candidates (NOT yet on npm — separate publish gate).
2. `@gertsai/entity` patch bumped (E+ shim refactor for vue subpath).
3. Test count: 4697 → ≥4746 (~49 added).
4. Package count: 31 → 35.
5. Branch state: 1 atomic commit on `feat/sprint-3-8-wave-5-phase-3`.
6. ADR-008 invariants I-1..I-10 preserved (verified by audit).
7. Wave 4/5 invariants preserved (entity core has no concrete framework runtime).
8. Backward compat for `@gertsai/entity/vue` subpath verified (regression test imports both `entity/vue` and `entity-vue` — identical behavior).

## Risks

| ID | Risk | Mitigation |
|----|------|------------|
| R-1 | entity-vue extract breaks `entity/vue` subpath consumers | shim re-exports verbatim; regression test |
| R-2 | React adapter Proxy overhead | benchmark in tests; markRaw escape hatch |
| R-3 | Solid createStore deep-vs-shallow mismatch | use produce pattern; document semantic |
| R-4 | Svelte writable subscribe timing | sync notify in Proxy set trap; test suite |
| R-5 | peer-dep version range conflicts | per-framework stable major; document compat matrix in README |
| R-6 | ReactiveAdapter conformance drift | shared 3-test fixture inline in each package |

## File ownership matrix

| Worker | Owns | Reads only |
|--------|------|------------|
| **entity-vue-worker** | `packages/entity-vue/**` (NEW) | `packages/entity/src/vue.ts` (lift source) |
| **entity-react-worker** | `packages/entity-react/**` (NEW) | `packages/entity/src/types.ts` (ReactiveAdapter type) |
| **entity-solid-worker** | `packages/entity-solid/**` (NEW) | `packages/entity/src/types.ts` |
| **entity-svelte-worker** | `packages/entity-svelte/**` (NEW) | `packages/entity/src/types.ts` |
| **team-lead Phase B** | `packages/entity/src/vue.ts` (E+ refactor → re-export shim), `packages/entity/package.json` (peer-dep on entity-vue), CLAUDE.md, lockfile, `.changeset/sprint-3-8-*.md` (NEW × 4) | all packages |

**Conflict-free guarantee**: 0 shared files between Wave 1 workers. team-lead Phase B owns entity vue subpath refactor + entity package.json — sequential after Wave 1.

## Implementation Plan — sequenced для AgentTeams

### Wave 1 (4∥ workers, parallel)

- **entity-vue-worker** (T1, W-3-8-1..5). Subagent: `agents-domain:typescript-pro`. Lifts `vueReactiveAdapter`.
- **entity-react-worker** (T2, W-3-8-7..11). Subagent: `agents-domain:typescript-pro` or `agents-domain:frontend-developer`. Builds Proxy + useEntity.
- **entity-solid-worker** (T3, W-3-8-12..16). Subagent: `agents-domain:typescript-pro`. Solid createStore wrapping.
- **entity-svelte-worker** (T4, W-3-8-17..21). Subagent: `agents-domain:typescript-pro`. Svelte writable wrapping.

All 4 may import `@gertsai/entity` types immediately (Sprint 3.4 published). Each adapter package self-contained.

### Wave 2 (team-lead solo)

- **Phase B verify** (T5, W-3-8-22..28). Sequential — entity vue subpath shim refactor + CLAUDE.md + lockfile + 4 changesets.

### Wave 3 (4∥ reviewers, post-Build audit)

- **entity-vue-fidelity**, **entity-react-fidelity**, **entity-solid-fidelity**, **entity-svelte-fidelity**.

### Wave 4 (team-lead solo)

- **Address P0/P1** + **EVID-015 + activate + commit + Hindsight Group 40** (T6, W-3-8-29..34).

## Affected Files

**Wave 1 creates**:
- `packages/entity-vue/**` (NEW)
- `packages/entity-react/**` (NEW)
- `packages/entity-solid/**` (NEW)
- `packages/entity-svelte/**` (NEW)

**Wave 2 (team-lead Phase B)**:
- `packages/entity/src/vue.ts` (refactor → re-export shim)
- `packages/entity/package.json` (peer-dep entity-vue)
- `CLAUDE.md`
- `pnpm-lock.yaml`
- `.changeset/sprint-3-8-{entity-vue,entity-react,entity-solid,entity-svelte}.md` (NEW × 4)

**Wave 4 (team-lead Phase D)**:
- `.forgeplan/evidence/EVID-015-sprint-3-8-shipped.md` (NEW)

## Related Artifacts

| Artifact | Type | Relation |
|----------|------|----------|
| PRD-003 (Wave 5) | PRD | based_on |
| ADR-008 (Wave 5 Phase 3 framework adapters) | ADR | based_on |
| ADR-007 (Wave 5 Phase 2 placement) | ADR | informs |
| ADR-006 (Wave 5 Phase 1 placement) | ADR | informs |
| ADR-005 (Wave 4 storage architecture) | ADR | informs (Wave 4 invariants preserved) |
| EVID-014 (Sprint 3.7 baseline) | Evidence | informs |

> **Next step**: SPEC-013 validate + activate → pre-Build audit (5 reviewers parallel) → Build (4 workers parallel) → Phase B verify → Phase C post-Build audit (4 reviewers) → Phase D EVID-015 + commit + Hindsight.

---

## Amendment 1 — Pre-Build audit findings (2026-05-06)

5∥ pre-Build reviewers delivered findings. Workers MUST follow Amendment 1 over original W-items where they disagree. Cross-reference: ADR-008 Amendment 1 (full rationale + invariants I-11..I-14).

### A1.1 — W-item supersessions

**W-3-8-8 SUPERSEDED** (entity-react adapter): per ADR-008 Amendment I-11/I-12/I-13:
- Use `WeakMap<object, Set<callback>>` (NOT `Map`) for subscribe registry.
- Use module-private `const RAW = Symbol('raw')` (NOT `Symbol.for`) for raw markers.
- Implement 3 Proxy traps: `set`, `defineProperty`, `deleteProperty`. All 3 notify subscribers synchronously.
- `set` trap uses `Reflect.set(target, key, value)` (NO external receiver).
- Re-entrancy guard (per-target boolean) prevents infinite loop.
- Internal version counter incremented on mutation (for React getSnapshot tracking).

**W-3-8-9 SUPERSEDED** (entity-react useEntity hook): `getSnapshot()` MUST return version snapshot mechanism per ADR-008 Amendment 1.2.10. Two valid options (worker discretion):
- Option A: `getSnapshot()` returns version number; `useSyncExternalStore<number>`; component reads via separate `entity._data` access.
- Option B: `getSnapshot()` returns `{ data: entity._data, version: currentVersion }` wrapper; component destructures.
Choose Option B for ergonomics (TS infers `Data` cleanly).

**W-3-8-13 SUPERSEDED** (entity-solid): use Solid `produce` pattern for mutation propagation (per ADR-008 R-3); module-private `Symbol('raw')` for markers. WeakMap NOT required (Solid's createStore handles GC internally), but document.

**W-3-8-18 SUPERSEDED** (entity-svelte adapter): per ADR-008 I-11/I-12/I-13:
- WeakMap for object→writable mapping.
- Module-private Symbol for raw.
- 3 Proxy traps + sync notify + re-entrancy guard.
- `Reflect.set(target, k, v)` without receiver.

**W-3-8-19 SUPERSEDED** (entity-svelte entityStore): return type stays `Readable<Entity<Data>>` (not `Readable<Data>`). Quickstart syntax MUST be `{$entityStore._data.field}` (NOT `{$entityStore.field}` — that was incorrect in original spec). Per ADR-008 Amendment 1.1.1.

**W-3-8-26 SUPERSEDED** (Phase B entity vue subpath shim): entity package.json gains `peerDependencies` entry `@gertsai/entity-vue: workspace:^` AND `peerDependenciesMeta.@gertsai/entity-vue.optional: true` per ADR-008 Amendment 1.2.1. Without optional flag, all non-Vue entity consumers see resolution warnings.

**W-3-8-2 SUPERSEDED** (entity-vue lift): `import { ReactiveAdapter } from '@gertsai/entity'` — type-only via `import type`. NO import from `@gertsai/entity/vue` subpath (avoids transient circular import during Wave 1 build). Lift verbatim impl from `packages/entity/src/vue.ts`.

**W-3-8-2/8/13/18 ALL** (lazy require pattern): use `createRequire(import.meta.url)` from `node:module` per ADR-008 Amendment 1.2.9 — works in both ESM and CJS tsup output.

**W-3-8-1/7/12/17 ALL** (tsup.config.ts): MUST include `external: ['@gertsai/entity', '<framework-runtime>']` per ADR-008 Amendment 1.2.11 — preserves cross-package generic identity.

### A1.2 — Test fixture additions (adversarial)

**W-3-8-10/15/20 SUPERSEDED** (test fixtures): each adapter test suite MUST include adversarial tests per ADR-008 Amendment 1.2.2..1.2.7:
- `prototype-pollution.test.ts`: `Object.prototype[RAW] = true` does NOT affect adapter behavior (module-private Symbol guard).
- `weakmap-gc.test.ts`: 1000 entities created+dropped; after global.gc(); registry size remains bounded (use `--expose-gc` + WeakRef sentinel).
- `proxy-bypass.test.ts`: `Reflect.set(proxy, 'x', 1, attackerReceiver)` MUST notify; `Object.defineProperty(proxy, 'k', {})` MUST notify; `delete proxy.k` MUST notify.
- `re-entrancy.test.ts`: subscriber that mutates same target does NOT cause stack overflow (sync notify + boolean guard).
- `unmount-race.test.ts` (entity-react only): rapid mount→mutate→unmount sequence does NOT trigger callbacks after unmount.

### A1.3 — README per Amendment 1.3

All 4 adapter READMEs follow Sprint 3.6 §template adjusted per A1.3.1 (no Subpath section — single-export packages). Mandatory sections: Install / Quickstart / API / Compatibility (peer-dep matrix) / Security/Caveats / Migration (entity-vue only) / Cross-references / License.

### A1.4 — File ownership matrix update

No changes (file ownership already disjoint per SPEC-013 §"File ownership matrix").

### A1.5 — Out of scope additions

Per ADR-008 Amendment A1.3.9: "Sprint 3.8 does NOT add framework adapter usage to m9s-example (m9s is backend example; UI framework integration TBD via separate frontend example in Wave 6+)."

### Amendment 1 changelog

Cross-reference ADR-008 Amendment 1 changelog table for full source attributions.






