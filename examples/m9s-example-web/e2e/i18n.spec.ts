// SPDX-License-Identifier: Apache-2.0
/**
 * Wave 10.A E2E — paraglide-js locale negotiation.
 *
 * Gated on `RUN_E2E=1` because the test requires a running SvelteKit dev
 * server. Without the flag, the whole describe block is skipped so CI
 * runners without the dev infra still pass `pnpm test:e2e` cleanly.
 *
 * Coverage:
 *   1. Accept-Language: ru → page renders Russian strings
 *   2. Cookie `lang=en` overrides Accept-Language (cookie wins)
 *   3. Default (no cookie, no header) → English (sourceLanguageTag)
 *
 * Uses navigation by raw GET (page.goto with extraHTTPHeaders) so the
 * server-side `hooks/locale.ts` is exercised end-to-end.
 */
import { expect, test } from '@playwright/test';

const RUN_E2E = process.env.RUN_E2E === '1';

test.describe('i18n locale negotiation (paraglide-js)', () => {
  test.skip(!RUN_E2E, 'set RUN_E2E=1 with the web dev server up on :5173');

  test('Accept-Language: ru renders Russian navigation', async ({ browser }) => {
    const context = await browser.newContext({ extraHTTPHeaders: { 'Accept-Language': 'ru,en;q=0.5' } });
    const page = await context.newPage();
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
    await expect(page.getByRole('link', { name: 'Загрузка' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Поиск' })).toBeVisible();
    await context.close();
  });

  test('cookie lang=en overrides Accept-Language: ru', async ({ browser }) => {
    const context = await browser.newContext({ extraHTTPHeaders: { 'Accept-Language': 'ru' } });
    await context.addCookies([{ name: 'lang', value: 'en', url: 'http://localhost:5173' }]);
    const page = await context.newPage();
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('link', { name: 'Ingest' })).toBeVisible();
    await context.close();
  });

  test('default (no header, no cookie) falls back to English', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await context.close();
  });
});
