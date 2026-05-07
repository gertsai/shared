/**
 * Vitest config — m9s-example (Sprint 3.11).
 *
 * Default `pnpm test` runs only the mock-mode suites and excludes
 * `tests/real-infra/**` because those tests share external resources
 * (Postgres, OpenFGA, Redis) and must run sequentially against the
 * Sprint 3.11 docker-compose stack.
 *
 * `pnpm test:real-infra` opts in: it runs only the real-infra suites
 * with `fileParallelism: false` so they can't collide on shared infra.
 *
 * `pnpm test:all` is the convenience superset.
 */
import { defineConfig } from 'vitest/config';

const REAL_INFRA_GLOB = 'tests/real-infra/**/*.test.ts';

const isRealInfra = process.env['VITEST_REAL_INFRA'] === '1';

export default defineConfig({
  test: {
    include: isRealInfra ? [REAL_INFRA_GLOB] : ['tests/**/*.test.ts'],
    exclude: isRealInfra ? [] : [REAL_INFRA_GLOB, 'node_modules/**', 'dist/**'],
    // Wave 5 broker startup (tenant + session middleware + ApiController
    // service registration) is heavy enough that 5 mock-mode test files
    // racing in parallel push individual broker boots past 30s. Real-infra
    // suites additionally share external state (Postgres, OpenFGA, Redis).
    // Keep file-parallelism disabled in BOTH modes — the suite runs in a
    // few seconds either way; hot CPU contention isn't the win.
    fileParallelism: false,
    testTimeout: isRealInfra ? 60_000 : 30_000,
    hookTimeout: isRealInfra ? 60_000 : 60_000,
  },
});
