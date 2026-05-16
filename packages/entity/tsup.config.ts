// SPDX-License-Identifier: Apache-2.0
import { defineConfig } from 'tsup';
import baseConfig from '../../tsup.config';

/**
 * Build configuration — Wave 12.C-fix-1 PRD-033 FR-001 update.
 *
 * `src/vue.ts` now re-exports from a local inlined adapter
 * (`src/adapters/vue.ts`) — the `entity ↔ entity-vue` peer cycle is gone,
 * so DTS generation no longer needs the workaround that previously
 * disabled DTS for `vue.ts` and hand-wrote `dist/vue.d.{ts,cts}` via a
 * post-build script. Standard dual ESM+CJS emission now applies to both
 * entry points.
 */
export default defineConfig({
  ...baseConfig,
  entry: ['src/index.ts', 'src/vue.ts'],
});
