// SPDX-License-Identifier: Apache-2.0
/**
 * Wave 10.A — login form action.
 *
 * Posts `{email, password}` to the backend `POST /api/v1/auth/login`, sets
 * the returned access token as an `httpOnly` cookie (`auth_token`), and
 * redirects to `/`. Failures return a `{ error, email }` shape consumed
 * by the page for inline display.
 *
 * The DEMO backend accepts any credentials and always returns 200.
 * Production code would map 401 to a specific user-facing error.
 */
import { fail, redirect, type Actions } from '@sveltejs/kit';
import { apiConfig } from '$lib/api/client';

interface LoginSuccessResponse {
  token: string;
  refreshToken: string;
  user: { id: string; email: string; tenantId: string };
  expiresAt: string;
}

/** Wraps the backend envelope (`{ data, ... }` from APIController). */
function unwrap(body: unknown): LoginSuccessResponse | null {
  if (typeof body !== 'object' || body === null) return null;
  const env = body as Record<string, unknown>;
  // api-core envelopes responses under `data` — fall back to root for the
  // (rare) case where a future middleware strips the envelope.
  const inner = (env.data ?? env) as Record<string, unknown>;
  if (
    typeof inner.token === 'string' &&
    typeof inner.refreshToken === 'string' &&
    typeof inner.expiresAt === 'string' &&
    typeof inner.user === 'object' &&
    inner.user !== null
  ) {
    return inner as unknown as LoginSuccessResponse;
  }
  return null;
}

export const actions: Actions = {
  default: async ({ request, cookies, fetch }) => {
    const formData = await request.formData();
    const email = formData.get('email')?.toString().trim() ?? '';
    const password = formData.get('password')?.toString() ?? '';

    if (!email || !password) {
      return fail(400, {
        error: 'Email and password are required.',
        email,
      });
    }

    let body: unknown;
    try {
      const res = await fetch(`${apiConfig.baseUrl}/api/v1/auth/login`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'X-Tenant-ID': apiConfig.tenantId,
        },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        return fail(res.status, {
          error: `Login rejected (HTTP ${res.status}).`,
          email,
        });
      }
      body = await res.json();
    } catch (err) {
      return fail(502, {
        error: `Login request failed: ${err instanceof Error ? err.message : String(err)}`,
        email,
      });
    }

    const parsed = unwrap(body);
    if (parsed === null) {
      return fail(502, {
        error: 'Unexpected login response shape.',
        email,
      });
    }

    cookies.set('auth_token', parsed.token, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      // Cookie outlives the JWT slightly so the auth handler sees the
      // expired token + clears it explicitly (rather than the browser
      // dropping the cookie first and the handler never running).
      maxAge: 60 * 30,
    });
    cookies.set('refresh_token', parsed.refreshToken, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24,
    });

    throw redirect(303, '/');
  },
};
