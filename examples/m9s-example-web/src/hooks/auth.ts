// SPDX-License-Identifier: Apache-2.0
/**
 * Wave 10.A — JWT auth handler.
 *
 * Reads the `auth_token` cookie on every request and, if valid, attaches a
 * minimal user descriptor to `event.locals.user`. Invalid / missing tokens
 * are NOT a hard error: Wave 9 routes remain anonymous-accessible (the
 * existing surface is intentionally open). Wave 10.B/C CMS routes will
 * guard with `if (!locals.user) throw redirect(302, '/login')` per-route.
 *
 * Special handling:
 *   - if a cookie is present but FAILS to verify (tampered / expired /
 *     wrong issuer), we clear it so the browser doesn't keep replaying a
 *     broken token on every request;
 *   - tokens with `kind !== 'access'` are rejected (refresh tokens must
 *     never grant session access).
 */
import type { Handle } from '@sveltejs/kit';
import { verifyToken } from '$lib/server/jwt';

const COOKIE_NAME = 'auth_token';
const REFRESH_COOKIE_NAME = 'refresh_token';

export const authHandler: Handle = async ({ event, resolve }) => {
  const token = event.cookies.get(COOKIE_NAME);

  if (typeof token === 'string' && token.length > 0) {
    const claims = verifyToken(token);
    if (claims !== null && claims.kind === 'access') {
      event.locals.user = {
        id: claims.sub,
        email: claims.email,
        tenantId: claims.tenantId,
      };
    } else {
      // EVID-036 audit fix (P1 / U-3): also clear the long-lived
      // refresh_token cookie when the access token is invalid. Before this
      // fix, a tampered/expired access token was cleared but the 24h
      // refresh token persisted client-side as a stale credential.
      event.cookies.delete(COOKIE_NAME, { path: '/' });
      event.cookies.delete(REFRESH_COOKIE_NAME, { path: '/' });
    }
  }

  return resolve(event);
};
