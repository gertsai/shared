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

/**
 * EVID-036 audit fix (P2 / CI-4): validate `?next=` before consuming it as
 * a redirect target. Open-redirect protection: must be a same-origin
 * absolute path — starts with `/`, doesn't start with `//` (protocol-
 * relative), doesn't contain `:` before the first `/` (scheme-prefixed).
 */
function safeNextRedirect(raw: string | null): string {
  if (raw === null || raw.length === 0) return '/';
  // Wave 12.E-fix-1 (PRD-038 FR-012 / EVID-053 H-7): reject control chars
  // and NUL bytes. Browsers normalise `\t` / `\n` / `\r` / `\x00` inside
  // URL strings; pre-fix the validator only checked for backslash and `:`
  // before the first slash, leaving `/\tjavascript:alert(1)` etc. as
  // bypass payloads even though `redirect(303)` does its own validation.
  // Defense-in-depth — fail fast at the trust boundary.
  if (/[\x00-\x1F\x7F]/.test(raw)) return '/';
  if (!raw.startsWith('/')) return '/';
  if (raw.startsWith('//')) return '/';
  // Reject backslash tricks like `/\evil.com` that browsers normalise.
  if (raw.includes('\\')) return '/';
  // Reject schemes (`/javascript:...` etc.).
  const firstSlash = raw.indexOf('/', 1);
  const head = firstSlash === -1 ? raw : raw.slice(0, firstSlash);
  if (head.includes(':')) return '/';
  return raw;
}

export const actions: Actions = {
  default: async ({ request, cookies, fetch, url }) => {
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

    // EVID-036 audit fix (P1 / CI-4 + Logic C5): honor `?next=` set by the
    // admin layout guard. Validated above to be a same-origin path.
    const next = safeNextRedirect(url.searchParams.get('next'));
    throw redirect(303, next);
  },
};
