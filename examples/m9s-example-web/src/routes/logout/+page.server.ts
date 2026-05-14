// SPDX-License-Identifier: Apache-2.0
/**
 * Wave 10.A — logout form action.
 *
 * Clears the `auth_token` + `refresh_token` cookies and redirects to
 * `/login`. The `load` export rejects GET access (a bare visit to /logout
 * shouldn't accidentally log a user out via a prefetch / preload) — the
 * action is reachable via POST only.
 *
 * Optionally fires a best-effort `POST /api/v1/auth/logout` for telemetry
 * — the backend response is ignored (JWT is stateless; logout server-side
 * is a no-op).
 */
import { redirect, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { apiConfig } from '$lib/api/client';

export const load: PageServerLoad = () => {
  // GET visits redirect to /login; there is no logout page UI.
  throw redirect(303, '/login');
};

export const actions: Actions = {
  default: async ({ cookies, fetch }) => {
    // Best-effort backend notify — failures are swallowed.
    try {
      await fetch(`${apiConfig.baseUrl}/api/v1/auth/logout`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'X-Tenant-ID': apiConfig.tenantId,
        },
        body: '{}',
      });
    } catch {
      // ignore — JWT is stateless, server has nothing to forget
    }

    cookies.delete('auth_token', { path: '/' });
    cookies.delete('refresh_token', { path: '/' });
    throw redirect(303, '/login');
  },
};
