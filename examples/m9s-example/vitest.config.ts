/**
 * Vitest config — m9s-example (Sprint 3.11; Wave 8.2 patch).
 *
 * Default `pnpm test` runs only the mock-mode suites and excludes
 * `tests/real-infra*` (both the `tests/real-infra/` directory AND the
 * sibling file `tests/real-infra.test.ts` which exercises live Ollama).
 * Wave 8.2 audit Tests#1 revealed the previous glob `tests/real-infra/**`
 * matched the directory but NOT the sibling file, so the file silently
 * ran during default `pnpm test` and depended on `ollamaAlive()` to skip.
 *
 * `pnpm test:real-infra` opts in: it runs only the real-infra suites
 * with `fileParallelism: false` so they can't collide on shared infra.
 *
 * `pnpm test:all` is the convenience superset.
 *
 * NOTE: a stale `vitest.config.mts` companion was deleted in Wave 8.2
 * (audit Arch#2). Single canonical config — vitest picks `.ts` first.
 */
import { defineConfig } from 'vitest/config';

// Matches BOTH `tests/real-infra/**/*.test.ts` (directory) AND
// `tests/real-infra.test.ts` (top-level file). Wave 8.2 fix.
const REAL_INFRA_INCLUDES = ['tests/real-infra/**/*.test.ts', 'tests/real-infra.test.ts'];
const REAL_INFRA_EXCLUDES = ['tests/real-infra/**', 'tests/real-infra.test.ts'];

const isRealInfra = process.env['VITEST_REAL_INFRA'] === '1';

export default defineConfig({
  test: {
    include: isRealInfra ? REAL_INFRA_INCLUDES : ['tests/**/*.test.ts'],
    exclude: isRealInfra ? [] : [...REAL_INFRA_EXCLUDES, 'node_modules/**', 'dist/**'],
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
