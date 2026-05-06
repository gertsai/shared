---
depth: standard
id: ADR-008
kind: adr
last_modified_at: 2026-05-06T19:54:25.092082+00:00
last_modified_by: claude-code/2.1.131
links:
- target: PRD-003
  relation: based_on
- target: ADR-007
  relation: refines
status: active
title: Framework adapters policy + ReactiveAdapter contract (Wave 5 Phase 3)
---

# ADR-008: Framework adapters policy + ReactiveAdapter contract (Wave 5 Phase 3)

## Context

Wave 5 Phase 2 (Sprint 3.7, EVID-014) shipped 3 Tier 2/4 packages — `@gertsai/runtime-context`, `@gertsai/session-guard`, `@gertsai/audit-primitives`. Foundation in place. Wave 5 Phase 3 (Sprint 3.8) ships **UI framework adapters** for `@gertsai/entity` so Vue/React/Solid/Svelte consumers get framework-native reactivity бесплатно.

`@gertsai/entity` (Wave 4 Sprint 3.4) already declares `ReactiveAdapter` interface (`packages/entity/src/types.ts`):

```typescript
export interface ReactiveAdapter {
  reactive<T extends object>(target: T): T;
  markRaw<T>(value: T): T;
  isReactive(value: unknown): boolean;
}
```

Default `plainReactiveAdapter` (`packages/entity/src/adapters/plain.ts`) is a pass-through (no reactivity). Existing `@gertsai/entity/vue` subpath provides `vueReactiveAdapter` using `@vue/runtime-core` lazily.

**Problem**: ReactiveAdapter contract was designed для Vue's proxy-based reactivity. React has hooks-driven reactivity (no runtime proxy). Solid uses signals + stores. Svelte uses writable stores. Each framework needs **two artifacts**:

