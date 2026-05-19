import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
    globals: false,
    hookTimeout: 30000,
    testTimeout: 30000,
    passWithNoTests: true,
  },
});
