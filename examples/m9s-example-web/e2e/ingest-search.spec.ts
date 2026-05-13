// SPDX-License-Identifier: Apache-2.0
/**
 * Wave 9 E2E — ingest → search round-trip.
 *
 * Gated on `RUN_E2E=1` because the test requires:
 *   - SvelteKit dev server on :5173 (`pnpm --filter @gertsai-examples/m9s-example-web dev`)
 *   - m9s-example Moleculer backend on :3031 (`pnpm --filter m9s-example dev`)
 *   - Ollama on :11434 with the configured embedding model pulled
 *
 * Without the env flag, the entire describe block is skipped so CI runners
 * that don't ship the AI infra still pass `pnpm test:e2e` cleanly.
 *
 * Flow:
 *   1. /ingest → fill docId + text → submit → expect success toast
 *   2. /search → query "hexagonal" → expect at least 1 hit referencing the doc
 */
import { test, expect } from '@playwright/test';

const RUN_E2E = process.env.RUN_E2E === '1';
const DOC_ID = `e2e-doc-${Date.now()}`;
const DOC_TEXT =
  'Hexagonal architecture isolates the core domain from infrastructure. Ports declare needs; adapters supply implementations.';
const QUERY = 'hexagonal';

test.describe('ingest → search round-trip', () => {
  test.skip(!RUN_E2E, 'set RUN_E2E=1 with backend + Ollama up');

  test('ingests a document and retrieves it via search', async ({ page }) => {
    // --- Ingest ---
    await page.goto('/ingest');
    await expect(page.getByRole('heading', { name: 'Ingest a document' })).toBeVisible();

    await page.fill('#docId', DOC_ID);
    await page.fill('#text', DOC_TEXT);

    await Promise.all([
      page.waitForLoadState('networkidle'),
      page.getByRole('button', { name: 'Ingest' }).click(),
    ]);

    const successToast = page.getByTestId('toast-success');
    await expect(successToast).toBeVisible({ timeout: 15_000 });
    await expect(successToast).toContainText(DOC_ID);

    // --- Search ---
    await page.goto('/search');
    await expect(page.getByRole('heading', { name: 'Search' })).toBeVisible();

    await page.fill('#query', QUERY);
    await Promise.all([
      page.waitForLoadState('networkidle'),
      page.getByRole('button', { name: 'Search' }).click(),
    ]);

    const results = page.getByTestId('search-result');
    await expect(results.first()).toBeVisible({ timeout: 15_000 });

    const resultsText = await page.getByTestId('search-results').innerText();
    expect(resultsText.toLowerCase()).toContain('hexagonal');
  });
});
