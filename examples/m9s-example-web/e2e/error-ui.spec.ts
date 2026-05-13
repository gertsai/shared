// SPDX-License-Identifier: Apache-2.0
/**
 * Wave 10.A E2E — error UI primitives smoke.
 *
 * Gated on `RUN_E2E=1` so CI runners without infra still pass `pnpm test:e2e`.
 *
 * Two cases:
 *   1. Simulate offline (`context.setOffline(true)`) → OfflineBanner visible.
 *   2. Navigate to a 404 route → global `+error.svelte` is rendered with the
 *      retry CTA.
 *
 * Only the SvelteKit dev server is required (no backend / Ollama), so these
 * could in principle run without `m9s-example` running — the gate stays for
 * symmetry with `ingest-search.spec.ts`.
 */
import { test, expect } from '@playwright/test';

const RUN_E2E = process.env.RUN_E2E === '1';

test.describe('error UI primitives', () => {
  test.skip(!RUN_E2E, 'set RUN_E2E=1 to run error UI E2E');

  test('OfflineBanner appears when the page goes offline', async ({ page, context }) => {
    await page.goto('/');
    await expect(page.getByTestId('offline-banner')).toHaveCount(0);

    await context.setOffline(true);
    // The store reacts to the `offline` event; emit it explicitly because
    // Playwright's `setOffline` doesn't always dispatch the event when there
    // are no in-flight requests.
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));

    const banner = page.getByTestId('offline-banner');
    await expect(banner).toBeVisible({ timeout: 5_000 });
    await expect(banner).toContainText(/offline/i);
    await expect(banner.getByRole('button', { name: 'Retry' })).toBeVisible();

    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect(banner).toHaveCount(0, { timeout: 5_000 });
  });

  test('404 route renders +error.svelte with retry CTA', async ({ page }) => {
    const response = await page.goto('/nonexistent-route-wave-10-a');
    expect(response?.status()).toBe(404);

    const errorPage = page.getByTestId('error-page');
    await expect(errorPage).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId('error-status')).toContainText('404');
    await expect(page.getByTestId('error-boundary')).toBeVisible();
    await expect(page.getByTestId('error-boundary-retry')).toBeVisible();
    await expect(page.getByTestId('error-home')).toBeVisible();
  });
});
