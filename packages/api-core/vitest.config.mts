import { defineConfig } from 'vitest/config';
import untypia from '@ryoppippi/unplugin-typia';

export default defineConfig({
  plugins: [
    untypia.vite({
      tsconfig: './orchdev/api-core/tsconfig.json',
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
    include: ['__tests__/**/*.spec.ts', 'src/**/*.spec.ts'],
    globals: false,
    hookTimeout: 30000,
    testTimeout: 30000,
  },
});
