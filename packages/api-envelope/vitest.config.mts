import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';
import untypia from '@ryoppippi/unplugin-typia';

export default defineConfig({
  plugins: [
    // typia transform - must come first
    // @ts-expect-error - vite version mismatch
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
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
    globals: false,
    hookTimeout: 30000,
    testTimeout: 30000,
  },
});
