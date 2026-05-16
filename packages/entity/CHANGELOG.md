# @gertsai/entity

## 1.1.1

### Patch Changes

- @gertsai/session@2.0.0

## 1.1.0

### Minor Changes

- 80ca808: Wave 12.C-fix-1 — close 1 CRITICAL + 3 HIGH findings from EVID-048 in
  `@gertsai/entity`.

  **CRIT-1 — entity↔entity-vue peer cycle broken**

  The `@gertsai/entity/vue` subpath previously re-exported `vueReactiveAdapter`
  from `@gertsai/entity-vue`, creating a structural peer-cycle (entity
  peer-depends on entity-vue; entity-vue peer-depends on entity). Both
  peer-optional, but the dep graph cycle blocked v1.0 release per ADR-008
  Decision B sunset.

  **Fix:** inlined a thin local copy of `vueReactiveAdapter` in
  `packages/entity/src/adapters/vue.ts` using the same lazy
  `createRequire(import.meta.url)` pattern. Dropped `@gertsai/entity-vue`
  from peer-deps. `@gertsai/entity/vue` subpath still exports a Vue
  adapter — implementation source moved, public name unchanged. The v2.0
  ADR-008 Decision B sunset (delete the subpath entirely) remains valid.

  Side benefit: `scripts/emit-vue-shim-dts.mjs` post-build workaround
  removed — tsup now emits real `dist/vue.d.ts` declarations directly.

  **H-1 — CWE-1321 prototype pollution via `$patch` / `$setMetadata`**

  Previously `entity.$patch({ __proto__: { admin: true } })` mutated
  `_data`'s prototype chain. Entity is the canonical hydration target for
  backend payloads across `@gertsai/*` — indirect attack vector through
  any consumer accepting untrusted JSON.

  **Fix:** new `DANGEROUS_KEYS` filter (`__proto__` / `constructor` /
  `prototype`) applied in BOTH `check=true` and `check=false` branches of
  `$patch` (Entity.ts) and `$setMetadata` (EntityWithMetadata.ts). The
  `Object.assign(_data, partial)` shortcut in `check=false` replaced with
  a filtered loop — `Object.assign` propagates the `__proto__` setter on
  plain objects.

  **H-2 — `plainReactiveAdapter` brand harmonisation**

  Previously the plain adapter used `Symbol.for('@gertsai/entity:raw')`
  (shared global registry — forgeable by any code in the realm) + plain
  bracket-assign setter (writable + deletable). Framework adapters
  (react/svelte/solid) use module-private `Symbol(...)` + locked
  `Object.defineProperty(... configurable: false, writable: false)`.

  **Fix:** brought `plainReactiveAdapter` in line with ADR-008 I-11:

  - `RAW_MARKER` is now module-private `Symbol(...)` (NOT
    `Symbol.for(...)`)
  - Brand installed via `Object.defineProperty(value, RAW_MARKER, {
value: true, configurable: false, writable: false, enumerable: false })`
  - `RAW_MARKER_SYMBOL` export removed (was a leak of the private brand)
  - New `plainReactiveAdapter.isMarkedRaw(value)` introspection helper

  **H-5 — Node `events` import in published `.d.ts`**

  `@gertsai/entity` declares no `engines.node`, yet `dist/index.d.ts`
  imports `EventEmitter from 'events'` (because `Model extends
EventEmitter`). Consumers without `@types/node` got an unhelpful
  typecheck error.

  **Fix:** declared `"engines": { "node": ">=22" }` in `package.json`
  mirroring `@gertsai/rest-request-manager` precedent. Consumers now have
  a contractual signal that the package is Node-only.

  **Tests:** +8 new tests covering:

  - `$patch({ __proto__ })` does not pollute prototype
  - `$patch({ constructor })` does not break entity
  - `$patch({ check: false, __proto__ })` filtered too
  - `$setMetadata({ __proto__ })` filtered (same for constructor + check=false branch)
  - `plainReactiveAdapter` brand inaccessible via `Symbol.for(...)`
  - `plainReactiveAdapter` brand non-deletable (locked descriptor)
  - `vueReactiveAdapter` shape preserved after inlining

  54/54 tests pass; typecheck clean.

  **Consumer impact:**

  - `entity.$patch(legalPayload)` continues to work — only attacker keys filtered
  - `plainReactiveAdapter.markRaw(v)` continues to mark — same surface, harder to tamper
  - `@gertsai/entity/vue` subpath continues to export `vueReactiveAdapter`
  - Consumers without `@gertsai/entity-vue` installed previously got a
    type-resolve error; now they don't (peer dropped from entity)
  - Consumers without `@gertsai/entity-vue` but trying to USE the
    `entity/vue` subpath still need `@vue/runtime-core` (unchanged)

  Refs: PRD-033, EVID-048 (CRIT-1, H-1, H-2, H-5), ADR-008.

## 1.0.0

### Minor Changes

- c19e12a: Initial release of `@gertsai/entity` — backend-agnostic entity base classes (Model, Entity, EntityWithMetadata) with pluggable reactivity layer. Default plain-object adapter; optional Vue adapter via `@gertsai/entity/vue` subpath (peer-dep optional). Mirrors Orchestra orchlab/core entity patterns 1:1 with Vue/xid-ts/lodash dependencies stripped per ADR-005 Decision B. Per PRD-002 FR-W4-001..003.

### Patch Changes

- 7c3535f: Initial release of @gertsai/entity-vue (Tier 2). vueReactiveAdapter standalone package.

  - Lifts `vueReactiveAdapter` impl from `@gertsai/entity/vue` subpath (Sprint 3.4) to standalone package per ADR-008 Decision B.
  - Lazy `require('@vue/runtime-core')` via `createRequire(import.meta.url)` per ADR-008 Amendment 1.2.9 — works in both ESM and CJS tsup output.
  - ReactiveAdapter contract conformance (3 base tests).
  - `external: ['@gertsai/entity', '@vue/runtime-core']` in tsup config preserves cross-package generic identity per Amendment 1.2.11.

  @gertsai/entity patch: `/vue` subpath becomes re-export shim from `@gertsai/entity-vue`. Backward-compat preserved per ADR-008 I-3 — existing `import { vueReactiveAdapter } from '@gertsai/entity/vue'` continues to work without changes. The `/vue` subpath shim will be removed in v1.0.

  New peer-dep on `@gertsai/entity-vue: workspace:^` is `optional: true` (consumers not using /vue subpath pay zero cost) per ADR-008 Amendment 1.2.1.

- Updated dependencies [782a3e0]
- Updated dependencies [c19e12a]
- Updated dependencies [6debc97]
- Updated dependencies [7c3535f]
  - @gertsai/session@1.0.0
  - @gertsai/entity-vue@1.0.0

## 0.0.0

Initial scaffold (unreleased).
