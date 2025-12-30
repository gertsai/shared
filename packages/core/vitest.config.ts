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
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
    testTimeout: 30000,
  },
});
