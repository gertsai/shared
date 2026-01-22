import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['__tests__/**/*.test.ts'],
    exclude: ['__tests__/integration/**'],
    globals: true,
    environment: 'node',
    testTimeout: 10000,
  },
});
