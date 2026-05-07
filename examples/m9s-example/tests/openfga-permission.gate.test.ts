// SPDX-License-Identifier: Apache-2.0
/**
 * Wave 6.2 / RFC-003 Edge 2 — gate apiToken acceptance test.
 *
 * Verifies:
 *   - The gate constructor accepts `client.apiToken` without throwing
 *     (Sprint 3.11 §P1-1 throw guard removed).
 *   - The fail-closed semantic from ADR-011 §A2.4 is preserved — a
 *     `can()` call against an unreachable endpoint still returns `false`
 *     (no rethrow, no fail-OPEN).
 *
 * No live OpenFGA needed — uses an unreachable endpoint
 * (`http://127.0.0.1:1`) to provoke the catch path.
 */
import { describe, it, expect } from 'vitest';

import { OpenFgaPermissionGate } from '../src/infrastructure/openfga-permission.gate';

describe('OpenFgaPermissionGate — apiToken acceptance (Wave 6.2 / RFC-003 Edge 2)', () => {
  it('constructor does not throw when client.apiToken is provided', () => {
    expect(
      () =>
        new OpenFgaPermissionGate({
          logger: { warn: () => {}, error: () => {} },
          client: {
            apiUrl: 'http://127.0.0.1:1',
            storeId: 'store-x',
            apiToken: 'secret-bearer-123',
          },
        }),
    ).not.toThrow();
  });

  it('fail-closed semantic preserved: can() returns false when OpenFGA is unreachable', async () => {
    // Reset singleton so this test isn't influenced by other suites.
    const mod = await import('@gertsai/auth-openfga');
    mod.resetFgaClient();
    mod.resetPermissionCache();
    try {
      const gate = new OpenFgaPermissionGate({
        logger: { warn: () => {}, error: () => {} },
        client: {
          apiUrl: 'http://127.0.0.1:1',
          storeId: 'unused',
          apiToken: 'secret-bearer-123',
        },
      });
      const allowed = await gate.can('user:123', 'search', 'document:doc-1');
      expect(allowed).toBe(false);
    } finally {
      mod.resetFgaClient();
      mod.resetPermissionCache();
    }
  }, 15_000);

  it('constructor accepts undefined apiToken (no regression on the unset path)', () => {
    expect(
      () =>
        new OpenFgaPermissionGate({
          logger: { warn: () => {}, error: () => {} },
          client: {
            apiUrl: 'http://127.0.0.1:1',
            storeId: 'store-x',
            // apiToken intentionally omitted
          },
        }),
    ).not.toThrow();
  });

  it('constructor accepts empty-string apiToken (composition layer maps "" → undefined)', () => {
    expect(
      () =>
        new OpenFgaPermissionGate({
          logger: { warn: () => {}, error: () => {} },
          client: {
            apiUrl: 'http://127.0.0.1:1',
            storeId: 'store-x',
            apiToken: '',
          },
        }),
    ).not.toThrow();
  });
});
