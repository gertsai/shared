// SPDX-License-Identifier: Apache-2.0
//
// Wave 12.C-fix-1 (PRD-033 FR-001): `vueReactiveAdapter` is now inlined in
// `@gertsai/entity` (see `./adapters/vue.ts`). The previous indirection
// through `@gertsai/entity-vue` is dissolved to break the
// `entity ↔ entity-vue` peer-dependency cycle (CRIT-1 audit finding).
//
// Existing consumers continue to work without source changes:
//
//   import { vueReactiveAdapter } from '@gertsai/entity/vue'; // still works
//
// The standalone `@gertsai/entity-vue` package remains available as a
// thin re-export alias for users who already depend on it; both routes
// resolve to the same adapter contract (`ReactiveAdapter` from
// `@gertsai/entity`).

export { vueReactiveAdapter } from './adapters/vue';
