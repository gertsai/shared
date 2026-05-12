/**
 * Wave 6.3 / ADR-012 — config fingerprint helper.
 *
 * `fingerprint(config?)` returns a stable SHA-256 hex digest of the
 * distinguishing identity fields of an `FgaClientConfig`. Used by
 * `getFgaClient`/`createFgaClient`/`resetFgaClient` and by
 * `OpenFgaPermissionGate` to derive a cache scope.
 *
 * Invariants (per ADR-012):
 *   - I-2 — Token confidentiality: the apiToken is hashed into the
 *     digest, NEVER stored as a plaintext substring of any Map key
 *     or other long-lived data structure outside the per-instance
 *     `GertsFgaClient.config.apiToken` field.
 *   - I-3 — Determinism: two configs with the same field values
 *     yield the same digest regardless of property iteration order
 *     in the source object literal. Achieved by hardcoding the
 *     property order in the canonical JSON below.
 *
 * IMPORTANT: When `FgaClientConfig` gains a NEW identity-affecting
 * field (e.g. ClientCredentials in a future ADR), update the
 * canonical JSON below + the dependent `client.multi-instance` test
 * suite. Out-of-sync fingerprint = silent cross-tenant cache
 * collision.
 */
import { createHash } from 'node:crypto';

import type { FgaClientConfig } from '../types.js';

/**
 * Stable scope key used by all "no config supplied" code paths
 * (`getFgaClient()`, `getPermissionCache()`). Backwards compat:
 * existing single-config workloads that call the no-arg form
 * continue to share this key, observing identical behaviour to the
 * pre-Wave-6.3 single-instance singleton.
 *
 * Typed as the literal `'__default__'` (Wave 6.3 Pre-Build TYPE-P0-1):
 * consumers importing this constant get the literal type at the use
 * site, so passing `DEFAULT_FINGERPRINT` to `getPermissionCache(scope)`
 * is type-distinguishable from passing an arbitrary string.
 */
export const DEFAULT_FINGERPRINT = '__default__' as const;

/**
 * Compute the canonical fingerprint of an OpenFGA client config.
 *
 * @param config — optional `FgaClientConfig`. When `undefined`, returns
 *                 {@link DEFAULT_FINGERPRINT}.
 * @returns SHA-256 hex digest (64 chars) when `config` is present;
 *          `'__default__'` when absent.
 *
 * Wave 7.5 (RFC-008): `oauth2` is identity-affecting — distinct OAuth2
 * credentials MUST produce distinct cache scopes, so all 4 fields
 * (`clientId`, `clientSecret`, `issuer`, `audience`) participate in the
 * canonical input. Like `apiToken`, `clientSecret` is consumed by the
 * SHA-256 hash and is NEVER stored as a plaintext substring of any
 * long-lived data structure outside the per-instance config field
 * (invariant I-2, extended to OAuth2 credentials).
 */
export function fingerprint(config?: FgaClientConfig): string {
  if (!config) return DEFAULT_FINGERPRINT;
  // Canonical JSON — keys hardcoded in alphabetical order. Do not
  // refactor to `JSON.stringify(config, sortReplacer)` — explicit is
  // safer than clever; future field additions are visible in this diff.
  //
  // Wave 7.5: `oauth2` is encoded as a nested object with the 4 OAuth2
  // fields in hardcoded alphabetical order (audience, clientId,
  // clientSecret, issuer). When `oauth2` is unset, we emit `null` to
  // preserve the SHA-256 collision-resistance between
  // `{ oauth2: undefined }` and `{ oauth2: { clientId: '', ... } }`
  // shapes — `JSON.stringify` would otherwise drop an explicit
  // `undefined` and silently collide.
  const canonical = JSON.stringify({
    apiUrl: config.apiUrl ?? '',
    apiToken: config.apiToken ?? '',
    authorizationModelId: config.authorizationModelId ?? '',
    oauth2: config.oauth2
      ? {
          audience: config.oauth2.audience,
          clientId: config.oauth2.clientId,
          clientSecret: config.oauth2.clientSecret,
          issuer: config.oauth2.issuer,
        }
      : null,
    storeId: config.storeId ?? '',
  });
  return createHash('sha256').update(canonical).digest('hex');
}
