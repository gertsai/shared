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
    // Bench harness — Wave 27 PR-5 (PRD-065 NFR perf / RFC-027 §Bench plan).
    // Run with: pnpm --filter @gertsai/api-core exec vitest bench --run
    benchmark: {
      include: ['src/**/*.bench.ts'],
      reporters: ['default'],
    },
  },
});
