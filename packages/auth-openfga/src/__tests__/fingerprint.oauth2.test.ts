/**
 * Wave 7.5 / RFC-008 — OAuth2 fingerprint coverage.
 *
 * Companion to `fingerprint.fitness.test.ts`. The fitness function
 * proves the top-level `oauth2` key is referenced in the canonical
 * JSON; this suite drills into the nested object and proves:
 *
 *   1. Back-compat: `fingerprint(undefined)` and `fingerprint({})` are
 *      both stable (no auth → DEFAULT scope and empty-config scope
 *      respectively; both must be deterministic across calls).
 *   2. Different auth methods (`apiToken` vs `oauth2`) produce
 *      DIFFERENT hashes — never silently share a cache slot.
 *   3. Canonical-key ordering: same OAuth2 values in different
 *      property-iteration order → same hash.
 *   4. Inner-field sensitivity: changing each of the 4 OAuth2 fields
 *      (audience, clientId, clientSecret, issuer) individually
 *      changes the hash.
 *   5. Secret confidentiality: `clientSecret` plaintext never appears
 *      in the hex output (invariant I-2 extended to OAuth2).
 */
import { describe, it, expect } from 'vitest';

import type { FgaClientConfig, FgaOAuth2Config } from '../types.js';
import { fingerprint, DEFAULT_FINGERPRINT } from '../util/fingerprint.js';

const BASE_OAUTH2: FgaOAuth2Config = {
  clientId: 'm2m-client-id',
  clientSecret: 'super-secret-do-not-log',
  issuer: 'https://tenant.auth0.com',
  audience: 'https://api.us1.fga.dev/',
};

describe('fingerprint() — OAuth2 (Wave 7.5 / RFC-008)', () => {
  it('back-compat: undefined config returns DEFAULT_FINGERPRINT (stable, no hashing)', () => {
    expect(fingerprint(undefined)).toBe(DEFAULT_FINGERPRINT);
    // Empty literal hashes, but is deterministic.
    const empty = fingerprint({});
    expect(empty).not.toBe(DEFAULT_FINGERPRINT);
    expect(empty).toBe(fingerprint({}));
  });

  it('apiToken-only vs oauth2-only produce DIFFERENT hashes (auth methods do not collide)', () => {
    const tokenOnly: FgaClientConfig = { apiToken: 'preshared-bearer' };
    const oauthOnly: FgaClientConfig = { oauth2: BASE_OAUTH2 };
    expect(fingerprint(tokenOnly)).not.toBe(fingerprint(oauthOnly));
  });

  it('same OAuth2 fields in different property order → same hash (canonical ordering)', () => {
    // TypeScript object literals are unordered; canonical JSON encodes
    // the 4 OAuth2 keys in hardcoded alphabetical order, so any source
    // ordering at the call site must produce the identical digest.
    const a: FgaClientConfig = {
      oauth2: {
        clientId: BASE_OAUTH2.clientId,
        clientSecret: BASE_OAUTH2.clientSecret,
        issuer: BASE_OAUTH2.issuer,
        audience: BASE_OAUTH2.audience,
      },
    };
    const b: FgaClientConfig = {
      oauth2: {
        audience: BASE_OAUTH2.audience,
        issuer: BASE_OAUTH2.issuer,
        clientSecret: BASE_OAUTH2.clientSecret,
        clientId: BASE_OAUTH2.clientId,
      },
    };
    expect(fingerprint(a)).toBe(fingerprint(b));
  });

  it('different `audience` (other 3 fields equal) → different hash', () => {
    const a: FgaClientConfig = { oauth2: BASE_OAUTH2 };
    const b: FgaClientConfig = {
      oauth2: { ...BASE_OAUTH2, audience: 'https://api.eu1.fga.dev/' },
    };
    expect(fingerprint(a)).not.toBe(fingerprint(b));
  });

  it('different `clientId` → different hash', () => {
    const a: FgaClientConfig = { oauth2: BASE_OAUTH2 };
    const b: FgaClientConfig = { oauth2: { ...BASE_OAUTH2, clientId: 'other-client' } };
    expect(fingerprint(a)).not.toBe(fingerprint(b));
  });

  it('different `clientSecret` → different hash', () => {
    const a: FgaClientConfig = { oauth2: BASE_OAUTH2 };
    const b: FgaClientConfig = { oauth2: { ...BASE_OAUTH2, clientSecret: 'rotated-secret' } };
    expect(fingerprint(a)).not.toBe(fingerprint(b));
  });

  it('different `issuer` → different hash', () => {
    const a: FgaClientConfig = { oauth2: BASE_OAUTH2 };
    const b: FgaClientConfig = {
      oauth2: { ...BASE_OAUTH2, issuer: 'https://different-tenant.auth0.com' },
    };
    expect(fingerprint(a)).not.toBe(fingerprint(b));
  });

  it('clientSecret plaintext never appears in fingerprint output (I-2 extended)', () => {
    const cfg: FgaClientConfig = { oauth2: BASE_OAUTH2 };
    const hex = fingerprint(cfg);
    // SHA-256 hex is 64 chars of [0-9a-f]; the plaintext secret is a
    // mixed-case ASCII string and cannot appear as a substring.
    expect(hex).toHaveLength(64);
    expect(hex).toMatch(/^[0-9a-f]{64}$/);
    expect(hex).not.toContain(BASE_OAUTH2.clientSecret);
    expect(hex).not.toContain(BASE_OAUTH2.clientId);
    expect(hex).not.toContain(BASE_OAUTH2.issuer);
    expect(hex).not.toContain(BASE_OAUTH2.audience);
  });
});
