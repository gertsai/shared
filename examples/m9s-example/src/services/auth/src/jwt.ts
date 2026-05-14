// SPDX-License-Identifier: Apache-2.0
/**
 * JWT sign/verify helpers — Wave 10.A demo auth.
 *
 * IMPORTANT: this is a DEMO. The default secret
 * (`demo-secret-do-not-use-in-prod`) is hardcoded; production deployments
 * MUST set `JWT_SECRET` to a high-entropy value (≥256 bits). The library
 * verifies the signature but the resulting trust is only as strong as the
 * secret you supply.
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

const DEFAULT_SECRET = 'demo-secret-do-not-use-in-prod';
const ISSUER = 'm9s-example';

/** Access token TTL — short-lived. */
const ACCESS_TTL_SECONDS = 15 * 60;
/** Refresh token TTL — longer-lived. */
const REFRESH_TTL_SECONDS = 24 * 60 * 60;

/**
 * Resolve the HS256 secret. Hard-fails in production when JWT_SECRET is unset
 * (CWE-798 — hardcoded credential): the DEFAULT_SECRET is a public string and
 * any deploy without an override would let attackers forge tokens. Demo /
 * local-dev paths can opt-in via M9S_ALLOW_DEMO_SECRET=1.
 *
 * EVID-036 audit fix (P0 / CI-1).
 */
function getSecret(): string {
  const fromEnv = process.env.JWT_SECRET;
  if (fromEnv && fromEnv.length > 0) return fromEnv;
  if (process.env.NODE_ENV === 'production' && process.env.M9S_ALLOW_DEMO_SECRET !== '1') {
    throw new Error(
      'JWT_SECRET must be set in production. To run the demo with the public ' +
        'default secret, set M9S_ALLOW_DEMO_SECRET=1 explicitly.',
    );
  }
  return DEFAULT_SECRET;
}

// ---------------------------------------------------------------------------
// Claim shape
// ---------------------------------------------------------------------------

/** Decoded JWT payload (after `verify`). */
export interface JwtClaims {
  /** Subject — user id. RFC 7519 standard. */
  sub: string;
  email: string;
  tenantId: string;
  /** Marks token kind so a refresh token can't be used as an access token. */
  kind: 'access' | 'refresh';
  /** Issued-at (seconds since epoch). RFC 7519 standard. */
  iat: number;
  /** Expiry (seconds since epoch). RFC 7519 standard. */
  exp: number;
  /** Issuer. RFC 7519 standard. */
  iss: string;
  /**
   * JWT ID (RFC 7519 §4.1.7). Wave 10.E (PRD-022) — required on refresh
   * tokens so we can track use/reuse in the rotation store. Always present
   * on refresh tokens; optional on access tokens (we don't track those).
   */
  jti?: string;
}

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

/**
 * Build a demo user record from an arbitrary email.
 * Hash-derived id keeps it deterministic for a given email (so a re-login
 * returns the same `sub`) without storing anything server-side.
 */
export function demoUserFromEmail(email: string, tenantId = 'tenant-acme'): DemoUser {
  // Deterministic, non-cryptographic id — pure demo aid. NOT a security
  // primitive: the auth surface accepts any password, so the id only
  // serves to make repeat-logins stable in the browser cookie path.
  let h = 0;
  for (let i = 0; i < email.length; i += 1) {
    h = (h * 31 + email.charCodeAt(i)) | 0;
  }
  return {
    id: `user-${Math.abs(h).toString(36)}`,
    email,
    tenantId,
  };
}
