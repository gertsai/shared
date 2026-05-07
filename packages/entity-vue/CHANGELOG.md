# @gertsai/entity-vue

## 0.1.0

Initial release. Vue 3 framework adapter for `@gertsai/entity` (Tier 2).

- Lifts `vueReactiveAdapter` impl from `@gertsai/entity/vue` subpath (Sprint 3.4) to a standalone package per ADR-008 Decision B.
- Lazy `require('@vue/runtime-core')` via `createRequire(import.meta.url)` (works in both ESM and CJS tsup output) per ADR-008 Amendment 1.2.9.
- ReactiveAdapter contract conformance (3 base tests) + peer-dep gate + lift-fidelity regression.
- Peer-optional `@vue/runtime-core: >=3.0.0`.

`@gertsai/entity` patch: `/vue` subpath becomes a re-export shim from `@gertsai/entity-vue`. Backward-compat preserved per ADR-008 I-3 — existing `import { vueReactiveAdapter } from '@gertsai/entity/vue'` continues to work without changes.
