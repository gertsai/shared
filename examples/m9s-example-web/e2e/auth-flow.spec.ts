// SPDX-License-Identifier: Apache-2.0
/**
 * Wave 10.A E2E — login → cookie → logout round-trip.
 *
 * Gated on `RUN_E2E=1` because the test requires:
 *   - SvelteKit dev server on :5173
 *     (`pnpm --filter @gertsai-examples/m9s-example-web dev`)
 *   - m9s-example Moleculer backend on :3031
 *     (`pnpm --filter @gertsai-examples/m9s-example dev`)
 *
 * The demo backend accepts ANY email + password, so we don't need a
 * fixture user account.
 *
 * Flow:
 *   1. visit /login → fill email + password → submit
 *   2. assert redirect to / + `auth_token` cookie present
 *   3. assert nav shows the email + a "Sign out" button
 *   4. click "Sign out" → assert redirect to /login + cookie cleared
 */
import { test, expect } from '@playwright/test';

const RUN_E2E = process.env.RUN_E2E === '1';
const EMAIL = `e2e-${Date.now()}@example.com`;
const PASSWORD = 'anything-works-in-demo';

test.describe('auth flow', () => {
  test.skip(!RUN_E2E, 'set RUN_E2E=1 with backend up');

  test('login sets cookie + logout clears it', async ({ page, context }) => {
    // --- Login ---
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();

    await page.fill('#email', EMAIL);
    await page.fill('#password', PASSWORD);

    await Promise.all([
      page.waitForURL('**/', { timeout: 10_000 }),
      page.getByTestId('login-submit').click(),
    ]);

    // Cookie should now be set.
    const cookiesAfterLogin = await context.cookies();
    const authCookie = cookiesAfterLogin.find((c) => c.name === 'auth_token');
    expect(authCookie).toBeDefined();
    expect(authCookie?.httpOnly).toBe(true);

    // Nav shows email + sign-out button.
    const authBadge = page.getByTestId('auth-badge');
    await expect(authBadge).toBeVisible();
    await expect(authBadge).toContainText(EMAIL);

    // --- Logout ---
    await Promise.all([
      page.waitForURL('**/login', { timeout: 10_000 }),
      page.getByTestId('logout-submit').click(),
    ]);

    const cookiesAfterLogout = await context.cookies();
    const stillThere = cookiesAfterLogout.find((c) => c.name === 'auth_token');
    expect(stillThere).toBeUndefined();
  });
});
