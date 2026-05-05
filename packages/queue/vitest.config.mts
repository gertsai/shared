import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/coverage/**'],
    hookTimeout: 30000,
    testTimeout: 30000,
  },
});
