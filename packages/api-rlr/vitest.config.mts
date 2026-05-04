import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [
    tsconfigPaths({
      projects: ['../../tsconfig.base.json'],
      ignoreConfigErrors: true,
      loose: true,
    }),
  ],
  test: {
    environment: 'node',
    include: ['__tests__/**/*.{spec,test}.ts', 'src/**/*.{spec,test}.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/coverage/**'],
    globals: false,
    hookTimeout: 30000,
    testTimeout: 30000,
    reporters: ['default'],
    coverage: {
      reporter: ['text', 'json', 'html', 'lcov'],
      reportsDirectory: 'coverage',
    },
  },
});
