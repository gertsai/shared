// SPDX-License-Identifier: Apache-2.0
/**
 * JWT sign/verify helpers — Wave 10.A demo auth (hardened in Wave 11.A).
 *
 * Wave 11.A (PRD-023, FR-002): the historical `DEFAULT_SECRET` fallback
 * and `M9S_ALLOW_DEMO_SECRET=1` escape hatch are GONE. `JWT_SECRET` is
 * now a hard boot requirement — calling any sign/verify helper without
 * it set throws synchronously.
 *
 * Algorithm: HS256 (symmetric). Adequate for a single-process demo where
 * the same backend signs and verifies. A multi-service deployment would
 * use RS256 with a key pair so verifiers don't need the signing secret.
 *
 * Token lifetimes (demo defaults):
 *   - access  token: 15 min — short enough that loss is low-impact
 *   - refresh token: 24 h   — long enough to keep the demo session alive
 *
 * Claims shape mirrors RFC 7519 standard fields (`sub`, `iss`, `exp`, `iat`)
 * plus two custom fields (`email`, `tenantId`) the SvelteKit hooks attach
 * to `event.locals.user`.
 */
import { randomUUID } from 'node:crypto';

import jwt from 'jsonwebtoken';

import type { DemoUser } from '../types';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const ISSUER = 'm9s-example';

/** Access token TTL — short-lived. */
const ACCESS_TTL_SECONDS = 15 * 60;
/** Refresh token TTL — longer-lived. */
const REFRESH_TTL_SECONDS = 24 * 60 * 60;

/**
 * Resolve the HS256 secret. Hard-fails unconditionally when `JWT_SECRET`
 * is unset (CWE-798 — hardcoded credential). Wave 11.A (PRD-023, FR-002)
 * removed the `DEFAULT_SECRET` fallback and `M9S_ALLOW_DEMO_SECRET`
 * opt-in: any deploy — demo, CI, prod — must set `JWT_SECRET` to a
 * high-entropy value (≥256 bits).
 */
function getSecret(): string {
  const fromEnv = process.env.JWT_SECRET;
  if (!fromEnv || fromEnv.length === 0) {
    throw new Error('JWT_SECRET must be set');
  }
  return fromEnv;
}

// ---------------------------------------------------------------------------
// Claim shape — Wave 11.B (PRD-024): JwtClaims now imported from the
// shared package `@gertsai-examples/m9s-example-api-types` so web + backend
// stay in lock-step. Re-exported for backward compat with existing callers
// (`tryGetRequestContextFromCtx`, `app.d.ts`, etc.).
// ---------------------------------------------------------------------------

import type { JwtClaims } from '@gertsai-examples/m9s-example-api-types';
export type { JwtClaims } from '@gertsai-examples/m9s-example-api-types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Produce ISO-8601 expiry timestamp `n` seconds from now. */
export function expiryIso(seconds: number): string {
  return new Date(Date.now() + seconds * 1_000).toISOString();
}

/** Sign an access token (15 min). */
export function signAccessToken(user: DemoUser): { token: string; expiresAt: string } {
  const token = jwt.sign(
    { email: user.email, tenantId: user.tenantId, kind: 'access' },
    getSecret(),
    {
      algorithm: 'HS256',
      issuer: ISSUER,
      subject: user.id,
      expiresIn: ACCESS_TTL_SECONDS,
    },
  );
  return { token, expiresAt: expiryIso(ACCESS_TTL_SECONDS) };
}

/**
 * Sign a refresh token (24 h). Wave 10.E (PRD-022) — every refresh token
 * carries a unique `jti` so the rotation store can track use/reuse. The
 * returned object exposes the jti so the caller (login + refresh actions)
 * can register it in the store before handing the token to the client.
 */
export function signRefreshToken(user: DemoUser): { token: string; jti: string } {
  const jti = randomUUID();
  const token = jwt.sign(
    { email: user.email, tenantId: user.tenantId, kind: 'refresh', jti },
    getSecret(),
    {
      algorithm: 'HS256',
      issuer: ISSUER,
      subject: user.id,
      expiresIn: REFRESH_TTL_SECONDS,
    },
  );
  return { token, jti };
}

/**
 * Verify a token of either kind.
 * Returns the typed claims on success, `null` on any failure (signature
 * mismatch, expiry, malformed). Callers MUST also check `claims.kind`
 * to distinguish access vs refresh.
 */
export function verifyToken(token: string): JwtClaims | null {
  try {
    const decoded = jwt.verify(token, getSecret(), {
      algorithms: ['HS256'],
      issuer: ISSUER,
    });
    if (typeof decoded === 'string') return null;
    const payload = decoded as Record<string, unknown>;
    if (
      typeof payload.sub !== 'string' ||
      typeof payload.email !== 'string' ||
      typeof payload.tenantId !== 'string' ||
      (payload.kind !== 'access' && payload.kind !== 'refresh') ||
      typeof payload.iat !== 'number' ||
      typeof payload.exp !== 'number' ||
      typeof payload.iss !== 'string'
    ) {
      return null;
    }
    // Wave 10.E (PRD-022): refresh tokens MUST carry a jti. Reject malformed
    // ones early so callers don't dereference `undefined` from the store.
    if (payload.kind === 'refresh' && typeof payload.jti !== 'string') {
      return null;
    }
    return {
      sub: payload.sub,
      email: payload.email,
      tenantId: payload.tenantId,
      kind: payload.kind,
      iat: payload.iat,
      exp: payload.exp,
      iss: payload.iss,
      ...(typeof payload.jti === 'string' && { jti: payload.jti }),
    };
  } catch {
    return null;
  }
}

// Wave 11.A (PRD-023, FR-001): `demoUserFromEmail(...)` removed. The
// previous "derive a user from any email" helper enabled the accept-any-
// credentials login path. Real login now flows through `IUserRepo` in
// `./user-repo.ts` — see `actions/login.action.ts` for the call site.
