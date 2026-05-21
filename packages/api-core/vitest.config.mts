import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';
import untypia from '@ryoppippi/unplugin-typia';

export default defineConfig({
  plugins: [
    // typia transform - must come first
    untypia.vite({
      tsconfig: './tsconfig.json',
    }),
    tsconfigPaths({
      projects: ['../../tsconfig.base.json'],
      ignoreConfigErrors: true,
      loose: true,
    }),
  ],
  test: {
    environment: 'node',
    reporters: [
      'default',
      ['junit', { outputFile: 'reports/junit/api-core.xml' }],
    ],
    coverage: {
      reporter: ['text', 'json', 'html', 'lcov'],
      reportsDirectory: 'coverage',
    },
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts', '__tests__/**/*.spec.ts'],
    globals: false,
    hookTimeout: 30000,
    testTimeout: 30000,
    // Note: vitest 3.x experimental `benchmark` config produced NaN samples for
    // our use-case — replaced with `scripts/perf-check.mjs` (Wave 29.B). Run:
    //   pnpm --filter @gertsai/api-core perf:check  # baseline
    //   pnpm --filter @gertsai/api-core perf:gate   # CI regression gate
  },
});