1. `ReactiveAdapter` implementation (mostly to satisfy entity's SPI — for some frameworks just a no-op or pass-through).
2. Framework-native binding helper (`useEntity` hook for React, `entityStore` for Svelte, etc.) — outside ReactiveAdapter contract.

Without this clarification, workers will impromptu invent inconsistent binding patterns. Sprint 3.6+3.7 audit cycle showed pre-Build clarification of API surface saves Build rework.

Three architectural decisions need fixation BEFORE SPEC-013:

1. **Extension to ReactiveAdapter contract**: какой shape должен ship adapter package — strict ReactiveAdapter only, OR ReactiveAdapter + framework-native binding helper.
2. **`@gertsai/entity-vue` extraction strategy**: lift from `packages/entity/vue` subpath OR keep subpath OR both? Backward-compat for existing consumers using `import { vueReactiveAdapter } from '@gertsai/entity/vue'`.
3. **Per-framework adapter design**: React (useSyncExternalStore + subscribe), Solid (createStore), Svelte (writable). Each adapter package ships ReactiveAdapter + binding helper(s).
4. **Wave 5 Phase 3 invariants**: no concrete framework runtime in `@gertsai/entity` core; peer-optional UI framework runtimes; backward-compat preservation for existing `entity/vue` subpath consumers.

## Decision

### Decision A — Adapter package shape

Each Sprint 3.8 framework adapter package ships **two artifacts** in single root export:

1. **`<framework>ReactiveAdapter: ReactiveAdapter`** — satisfies existing entity SPI. May be no-op pass-through for frameworks where reactivity is hook-driven (React) — entity's mutation via `_data` already works without proxy; the framework-native binding helper handles re-render.

2. **Framework-native binding helper(s)** — exported as named exports alongside the adapter. Each framework chooses the most idiomatic shape:
   - **Vue**: `vueReactiveAdapter` + `useEntity(entity)` (composable returning reactive `_data` ref) [optional — Vue users often access entity._data directly via reactive proxy].
   - **React**: `reactReactiveAdapter` (proxy with internal subscribe) + `useEntity(entity)` hook using `useSyncExternalStore`.
   - **Solid**: `solidReactiveAdapter` (createStore-backed proxy) + `useEntity(entity)` returns Solid store.
   - **Svelte**: `svelteReactiveAdapter` (writable-backed proxy) + `entityStore(entity)` returns Svelte `Readable<Entity>` (compatible with `$store` syntax).

**Key design choices**:

- Single export root per adapter package. No subpaths (each framework gets its own package).
- Peer-dep on framework runtime (`vue` / `react` / `solid-js` / `svelte`) marked **optional** via peerDependenciesMeta — installation gates trigger only when adapter is imported.
- Adapter implementation MAY use lazy `require()` for framework runtime (preserves entity/vue Sprint 3.4 pattern) OR `import type` only with runtime resolution via dynamic `import()` — worker discretion per ergonomics.
- Each adapter test file includes ReactiveAdapter contract conformance tests (3 base tests: reactive identity, markRaw side-effect, isReactive truth).

### Decision B — `@gertsai/entity-vue` extraction strategy

`@gertsai/entity-vue` v0.1.0 (NEW package) **lifts** `vueReactiveAdapter` impl from `packages/entity/src/vue.ts`. The existing `@gertsai/entity/vue` subpath is **preserved as backward-compat re-export shim** redirecting to the new package.

**Strategy markers**:
- `@gertsai/entity-vue`: **F** (fresh package, code lifted from existing entity subpath — but the package itself is new).
- `@gertsai/entity` (vue subpath): **E+** (additive enhancement — subpath now re-exports from `@gertsai/entity-vue`; existing imports work unchanged).

**Backward-compat invariant**: `import { vueReactiveAdapter } from '@gertsai/entity/vue'` MUST continue to work without changes for existing consumers (m9s-example or downstream apps). Verified by regression test against existing entity package.

`@gertsai/entity-vue` adds peer-dep on `@gertsai/entity: workspace:^` (re-uses ReactiveAdapter type) and peer-optional `@vue/runtime-core: >=3.0.0`.

### Decision C — `@gertsai/entity-react` design

Fresh Tier 2 package per ADR-008 §A. React reactivity is hook-driven; adapter is a thin proxy + subscribe system, the **`useEntity(entity)` hook** does heavy lifting.

**Key design choices**:

1. **`reactReactiveAdapter: ReactiveAdapter`**:
   - `reactive<T>(target)`: returns Proxy that intercepts mutations and triggers internal subscribe callbacks. Plain object semantics preserved (read-through).
   - `markRaw<T>(value)`: sets internal `Symbol.for('@gertsai/entity-react:raw')` to skip Proxy wrapping (escape hatch for non-reactive values).
   - `isReactive(value)`: checks Proxy brand symbol.

2. **`useEntity<Data>(entity: Entity<Data>): Data` hook** — uses `React.useSyncExternalStore`:
   - `subscribe(callback)`: registers callback in adapter's internal subscriber set; returns unsubscribe function.
   - `getSnapshot()`: returns `entity._data` reference; React tracks via Object.is for re-render trigger.
   - When `entity.$patch(...)` mutates `_data`, adapter increments internal version + notifies subscribers → React re-renders.

3. **`useEntityField<Data, K extends keyof Data>(entity, fieldKey): Data[K]` granular hook** (optional, future-friendly): uses Object.is on field-level for fine-grained re-render. Sprint 3.8 ships only base `useEntity`; granular variant optional.

4. **Peer-deps**: `@gertsai/entity: workspace:^` (peer), `react: >=18.0.0` (peer-optional via peerDependenciesMeta).

### Decision D — `@gertsai/entity-solid` design

Fresh Tier 2 package. Solid uses createStore + signals; adapter wraps with createStore for fine-grained reactivity.

**Key design choices**:

1. **`solidReactiveAdapter: ReactiveAdapter`**:
   - `reactive<T>(target)`: returns Solid store proxy via `createStore(target)`. Mutations through `setStore(...)` trigger fine-grained Solid updates.
   - `markRaw<T>(value)`: sets internal symbol; createStore skips wrapping.
   - `isReactive(value)`: checks Solid store brand.

2. **`useEntity<Data>(entity: Entity<Data>): Store<Data>` helper** — returns Solid `Store<Data>` accessor (calling `entity._data.field` IS the reactive read in Solid).

3. **Peer-deps**: `@gertsai/entity: workspace:^`, `solid-js: >=1.0.0` (peer-optional).

### Decision E — `@gertsai/entity-svelte` design

Fresh Tier 2 package. Svelte uses writable stores + subscribe pattern.

**Key design choices**:

1. **`svelteReactiveAdapter: ReactiveAdapter`**:
   - `reactive<T>(target)`: returns Proxy that updates a backing `writable(target)` on mutation.
   - `markRaw<T>(value)`: sets symbol marker.
   - `isReactive(value)`: checks Proxy brand.

2. **`entityStore<Data>(entity: Entity<Data>): Readable<Entity<Data>>`** factory — returns Svelte `Readable<Entity>` wrapping the entity. Consumer uses `$store` syntax in templates: `{$entityStore.field}`.

3. **Peer-deps**: `@gertsai/entity: workspace:^`, `svelte: >=4.0.0` (peer-optional).

### Decision F — Wave 5 Phase 3 extraction policy (extends ADR-007 Decision D)

Применимо к Sprint 3.8. Дополняет ADR-007 Decision D.

1. **Subpath isolation**: each framework adapter is OWN package (no subpaths). Single root export per package. Tree-shake friendly; consumers install only the framework they use.

2. **No concrete framework runtime imports in `@gertsai/entity` core** (Wave 4 invariant ADR-005 I-2 preserved). All framework-specific code stays in adapter packages.

3. **Backward-compat preservation**: `@gertsai/entity/vue` subpath continues to work via re-export shim.

4. **ReactiveAdapter contract not modified**: existing 3-method interface unchanged. Framework-native binding helpers are EXTRA exports per package, not interface extensions.

5. **Strategy markers**: F (fresh) for entity-react/solid/svelte; F+E+ split for entity-vue (F new package; E+ entity vue subpath becomes re-export).

6. **Tier placement**: all 4 framework adapters Tier 2 (depend on Tier 2 entity package + framework runtime peer-optional).

7. **Reuse Wave 4/5 extraction principles**: SPDX header on every new file; README per Sprint 3.6 §template; no breaking changes to existing entity API.

## Alternatives Considered

| Option | Verdict | Why |
|--------|---------|-----|
| A1 — Single mega-adapter package `@gertsai/entity-frameworks` containing all 4 | Rejected | Forces Vue users to bundle React + Solid + Svelte runtime even if peer-optional; tree-shake limited; install-time confusion. |
| A2 — Subpaths within `@gertsai/entity` itself: `entity/react`, `entity/solid`, etc. | Rejected | Bloats core package size; entity already has /vue subpath as exception (kept for backward-compat). Wave 4 ADR-005 I-2 already says "optional UI-framework adapter в subpath" was Wave 4 baseline; Wave 5 elevates to standalone packages for cleaner versioning. |
| **A3 — One package per framework + entity/vue backward-compat shim** | **Chosen** | Clean separation; each framework versioning independent; tree-shake optimal; backward-compat preserved. |
| B1 — Strict ReactiveAdapter only (no binding helpers) | Rejected | React/Svelte require framework-native binding (hook/store) for re-render. Adapter alone insufficient. |
| B2 — Extended ReactiveAdapter interface with subscribe/notify methods | Rejected | Forces all adapters to implement subscribe (Vue's proxy doesn't need it — already integrated with Vue runtime). Bloats SPI. |
| **B3 — ReactiveAdapter base + framework-native binding helpers as named exports** | **Chosen** | Minimal SPI extension; each framework chooses idiomatic binding shape; consumer DX optimal. |
| C1 — entity-vue replaces entity/vue subpath (breaking) | Rejected | Breaks downstream consumers. v0.x can't break SemVer. |
| C2 — entity-vue parallel with entity/vue (no shim) | Rejected | Documentation drift; consumers confused which to import. |
| **C3 — entity-vue NEW + entity/vue shim re-export** | **Chosen** | Backward-compat preserved; canonical home migrates to new package; future v1.0 can remove shim. |

## Consequences

### Positive

- 4 framework adapters live independently — Vue / React / Solid / Svelte each version on its own SemVer cadence.
- Tree-shake friendly — consumers install only their framework.
- Backward-compat preserved — `@gertsai/entity/vue` subpath continues to work; existing m9s-example imports unchanged.
- ReactiveAdapter contract minimal — Wave 5 doesn't bloat entity SPI.
- Framework-native binding ergonomics — React `useEntity` hook, Svelte `$entityStore` syntax, Solid store proxy.

### Negative (trade-offs)

- 4 new packages add ~1500-2000 LOC to monorepo; same proven pattern as Wave 5 Phase 1-2 — workspace handles 35+ packages cleanly.
- Per-framework binding API drifts (each framework idiomatic) — README must clearly distinguish.
- entity/vue subpath shim adds maintenance burden until v1.0 removes (manageable; trivial re-export).
- ReactiveAdapter base contract may not perfectly fit each framework — adapter can be no-op or minimal pass-through where framework-native binding does the work (acceptable trade).

### Risks

- **R-1**: Vue subpath shim breaks during E+ refactor. Mitigation: smoke test `@gertsai/entity/vue` consumers (m9s-example, internal tests) preserve test count post-Sprint-3.8.
- **R-2**: React adapter Proxy overhead. Mitigation: `markRaw` escape hatch + benchmark vs plain object in dev mode; production OK due to JS Proxy maturity.
- **R-3**: Solid createStore deep wrapping mismatches Entity expectations (which uses shallow `_data`). Mitigation: use `produce` pattern for explicit shallow store; test against Solid 1.8+ semantics.
- **R-4**: Svelte writable timestamp drift (subscribe fires before mutator returns). Mitigation: synchronous notify pattern documented; tests cover.
- **R-5**: peer-dep version range too strict / too loose. Mitigation: ranges per framework's stable major (vue >=3.0, react >=18.0, solid >=1.0, svelte >=4.0).
- **R-6**: Framework adapter ReactiveAdapter conformance drift. Mitigation: shared contract test fixtures imported from `@gertsai/entity` (test-utils subpath OR mirror tests inline).

## Invariants

I-1: All 4 Sprint 3.8 framework adapter packages MUST satisfy ReactiveAdapter contract from `@gertsai/entity` — `reactive<T>`, `markRaw<T>`, `isReactive` methods present + tested.

I-2: `@gertsai/entity` core MUST NOT import any concrete UI framework runtime. Wave 4 ADR-005 I-2 reaffirmed.

I-3: `@gertsai/entity/vue` subpath MUST remain importable post-Sprint 3.8 — re-exports `vueReactiveAdapter` from `@gertsai/entity-vue` (E+ shim).

I-4: Each framework adapter package MUST declare framework runtime as peerDependenciesMeta `optional: true`. Consumer install of adapter without framework MUST not error at module-resolution time (only at runtime when adapter method is called — clear error message).

I-5: Each framework adapter package MUST export framework-native binding helper(s) — at minimum a `useEntity(entity)` hook/composable/factory with framework-idiomatic shape:
- React: `useEntity(entity): Data` (using useSyncExternalStore).
- Vue: optional (Vue users access reactive `_data` directly).
- Solid: `useEntity(entity): Store<Data>`.
- Svelte: `entityStore(entity): Readable<Entity>`.

I-6: SPDX header on every new `.ts` file per ADR-005 I-5.

I-7: Per-package strategy markers (F / F+E+) MUST appear in SPEC-013 prior to Build phase.

I-8: Each framework adapter package CHANGELOG.md initial entry MUST cite ADR-008 + ReactiveAdapter contract conformance.

I-9: Existing `m9s-example` MUST continue to work without changes (it does NOT use any UI framework currently, but if it imports `@gertsai/entity/vue` somewhere, that path must work via shim).

I-10: framework adapter README MUST include "Install" with peer-dep gate guide + "Quickstart" with binding example + "Security/Caveats" section noting framework-specific edge cases (e.g., React adapter Proxy overhead disclosure).

## Evidence Requirements

- **E-1**: SPEC-013 (Sprint 3.8) активирован с per-package strategy markers (F/F+E+).
- **E-2**: `pnpm pack --dry-run` для каждого нового Wave 5 Phase 3 package — 0 leak.
- **E-3**: `grep -rE 'vue|react|solid-js|svelte' packages/entity/src` returns ONLY existing vue.ts re-export shim (post-Sprint-3.8) — entity core stays framework-free.
- **E-4**: ReactiveAdapter conformance test passes for each adapter (3 base tests minimum).
- **E-5**: m9s-example regression — 100% existing tests pass after `entity/vue` shim refactor.
- **E-6**: `@gertsai/entity-vue` exports identical surface to original `entity/vue` subpath (regression test imports from both, asserts deep equal).
- **E-7**: Framework-native binding helpers tested with framework's actual runtime (e.g., `@testing-library/react` for React adapter; Solid render util for Solid; Svelte's testing utils for Svelte).
- **E-8**: Sprint 3.8 atomic commit on `feat/sprint-3-8-wave-5-phase-3` branch.

