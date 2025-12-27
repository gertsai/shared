import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    reporters: [
      'default',
      ['junit', { outputFile: 'reports/junit/fetch.xml' }],
    ],
    coverage: {
      reporter: ['text', 'json', 'html', 'lcov'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.ts'],
    },
    include: ['__tests__/**/*.spec.ts', 'src/**/*.spec.ts'],
    exclude: ['**/dist/**', '**/node_modules/**'],
    globals: false,
  },
});
