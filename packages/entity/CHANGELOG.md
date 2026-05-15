# @gertsai/entity

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
