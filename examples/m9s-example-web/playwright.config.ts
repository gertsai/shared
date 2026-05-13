// SPDX-License-Identifier: Apache-2.0
/**
 * Wave 9 Playwright config — chromium only, single worker, no retries.
 * The lone test (`e2e/ingest-search.spec.ts`) is gated on `RUN_E2E=1` so
 * CI runners without the m9s-example backend + Ollama stack pass without
 * spinning up infra. Run locally with:
 *
 *   pnpm test:e2e:install   # one-time chromium download
 *   RUN_E2E=1 pnpm test:e2e # requires `pnpm --filter m9s-example dev`
 *                           # + Ollama running on :11434
 */
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
});
