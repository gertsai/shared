# @gertsai/entity-vue

## 1.0.0

### Minor Changes

- 7c3535f: Initial release of @gertsai/entity-vue (Tier 2). vueReactiveAdapter standalone package.

  - Lifts `vueReactiveAdapter` impl from `@gertsai/entity/vue` subpath (Sprint 3.4) to standalone package per ADR-008 Decision B.
  - Lazy `require('@vue/runtime-core')` via `createRequire(import.meta.url)` per ADR-008 Amendment 1.2.9 — works in both ESM and CJS tsup output.
  - ReactiveAdapter contract conformance (3 base tests).
  - `external: ['@gertsai/entity', '@vue/runtime-core']` in tsup config preserves cross-package generic identity per Amendment 1.2.11.

  @gertsai/entity patch: `/vue` subpath becomes re-export shim from `@gertsai/entity-vue`. Backward-compat preserved per ADR-008 I-3 — existing `import { vueReactiveAdapter } from '@gertsai/entity/vue'` continues to work without changes. The `/vue` subpath shim will be removed in v1.0.

  New peer-dep on `@gertsai/entity-vue: workspace:^` is `optional: true` (consumers not using /vue subpath pay zero cost) per ADR-008 Amendment 1.2.1.

### Patch Changes

- Updated dependencies [c19e12a]
- Updated dependencies [7c3535f]
  - @gertsai/entity@1.0.0

## 0.1.0

Initial release. Vue 3 framework adapter for `@gertsai/entity` (Tier 2).

- Lifts `vueReactiveAdapter` impl from `@gertsai/entity/vue` subpath (Sprint 3.4) to a standalone package per ADR-008 Decision B.
- Lazy `require('@vue/runtime-core')` via `createRequire(import.meta.url)` (works in both ESM and CJS tsup output) per ADR-008 Amendment 1.2.9.
- ReactiveAdapter contract conformance (3 base tests) + peer-dep gate + lift-fidelity regression.
- Peer-optional `@vue/runtime-core: >=3.0.0`.

`@gertsai/entity` patch: `/vue` subpath becomes a re-export shim from `@gertsai/entity-vue`. Backward-compat preserved per ADR-008 I-3 — existing `import { vueReactiveAdapter } from '@gertsai/entity/vue'` continues to work without changes.
