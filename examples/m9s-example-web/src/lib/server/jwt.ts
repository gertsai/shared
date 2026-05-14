// SPDX-License-Identifier: Apache-2.0
/**
 * Server-side JWT verify helper — Wave 10.A demo.
 *
 * Pure Node `crypto` implementation of HS256 verification — intentionally
 * NOT depending on `jsonwebtoken` so the web package keeps its zero-runtime-
 * crypto-dep posture. Mirrors the contract of the backend `services/auth/
 * src/jwt.ts` (HS256, `iss: 'm9s-example'`, secret from `JWT_SECRET`).
 *
 * Security caveats — this is a DEMO:
 *   - default secret (`demo-secret-do-not-use-in-prod`) MUST be replaced
 *     in any non-demo deployment;
 *   - no JWKS / asymmetric keys: a compromised secret invalidates both
 *     signers and verifiers;
 *   - timing-safe comparison via `crypto.timingSafeEqual`.
 *
 * Returns the typed claims on success, `null` on any failure (signature,
 * expiry, malformed, wrong issuer, wrong algorithm).
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

const DEFAULT_SECRET = 'demo-secret-do-not-use-in-prod';
const ISSUER = 'm9s-example';

/** Claims attached to `event.locals.user` after successful verify. */
export interface JwtClaims {
  sub: string;
  email: string;
  tenantId: string;
  kind: 'access' | 'refresh';
  iat: number;
  exp: number;
  iss: string;
}

/**
 * Resolve the HS256 secret. Hard-fails in production when JWT_SECRET is unset
 * (CWE-798): the DEFAULT_SECRET is committed to the repo and identical on
 * web + backend, so any deploy without an override would let attackers forge
 * tokens. Demo / local-dev paths can opt-in via M9S_ALLOW_DEMO_SECRET=1.
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

/** Base64url decode → utf8 string. Returns null on malformed input. */
function decodeBase64Url(s: string): string | null {
  try {
    const pad = s.length % 4;
    const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + (pad ? '='.repeat(4 - pad) : '');
    return Buffer.from(b64, 'base64').toString('utf8');
  } catch {
    return null;
  }
}

function decodeBase64UrlBytes(s: string): Buffer | null {
  try {
    const pad = s.length % 4;
    const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + (pad ? '='.repeat(4 - pad) : '');
    return Buffer.from(b64, 'base64');
  } catch {
    return null;
  }
}

/**
 * Verify a JWT signed with HS256.
 *
 * Returns the typed claims on success, `null` on:
 *   - malformed input (not 3 dot-separated parts, non-base64url bytes)
 *   - wrong algorithm (`alg !== 'HS256'`)
 *   - bad signature (constant-time compare)
 *   - expired (`exp <= now`)
 *   - wrong issuer (`iss !== 'm9s-example'`)
 *   - missing required claims
 */
export function verifyToken(token: string): JwtClaims | null {
  if (typeof token !== 'string' || token.length === 0) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, signatureB64] = parts;

  // 1. Header — algorithm guard.
  const headerJson = decodeBase64Url(headerB64);
  if (headerJson === null) return null;
  let header: Record<string, unknown>;
  try {
    header = JSON.parse(headerJson) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (header.alg !== 'HS256' || header.typ !== 'JWT') return null;

  // 2. Signature — constant-time compare.
  const signingInput = `${headerB64}.${payloadB64}`;
  const expectedSig = createHmac('sha256', getSecret()).update(signingInput).digest();
  const providedSig = decodeBase64UrlBytes(signatureB64);
  if (providedSig === null || providedSig.length !== expectedSig.length) return null;
  if (!timingSafeEqual(providedSig, expectedSig)) return null;

  // 3. Payload — claim validation.
  const payloadJson = decodeBase64Url(payloadB64);
  if (payloadJson === null) return null;
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(payloadJson) as Record<string, unknown>;
  } catch {
    return null;
  }

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
  if (payload.iss !== ISSUER) return null;
  const now = Math.floor(Date.now() / 1_000);
  if (payload.exp <= now) return null;

  return {
    sub: payload.sub,
    email: payload.email,
    tenantId: payload.tenantId,
    kind: payload.kind,
    iat: payload.iat,
    exp: payload.exp,
    iss: payload.iss,
  };
}

/**
 * Decode payload without verifying signature.
 * Useful for clients that need to read `exp` to decide when to refresh —
 * NEVER use the result for authorization decisions.
 */
export function unsafeDecodeExp(token: string): number | null {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const payloadJson = decodeBase64Url(parts[1]);
  if (payloadJson === null) return null;
  try {
    const p = JSON.parse(payloadJson) as Record<string, unknown>;
    return typeof p.exp === 'number' ? p.exp : null;
  } catch {
    return null;
  }
}
