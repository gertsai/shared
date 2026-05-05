// SPDX-License-Identifier: Apache-2.0
/**
 * Shared tsup configuration for all @gertsai/* packages.
 *
 * Per-package configs extend this via `tsup.config.ts` in each `packages/<pkg>/`.
 * Goals:
 *   - Dual ESM+CJS publishing — works для consumers using `import {}` AND `require()`.
 *   - TypeScript declarations — `.d.ts` for ESM, `.d.cts` for CJS (verified via @arethetypeswrong/cli).
 *   - No bundling of workspace siblings (`@gertsai/*` external).
 *   - Clean output, source maps, treeshaking enabled.
 *
 * Per-package overrides:
 *   - `entry`: package-specific entry point(s) (e.g., subpath barrels for api-core).
 *   - `esbuildPlugins`: typia / typescript-transform-paths via custom plugin if needed.
 *
 * @see https://tsup.egoist.dev/
 */
import type { Options } from 'tsup';

/**
 * Base configuration shared by all @gertsai/* package builds.
 *
 * Usage in packages/<pkg>/tsup.config.ts:
 *   import { defineConfig } from 'tsup';
 *   import baseConfig from '../../tsup.config';
 *   export default defineConfig({ ...baseConfig, entry: { 'index': 'src/index.ts' } });
 */
const baseTsupConfig: Options = {
  format: ['esm', 'cjs'],
  outDir: 'dist',
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: true,
  target: 'node22',
  platform: 'node',
  // Mark all @gertsai/* siblings as external — consumers resolve them via npm.
  external: [/^@gertsai\//],
  // Skip generating declaration maps in dist (sourcemap=true для .js sufficient).
  // tsup defaults to .js for ESM and .cjs for CJS — explicit для clarity.
  outExtension({ format }) {
    return {
      js: format === 'cjs' ? '.cjs' : '.js',
    };
  },
};

export default baseTsupConfig;
