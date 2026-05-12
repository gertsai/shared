/**
 * Wave 6.3 Pre-Build ARCH-P1-3 — fingerprint coverage fitness function.
 *
 * Evolutionary-architecture guard: when `FgaClientConfig` gains a NEW
 * identity-affecting field (e.g. ClientCredentials, tlsCa, proxyUrl)
 * a developer who adds it to `types.ts` but FORGETS to update
 * `util/fingerprint.ts` produces silent cross-tenant cache collision —
 * exactly the SEC-class bug Wave 6.3 prevents.
 *
 * This test enumerates the keys of a maximally-populated
 * `FgaClientConfig` literal and asserts every key is referenced inside
 * the canonical JSON of `fingerprint()`. The assertion is mechanical —
 * no human discipline required.
 *
 * If you add a new field to FgaClientConfig:
 *   - If it IS identity-affecting (different value → different client
 *     instance expected), update both the canonical JSON in
 *     `util/fingerprint.ts` AND the `IDENTITY_FIELDS` array below.
 *   - If it is NOT identity-affecting (e.g. `timeout`, `retry`),
 *     add it to the `NON_IDENTITY_FIELDS` allowlist below with a
 *     comment explaining why it's exempt.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { FgaClientConfig } from '../types.js';

const FINGERPRINT_SOURCE = (() => {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(
    resolve(here, '..', 'util', 'fingerprint.ts'),
    'utf8',
  );
})();

/**
 * Identity-affecting fields — every distinct value MUST produce a
 * distinct cached `GertsFgaClient` instance. The fingerprint canonical
 * JSON must reference EACH of these keys.
 */
const IDENTITY_FIELDS = [
  'apiUrl',
  'storeId',
  'authorizationModelId',
  'apiToken',
  // Wave 7.5 / RFC-008 — OAuth2 credentials nested object. Distinct
  // OAuth2 configs must produce distinct cache scopes (same SEC-class
  // reasoning as `apiToken`). Inner-field coverage is asserted in
  // `__tests__/fingerprint.oauth2.test.ts`.
  'oauth2',
] as const;

/**
 * Non-identity fields — variations DO NOT need a fresh instance
 * (timeouts, retry policy etc. apply per-call inside the SDK; sharing
 * a client across slightly different tunings is acceptable).
 *
 * Add new fields here when introducing them to `FgaClientConfig` if
 * they should NOT be part of the cache key.
 */
const NON_IDENTITY_FIELDS = [
  // SDK-level request timing — does not affect store/auth identity.
  'timeout',
  // Retry strategy — orthogonal to identity.
  'retry',
] as const;

describe('fingerprint() — fitness function (Wave 6.3 ARCH-P1-3)', () => {
  it('canonical JSON references every IDENTITY_FIELDS member', () => {
    for (const field of IDENTITY_FIELDS) {
      // Search for `<field>:` somewhere inside the canonical JSON in
      // fingerprint.ts source. This is an admittedly textual check
      // — that's the point: it survives renames in TS but breaks
      // when a new field is added without source-level update.
      const pattern = new RegExp(`${field}\\s*:`);
      expect(FINGERPRINT_SOURCE).toMatch(pattern);
    }
  });

  it('every key of a fully-populated FgaClientConfig is either identity OR non-identity', () => {
    // Construct a literal that exercises every documented field of
    // FgaClientConfig. If a new field is added to types.ts, this
    // initialiser MUST be updated; the test will surface the
    // omission via the `keys` assertion below.
    const sample: Required<FgaClientConfig> = {
      apiUrl: 'http://x',
      storeId: 's',
      authorizationModelId: 'm',
      apiToken: 't',
      // Wave 7.5: OAuth2 is mutually exclusive with `apiToken` at the
      // `GertsFgaClient` constructor; for the purpose of the fitness
      // function — which asserts schema completeness — both fields are
      // populated. The constructor-level exclusivity is covered by
      // companion integration tests.
      oauth2: {
        clientId: 'cid',
        clientSecret: 'cs',
        issuer: 'https://idp.example.com',
        audience: 'https://api.fga.example.com/',
      },
      timeout: 1000,
      retry: { maxAttempts: 1, initialDelay: 1, maxDelay: 1 },
    };

    const known: ReadonlyArray<string> = [...IDENTITY_FIELDS, ...NON_IDENTITY_FIELDS];
    for (const key of Object.keys(sample)) {
      expect(known).toContain(key);
    }
    // And the converse: nothing in `known` is missing from the sample.
    for (const key of known) {
      expect(Object.prototype.hasOwnProperty.call(sample, key)).toBe(true);
    }
  });

  it('canonical JSON does NOT reference any NON_IDENTITY_FIELDS (would induce false misses)', () => {
    for (const field of NON_IDENTITY_FIELDS) {
      // If a non-identity field appears in the canonical JSON, two
      // configs identical except for `timeout` would produce
      // different fingerprints → different cached instances →
      // accidental tenant fragmentation. Catch that here.
      const pattern = new RegExp(`\\b${field}\\s*:`);
      expect(FINGERPRINT_SOURCE).not.toMatch(pattern);
    }
  });
});