## Implementation Plan

### Phase 0: Pre-conditions
- [ ] **0.1** PRD-003 active (Sprint 3.7 EVID-014 closed).
- [ ] **0.2** ADR-008 active.

### Phase 1: SPEC-013 + Pre-Build audit (Sprint 3.8)
- [ ] **1.1** SPEC-013 draft с W-3-8-1..N items + per-package strategy markers (F / F / F / F+E+).
- [ ] **1.2** Pre-Build audit (5 reviewers parallel).
- [ ] **1.3** Address P0/P1 audit findings via Amendment 1.
- [ ] **1.4** SPEC-013 validate + activate.

### Phase 2: Sprint 3.8 Build (4 parallel workers + team-lead)
- [ ] **2.1** AgentTeams Wave 1: 4 workers (entity-vue / entity-react / entity-solid / entity-svelte).
- [ ] **2.2** Team-lead Phase B: integrated verify + entity/vue shim refactor.
- [ ] **2.3** CLAUDE.md tier table 31 → 35; 4 changesets.

### Phase 3: Post-Build audit + Activate
- [ ] **3.1** Post-Build fidelity audit (4 reviewers parallel).
- [ ] **3.2** Address P0/P1 findings (if any).
- [ ] **3.3** EVID-015 active.
- [ ] **3.4** SPEC-013 active.
- [ ] **3.5** Single atomic commit.
- [ ] **3.6** Hindsight retain Group 40.

