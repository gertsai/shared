// SPDX-License-Identifier: Apache-2.0
import { defineConfig } from 'tsup';
import baseConfig from '../../tsup.config';

/**
 * Build configuration — Sprint 3.8 / Sprint 3.11 CI fix.
 *
 * `src/vue.ts` is a 1-line backward-compat re-export shim per ADR-008
 * Decision B + I-3 (canonical home of `vueReactiveAdapter` is the
 * standalone `@gertsai/entity-vue` package). The shim creates a circular
 * type dependency at build time:
 *
 *   entity-vue   peer-deps  entity        → pnpm builds `entity` first
 *   entity        re-exports entity-vue   → DTS pass needs entity-vue types
 *
 * Locally this only succeeded when a prior build had already produced
 * `entity-vue/dist/index.d.ts`; CI fails on a clean checkout.
 *
 * Fix: emit JS for `vue.ts` (runtime re-export — `external` keeps
 * `@gertsai/entity-vue` out of the bundle so module resolution happens
 * at consumer time, when entity-vue IS installed) but SKIP DTS generation
 * for `vue.ts`. We hand-write `dist/vue.d.{ts,cts}` via the package
 * `build` script so TypeScript at consumer typecheck time resolves
 * `@gertsai/entity-vue` from THEIR node_modules graph.
 */
export default defineConfig({
  ...baseConfig,
  entry: ['src/index.ts', 'src/vue.ts'],
  dts: { entry: 'src/index.ts' },
});
