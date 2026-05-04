import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  plugins: [
    tsconfigPaths({
      root: '../..',
      projects: ['packages/fetch/tsconfig.json'],
      ignoreConfigErrors: true,
      loose: true,
      skip: (dir: string) =>
        dir.includes('/node_modules/') || dir.includes('/dist/') || dir.includes('/.turbo/'),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any,
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts', '__tests__/**/*.spec.ts'],
    testTimeout: 30000,
  },
});
