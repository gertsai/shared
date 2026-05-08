// SPDX-License-Identifier: Apache-2.0
/**
 * Wave 6.3 / RFC-004 Edge 2 — m9s gate multi-instance test.
 *
 * Verifies:
 *   - Two `OpenFgaPermissionGate` instances with different `storeId`
 *     pre-warm DIFFERENT cached SDK clients via fingerprint scope.
 *   - Same config in both gates → same cached SDK client (no
 *     duplication at the upstream cache).
 *   - Different `apiToken` → different cached clients.
 *
 * Uses the Wave 6.3 multi-instance Map directly (no live OpenFGA
 * needed — purely tests the upstream pre-warm + scoping behaviour).
 */
import { describe, it, expect, beforeEach } from 'vitest';

import { OpenFgaPermissionGate } from '../src/infrastructure/openfga-permission.gate';

describe('OpenFgaPermissionGate — multi-instance scoping (Wave 6.3 / RFC-004 Edge 2)', () => {
  beforeEach(async () => {
    const mod = await import('@gertsai/auth-openfga');
    mod.resetFgaClient();
    mod.resetPermissionCache();
  });

  it('different storeId → different cached upstream clients', async () => {
    const mod = await import('@gertsai/auth-openfga');

    const acmeGate = new OpenFgaPermissionGate({
      logger: { warn: () => {}, error: () => {} },
      client: {
        apiUrl: 'http://127.0.0.1:1',
        storeId: 'store-acme',
      },
    });
    const bravoGate = new OpenFgaPermissionGate({
      logger: { warn: () => {}, error: () => {} },
      client: {
        apiUrl: 'http://127.0.0.1:1',
        storeId: 'store-bravo',
      },
    });

    // Trigger the gate's lazy upstream pre-warm (can() will fail-closed
    // because endpoint is unreachable, but pre-warm runs first).
    await acmeGate.can('user:1', 'search', 'document:doc-acme');
    await bravoGate.can('user:1', 'search', 'document:doc-bravo');

    const acmeClient = mod.getFgaClient({
      apiUrl: 'http://127.0.0.1:1',
      storeId: 'store-acme',
    });
    const bravoClient = mod.getFgaClient({
      apiUrl: 'http://127.0.0.1:1',
      storeId: 'store-bravo',
    });
    expect(acmeClient).not.toBe(bravoClient);
  }, 15_000);

  it('same config in two gates → same cached upstream client', async () => {
    const mod = await import('@gertsai/auth-openfga');

    const config = { apiUrl: 'http://127.0.0.1:1', storeId: 'store-shared' };

    const gateA = new OpenFgaPermissionGate({
      logger: { warn: () => {}, error: () => {} },
      client: config,
    });
    const gateB = new OpenFgaPermissionGate({
      logger: { warn: () => {}, error: () => {} },
      client: config,
    });

    await gateA.can('user:1', 'search', 'document:doc-1');
    await gateB.can('user:1', 'search', 'document:doc-1');

    const clientA = mod.getFgaClient(config);
    const clientB = mod.getFgaClient(config);
    expect(clientA).toBe(clientB);
  }, 15_000);

  it('different apiToken → different cached upstream clients (token in fingerprint)', async () => {
    const mod = await import('@gertsai/auth-openfga');

    const base = { apiUrl: 'http://127.0.0.1:1', storeId: 'store-shared' };

    const gateA = new OpenFgaPermissionGate({
      logger: { warn: () => {}, error: () => {} },
      client: { ...base, apiToken: 'token-a' },
    });
    const gateB = new OpenFgaPermissionGate({
      logger: { warn: () => {}, error: () => {} },
      client: { ...base, apiToken: 'token-b' },
    });

    await gateA.can('user:1', 'search', 'document:doc-1');
    await gateB.can('user:1', 'search', 'document:doc-1');

    const clientA = mod.getFgaClient({ ...base, apiToken: 'token-a' });
    const clientB = mod.getFgaClient({ ...base, apiToken: 'token-b' });
    expect(clientA).not.toBe(clientB);
  }, 15_000);

  it('cacheScope is the fingerprint — distinct gates get distinct caches', async () => {
    const mod = await import('@gertsai/auth-openfga');

    const acmeFp = mod.fingerprint({
      apiUrl: 'http://127.0.0.1:1',
      storeId: 'store-acme',
    });
    const bravoFp = mod.fingerprint({
      apiUrl: 'http://127.0.0.1:1',
      storeId: 'store-bravo',
    });
    expect(acmeFp).not.toBe(bravoFp);

    const acmeCache = mod.getPermissionCache(undefined, acmeFp);
    const bravoCache = mod.getPermissionCache(undefined, bravoFp);
    expect(acmeCache).not.toBe(bravoCache);
  });
});
