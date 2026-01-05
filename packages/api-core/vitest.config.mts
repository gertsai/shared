import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';
import unpluginTypia from '@ryoppippi/unplugin-typia/vite';

export default defineConfig({
  plugins: [
    tsconfigPaths({
      projects: ['../../tsconfig.base.json'],
      ignoreConfigErrors: true,
      loose: true,
    }),
    unpluginTypia(),
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
  },
});