## Affected Files (predicted, Sprint 3.8 only)

- `packages/entity-vue/**` (NEW Tier 2)
- `packages/entity-react/**` (NEW Tier 2)
- `packages/entity-solid/**` (NEW Tier 2)
- `packages/entity-svelte/**` (NEW Tier 2)
- `packages/entity/src/vue.ts` (E+ refactor — re-export from `@gertsai/entity-vue`)
- `packages/entity/package.json` (add peer-dep on `@gertsai/entity-vue`)
- `CLAUDE.md` (tier table update 31 → 35)
- `pnpm-lock.yaml`
- `.changeset/sprint-3-8-entity-vue.md` (NEW — minor + entity patch)
- `.changeset/sprint-3-8-entity-react.md` (NEW — minor)
- `.changeset/sprint-3-8-entity-solid.md` (NEW — minor)
- `.changeset/sprint-3-8-entity-svelte.md` (NEW — minor)
- `.forgeplan/evidence/EVID-015-sprint-3-8-shipped.md` (NEW)

## Admissibility

NOT admissible под этим ADR:

- NOT: Импортировать concrete UI framework runtime (vue / react / solid-js / svelte) в `@gertsai/entity` core.
- NOT: Менять existing ReactiveAdapter interface (3-method contract unchanged).
- NOT: Менять existing `@gertsai/entity/vue` subpath surface (shim must re-export identical API).
- NOT: Skip framework-native binding helper in adapter packages (per I-5).
- NOT: Skip peer-optional flag for framework runtime (per I-4).
- NOT: Skip ReactiveAdapter conformance tests in adapter packages.
- NOT: Skip SPDX headers / README per Sprint 3.6 §template.

