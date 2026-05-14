// SPDX-License-Identifier: Apache-2.0
/**
 * JWT claims contract shared between m9s-example backend (sign + verify)
 * and m9s-example-web SvelteKit hooks (verify only).
 *
 * Wave 11.B (PRD-024) — extracted from duplicate structural copies in:
 *   - examples/m9s-example/src/services/auth/src/jwt.ts
 *   - examples/m9s-example-web/src/lib/server/jwt.ts
 *
 * Closes EVID-036 audit finding CI-5 (drift risk — identical interfaces
 * declared twice; nothing enforced alignment going forward).
 *
 * Both jwt.ts files now `import type { JwtClaims, JwtAccessClaims,
 * JwtRefreshClaims } from '@gertsai-examples/m9s-example-api-types'` —
 * any future shape change is a one-file edit here that ripples to both
 * consumers via the type checker.
 */

/** Token kind discriminator — refresh tokens MUST NOT be presented as access. */
export type JwtKind = 'access' | 'refresh';

/**
 * Common JWT claim shape. Mirrors RFC 7519 standard fields (`sub`, `iat`,
 * `exp`, `iss`) plus two custom fields (`email`, `tenantId`) the
 * SvelteKit hooks attach to `event.locals.user`.
 *
 * `jti` (RFC 7519 §4.1.7) is optional on access tokens; required on
 * refresh tokens since Wave 10.E (PRD-022) so the rotation store can
 * track use/reuse.
 */
export interface JwtClaims {
  /** Subject — user id. RFC 7519 standard. */
  readonly sub: string;
  readonly email: string;
  readonly tenantId: string;
  /** Marks token kind so a refresh token can't be used as access. */
  readonly kind: JwtKind;
  /** Issued-at (seconds since epoch). RFC 7519 standard. */
  readonly iat: number;
  /** Expiry (seconds since epoch). RFC 7519 standard. */
  readonly exp: number;
  /** Issuer. RFC 7519 standard. */
  readonly iss: string;
  /**
   * JWT ID (RFC 7519 §4.1.7). Required on refresh tokens (rotation
   * store key); optional on access tokens (we don't track those).
   */
  readonly jti?: string;
}

/** Narrow type for access tokens — `kind: 'access'`, jti optional. */
export interface JwtAccessClaims extends JwtClaims {
  readonly kind: 'access';
}

/** Narrow type for refresh tokens — `kind: 'refresh'`, jti REQUIRED. */
export interface JwtRefreshClaims extends JwtClaims {
  readonly kind: 'refresh';
  readonly jti: string;
}
