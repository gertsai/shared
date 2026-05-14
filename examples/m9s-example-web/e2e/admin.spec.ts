// SPDX-License-Identifier: Apache-2.0
/**
 * Wave 10.B (PRD-019 FR-004 + FR-006) — admin CMS slice E2E.
 *
 * Three flows under one describe block:
 *   1. anonymous /admin/content → 302 → /login?next=%2Fadmin%2Fcontent
 *   2. authenticated /admin/content → list table visible
 *   3. delete via form-action → row removed (or empty-state shown)
 *
 * Gated on RUN_E2E=1 (same convention as the Wave 10.A auth-flow spec).
 * Additional skip on SKIP_REAL_INFRA=1 for CI runners without backend.
 */
import { test, expect } from '@playwright/test';

const RUN_E2E = process.env.RUN_E2E === '1' && process.env.SKIP_REAL_INFRA !== '1';
const EMAIL = `admin-e2e-${Date.now()}@example.com`;
const PASSWORD = 'anything-works-in-demo';

test.describe('admin CMS slice', () => {
  test.skip(!RUN_E2E, 'set RUN_E2E=1 (and not SKIP_REAL_INFRA=1) with backend up');

  test('anonymous user is redirected to login with next= param', async ({ page }) => {
    const response = await page.goto('/admin/content');
    // Either we land directly on /login (303/302 followed) or the body shows
    // the login page after redirect — assert both URL and content.
    await expect(page).toHaveURL(/\/login\?next=%2Fadmin%2Fcontent/);
    // Status is 200 after the redirect lands on /login.
    expect(response?.status() ?? 0).toBeLessThan(400);
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  });

  test('authenticated user sees the content table', async ({ page }) => {
    // Sign in first (demo backend accepts any credentials).
    await page.goto('/login');
    await page.fill('#email', EMAIL);
    await page.fill('#password', PASSWORD);
    await Promise.all([
      page.waitForURL('**/', { timeout: 10_000 }),
      page.getByTestId('login-submit').click(),
    ]);

    // Admin nav entry should now be visible.
    await expect(page.getByTestId('nav-link-admin')).toBeVisible();

    // Navigate to the admin content page.
    await page.goto('/admin/content');
    await expect(page).toHaveURL(/\/admin\/content/);
    await expect(page.getByTestId('admin-badge')).toBeVisible();
    await expect(page.getByTestId('admin-badge')).toContainText(EMAIL);

    // Either we see an empty state OR a table — both are valid for a
    // fresh demo backend; assert at least one is present.
    const empty = page.getByTestId('admin-content-empty');
    const firstRow = page.getByTestId('admin-content-row').first();
    await expect(empty.or(firstRow)).toBeVisible();
  });

  test('delete flow removes a row via form action + confirm dialog', async ({ page }) => {
    // Sign in.
    await page.goto('/login');
    await page.fill('#email', EMAIL);
    await page.fill('#password', PASSWORD);
    await Promise.all([
      page.waitForURL('**/', { timeout: 10_000 }),
      page.getByTestId('login-submit').click(),
    ]);

    // Seed a document via the /ingest form so the admin list is non-empty.
    const seedDocId = `admin-e2e-doc-${Date.now()}`;
    await page.goto('/ingest');
    await page.fill('#docId', seedDocId);
    await page.fill('#text', 'admin e2e seed document body');
    await page.getByRole('button', { name: /ingest/i }).click();
    // Wait for the success Toast or any post-submit reload.
    await page.waitForLoadState('networkidle');

    // Open admin list — accept the upcoming confirm dialog before clicking
    // Delete (Playwright requires the handler registered first).
    await page.goto('/admin/content');
    const targetRow = page.locator(`[data-testid="admin-content-row"][data-doc-id="${seedDocId}"]`);
    // Empty state if list-documents NOT_IMPLEMENTED — short-circuit gracefully.
    const empty = page.getByTestId('admin-content-empty');
    if (await empty.isVisible().catch(() => false)) {
      test.skip(true, 'list-documents not implemented for this storage provider');
      return;
    }
    await expect(targetRow).toBeVisible();

    page.once('dialog', async (dialog) => {
      expect(dialog.type()).toBe('confirm');
      await dialog.accept();
    });
    await targetRow.getByTestId('admin-content-delete').click();
    // After the form action completes, the row should be gone.
    await expect(targetRow).toHaveCount(0, { timeout: 10_000 });
  });
});