## Rollback Plan

**Triggers**:
- Sprint 3.8 Phase A reveals ReactiveAdapter contract too restrictive for one framework → extend interface in additive ADR-008.1 amendment.
- entity/vue shim breaks m9s-example → revert shim refactor; entity-vue ships parallel without shim; manual migration.
- One framework adapter peer-dep conflicts with monorepo lockfile → drop that adapter from Sprint 3.8 (3 of 4 ship); defer to Sprint 3.8.x.

**Steps**:
1. Open ADR-008 amendment.
2. If shim broken: `git revert` shim commit; document divergence.
3. If adapter dropped: scope-reduce changeset; activate partial EVID-015.

**Blast Radius**: low. Wave 5 Phase 3 packages unpublished. After publish: SemVer minor break possible.

## Affected Files

| File | Baseline Hash |
|------|---------------|
| packages/{entity-vue,entity-react,entity-solid,entity-svelte}/** | (NEW — no baseline) |
| packages/entity/src/vue.ts | post-Sprint 3.4 |
| packages/entity/package.json | post-Sprint 3.4 |
| CLAUDE.md | post-Sprint 3.7 (commit `121cb7b`) |

## AI Guidance

> Правила для AI-агентов при работе с ADR-008 + SPEC-013:

- **entity-vue-worker**: lift impl from `packages/entity/src/vue.ts` to NEW `packages/entity-vue/src/index.ts`. Update `packages/entity/src/vue.ts` to re-export from `@gertsai/entity-vue`. Add `@gertsai/entity-vue` peer-dep to entity package.json. Verify m9s-example still works (entity has no concrete vue runtime import — preserved Wave 4 invariant).
- **entity-react-worker**: build Proxy-based ReactiveAdapter + `useEntity` hook using `useSyncExternalStore`. Test with `@testing-library/react` if installed; otherwise mock React hooks via `vi.fn`.
- **entity-solid-worker**: use `createStore` for shallow store wrapping. `useEntity` returns Solid Store accessor.
- **entity-svelte-worker**: use `writable` for store backing. `entityStore(entity)` returns Svelte `Readable<Entity>`.
- For all 4: ReactiveAdapter conformance tests (3 base tests) MUST be present.
- For all 4: peer-dep framework runtime MUST be `optional: true` via peerDependenciesMeta.
- For all 4: README per Sprint 3.6 §template.
- При conflict с ADR-008 invariants: STOP, raise to user, suggest amendment vs new ADR.

## Related Artifacts

| Artifact | Type | Relation |
|----------|------|----------|
| PRD-003 (Wave 5 — Errors + Runtime Context + Framework Adapters) | PRD | based_on |
| ADR-007 (Wave 5 Phase 2 placement) | ADR | refines (Wave 5 Phase 3 extends Decision D — subpath isolation pattern) |
| ADR-006 (Wave 5 Phase 1 placement) | ADR | informs (Shared Kernel pattern reused) |
| ADR-005 (Storage-core architecture + extraction policy) | ADR | informs (Wave 4 invariants preserved — entity reactivity pluggable) |
| ADR-004 (Foundation libs naming) | ADR | informs (Tier 2 placement rationale) |
| ADR-003 (Platform Runtime Boundaries) | ADR | informs (each framework own package pattern) |
| EVID-014 (Sprint 3.7 shipped — Wave 5 Phase 2 baseline) | Evidence | based_on |

> **Next step**: Activate ADR-008 → SPEC-013 (Sprint 3.8 Shape) → pre-Build audit → Build → post-Build audit → EVID-015 → Activate.

---

## Amendment 1 — Pre-Build audit findings (2026-05-06)

5∥ pre-Build reviewers (architect, security, ddd, typescript, docs) delivered findings. Workers MUST follow Amendment 1 over original Decisions where they disagree.

### A1.1 — Convergent fixes (≥2 reviewers)

**A1.1.1 — Svelte UL: keep `Readable<Entity<Data>>` shape; fix Quickstart syntax** (docs P1-3 + ddd P1-DDD-2 convergent).

Original Decision E §2 + SPEC-013 §148 gave conflicting code (`{$entityStore.field}` vs `Readable<Entity<Data>>` returning entity). Resolution: keep return type as `Readable<Entity<Data>>` (full entity exposed for `.uuid` access), Quickstart syntax MUST be `{$entityStore._data.field}`.

### A1.2 — Substantive single-reviewer fixes (will address)

**A1.2.1 — `entity` peer-dep on `entity-vue` MUST be `optional: true`** (architect P1-A).

Without this flag, all `@gertsai/entity` consumers (NOT using /vue subpath) get peer-resolution warnings. Add to W-3-8-26 amendment: `peerDependenciesMeta.@gertsai/entity-vue.optional: true` in `packages/entity/package.json`.

**A1.2.2 — Subscribe registry MUST be WeakMap** (security P1-S1, CWE-401/CWE-672 memory leak/UAF).

`Map<object, Set<callback>>` → `WeakMap<object, Set<callback>>`. When entity destroyed, callbacks GC'd. Apply to entity-react W-3-8-8 + entity-svelte W-3-8-18.

**A1.2.3 — Raw markers MUST use module-private Symbol, NOT Symbol.for** (security P1-S3, CWE-1321 prototype pollution).

`Symbol.for('@gertsai/entity-react:raw')` shared registry → attacker pollutes Object.prototype with key → all objects markRaw'd silently. **Fix**: each adapter uses `const RAW = Symbol('raw')` (module-local). `isReactive`/`markRaw` MUST use `Object.prototype.hasOwnProperty.call(value, RAW)` not `value[RAW]` (prototype-walking lookup).

Apply to all 4 adapters: entity-vue (existing pattern at packages/entity/src/adapters/plain.ts uses Symbol.for — kept for backward-compat per adapter; new Sprint 3.8 adapters use module-private). entity-vue specifically retains `vueReactiveAdapter` lift verbatim — Vue uses `@vue/runtime-core`'s own internal markers, not Symbol.for.

**A1.2.4 — Proxy traps MUST cover set + defineProperty + deleteProperty** (security P1-S2, CWE-20).

Proxy `set` trap alone misses `Object.defineProperty()` and `delete obj.key`. All 3 traps notify subscribers. Apply to entity-react W-3-8-8 + entity-svelte W-3-8-18.

**A1.2.5 — Proxy `set` trap MUST use `Reflect.set(target, k, v)` without external receiver** (security P1-S2).

`Reflect.set(target, key, value, receiver)` with attacker-controlled receiver bypasses notify. Use `Reflect.set(target, key, value)` (no receiver) for propagation.

**A1.2.6 — Notify MUST be synchronous in trap** (security P2-S6 + P2-S7, CWE-674 + CWE-362).

NO `setTimeout`/`queueMicrotask` для notify — synchronous within set trap. Re-entrancy guard (per-target boolean) prevents Svelte writable infinite loop. React unmount race avoided.

**A1.2.7 — Adapters MUST NOT access entity protected state directly** (ddd P1-DDD-1).

Adapter accesses entity ONLY via ReactiveAdapter contract (`reactive<T>(target)` returning Proxy). NO `entity._data` polling, NO direct read of protected fields outside Proxy interception.

**A1.2.8 — `import type` mandatory for ALL framework-runtime types** (typescript P1-1).

Per `isolatedModules: true`. Mixing value+type imports keeps runtime import. ALL framework types (React `useSyncExternalStore`, Svelte `Readable`, Solid `Store`) imported via `import type`. Runtime values via lazy `require()` / `createRequire(import.meta.url)`.

**A1.2.9 — Lazy require pattern MUST use `createRequire(import.meta.url)` for ESM compat** (typescript P1-2).

```typescript
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
// ... lazy require here
```

Works in both ESM and CJS tsup output. Applies to all 4 adapters' framework runtime resolution.

**A1.2.10 — React `useEntity.getSnapshot()` MUST return version snapshot, not raw `_data` ref** (typescript P2-3).

Same proxy ref pre/post mutation → React skips re-render via Object.is. Fix: getSnapshot returns `entity._data` BUT adapter increments version counter on mutation; `useSyncExternalStore` polls version OR getSnapshot returns `{ data, version }` wrapper. Worker discretion — pick one.

**A1.2.11 — tsup `external` config MUST list `@gertsai/entity` + framework runtime** (typescript P2-2).

Without `external: ['@gertsai/entity', '<framework-runtime>']` in tsup.config.ts, peer-deps get bundled → generic identity breaks. Apply to all 4 adapters.

### A1.3 — Documentation conventions (docs P1-1..P1-6)

**A1.3.1 — README §template** (docs P1-1):

All 4 adapter READMEs: `## Install` / `## Quickstart` / `## API` / `## Compatibility` (peer-dep matrix table) / `## Security/Caveats` / `## Migration` (entity-vue only) / `## Cross-references` / `## License`. Skip "Subpath imports" — single-export packages.

**A1.3.2 — Per-framework Quickstart code** (docs P1-2):

Inline canonical snippets:
- entity-react: `function Profile() { const data = useEntity(user); return <h1>{data.name}</h1>; }`
- entity-solid: `function Profile() { const store = useEntity(user); return <h1>{store.name}</h1>; }`
- entity-svelte: `<script>const store = entityStore(user)</script><h1>{$store._data.name}</h1>`
- entity-vue: `<script setup>const u = inject(userKey); const data = u._data; // reactive</script>` + composable hook example.

**A1.3.3 — Install gate error wording** (docs P1-4):

Canonical message per adapter: `'@gertsai/entity-<fw> requires "<framework>" >=<v> as a peer dependency. Install it with: pnpm add <framework>'`. README "## Install" shows error sample.

**A1.3.4 — entity-vue migration note** (docs P1-5):

NEW section `## Migration from @gertsai/entity/vue` in entity-vue README. Old import → new import sample. Note: subpath shim still works; deprecation timeline = "removed in v1.0".

**A1.3.5 — Compat matrix** (docs P1-6):

Each README MUST include peer-dep compat table:

| Peer | Supported | Tested |
|---|---|---|
| `<framework>` | `>=<v>` | (resolve from pnpm-lock) |

**A1.3.6 — Cross-references list** (docs P2-1):

Each README cross-links: ADR-008 + PRD-003 + entity ReactiveAdapter docs (`packages/entity/src/types.ts`).

**A1.3.7 — Changeset templates inline** (docs P2-2):

5 changesets (4 adapters + entity patch coupled with entity-vue):

`.changeset/sprint-3-8-entity-vue.md`:
```markdown
---
'@gertsai/entity-vue': minor
'@gertsai/entity': patch
---

Initial release of @gertsai/entity-vue (Tier 2). vueReactiveAdapter standalone package.

- Lifts `vueReactiveAdapter` impl from `@gertsai/entity/vue` subpath (Sprint 3.4) to standalone package.
- Lazy `require('@vue/runtime-core')` via `createRequire` (works in both ESM and CJS).
- ReactiveAdapter contract conformance (3 base tests).

@gertsai/entity patch: `/vue` subpath becomes re-export shim from `@gertsai/entity-vue`. Backward-compat preserved per ADR-008 I-3 — existing `import { vueReactiveAdapter } from '@gertsai/entity/vue'` continues to work without changes.
```

`.changeset/sprint-3-8-entity-react.md`:
```markdown
---
'@gertsai/entity-react': minor
---

Initial release. React framework adapter for @gertsai/entity (Tier 2).

- `reactReactiveAdapter` — Proxy-based reactivity with WeakMap subscribe registry (CWE-401 protected per ADR-008 Amendment I-12).
- `useEntity(entity)` hook using `useSyncExternalStore` for re-render binding.
- 3 Proxy traps (set + defineProperty + deleteProperty) for full mutation coverage; sync notify; version-snapshot getSnapshot for React identity tracking.
- Module-private `Symbol('raw')` markers (CWE-1321 protected per ADR-008 I-13).
- Peer-optional `react: >=18.0.0`.
```

`.changeset/sprint-3-8-entity-solid.md`:
```markdown
---
'@gertsai/entity-solid': minor
---

Initial release. Solid framework adapter for @gertsai/entity (Tier 2).

- `solidReactiveAdapter` — `createStore`-backed reactive proxy with fine-grained tracking.
- `useEntity(entity)` returns Solid `Store<Data>` accessor.
- Module-private `Symbol('raw')` markers + WeakMap subscribe registry.
- Peer-optional `solid-js: >=1.0.0`.
```

`.changeset/sprint-3-8-entity-svelte.md`:
```markdown
---
'@gertsai/entity-svelte': minor
---

Initial release. Svelte framework adapter for @gertsai/entity (Tier 2).

- `svelteReactiveAdapter` — Proxy-based reactivity with `writable` store backing + WeakMap registry.
- `entityStore(entity)` returns `Readable<Entity<Data>>` (compatible with `$entityStore._data.field` syntax).
- 3 Proxy traps + sync notify + re-entrancy guard (CWE-674 protected per ADR-008 I-14).
- Peer-optional `svelte: >=4.0.0`.
```

**A1.3.8 — CLAUDE.md tier-table snippet** (docs P2-3):

4 NEW Tier 2 rows after `@gertsai/audit-primitives`:

```
| 2 | `@gertsai/entity-vue` | entity (peer; optional) | **Sprint 3.8 W-3-8-1..6 (F+E+)** | vueReactiveAdapter standalone; @gertsai/entity/vue subpath becomes re-export shim per ADR-008 Decision B + I-3 |
| 2 | `@gertsai/entity-react` | entity (peer) | **Sprint 3.8 W-3-8-7..11 (F)** | reactReactiveAdapter (Proxy + WeakMap subscribe + 3 traps + sync notify) + useEntity hook (useSyncExternalStore + version snapshot) |
| 2 | `@gertsai/entity-solid` | entity (peer) | **Sprint 3.8 W-3-8-12..16 (F)** | solidReactiveAdapter (createStore) + useEntity Store accessor |
| 2 | `@gertsai/entity-svelte` | entity (peer) | **Sprint 3.8 W-3-8-17..21 (F)** | svelteReactiveAdapter (writable + Proxy + WeakMap + re-entrancy guard) + entityStore Readable<Entity<Data>> |
```

Update `@gertsai/entity` row Internal deps: add `entity-vue (peer; optional, only for /vue subpath)`. Notes: append `Sprint 3.8: /vue subpath delegates to standalone @gertsai/entity-vue per ADR-008 Decision B`.

**A1.3.9 — m9s-example out-of-scope explicit** (docs P2-4):

Add to SPEC-013 §"Out of scope": "Sprint 3.8 does NOT add framework adapter usage to m9s-example (m9s is backend example; UI framework integration TBD via separate frontend example in Wave 6+)."

### A1.4 — New invariants (I-11..I-14)

**I-11**: Framework adapter raw markers MUST use module-private `Symbol(...)` (NOT `Symbol.for(...)` shared registry); lookup MUST use `Object.prototype.hasOwnProperty.call(value, RAW)`. Prevents prototype pollution (CWE-1321).

**I-12**: Subscribe registries in adapters with subscribe model (entity-react, entity-svelte) MUST use `WeakMap<object, Set<cb>>` (NOT regular `Map`). Prevents memory leak / use-after-free (CWE-401, CWE-672).

**I-13**: Adapter Proxy implementations MUST install 3 traps (`set` + `defineProperty` + `deleteProperty`); all 3 notify subscribers synchronously; `set` trap MUST use `Reflect.set(target, key, value)` without external receiver (CWE-20, CWE-674, CWE-362). Re-entrancy guard required for sync notify (per-target boolean flag).

**I-14**: Adapters MUST NOT access entity's protected state (`_data` directly via field access) outside ReactiveAdapter contract. Reactivity flows through Proxy returned from `reactive<T>(target)` only.

### A1.5 — File ownership matrix update

No changes (file ownership matrix already disjoint per ADR-008 §F + SPEC-013 §"File ownership matrix").

### Amendment 1 changelog

| ID | Source | Severity | Status |
|----|--------|----------|--------|
| A1.1.1 | docs P1-3 + ddd P1-DDD-2 (convergent) | Convergent P1 | Applied (Svelte Quickstart fix) |
| A1.2.1 | architect P1-A | Substantive | Applied (entity peer-dep optional flag) |
| A1.2.2 | security P1-S1 | Substantive | Applied (I-12 WeakMap) |
| A1.2.3 | security P1-S3 | Substantive | Applied (I-11 module-private Symbol) |
| A1.2.4 | security P1-S2 | Substantive | Applied (I-13 3 traps) |
| A1.2.5 | security P1-S2 | Substantive | Applied (I-13 Reflect.set without receiver) |
| A1.2.6 | security P2-S6/S7 | Substantive | Applied (I-13 sync notify + re-entrancy guard) |
| A1.2.7 | ddd P1-DDD-1 | Substantive | Applied (I-14 no protected state access) |
| A1.2.8 | typescript P1-1 | Substantive | Applied (import type mandate) |
| A1.2.9 | typescript P1-2 | Substantive | Applied (createRequire pattern) |
| A1.2.10 | typescript P2-3 | Substantive | Applied (React getSnapshot version) |
| A1.2.11 | typescript P2-2 | Substantive | Applied (tsup external) |
| A1.3.1..A1.3.9 | docs P1-1..P1-6 + P2-1..P2-4 | Substantive | Applied (README template + Quickstart + install error + migration + compat + cross-refs + changeset templates + CLAUDE.md snippet + scope) |
| P2 polish | various | P2 | Worker discretion / KNOWN-ISSUES |







