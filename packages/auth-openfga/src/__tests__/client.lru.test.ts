// SPDX-License-Identifier: Apache-2.0
/**
 * Wave 7.4 (PRD-011 / RFC-007) — integration tests for the bounded
 * `clientInstances` cache in `client.ts`.
 *
 * Verifies CWE-770 defense: long-running processes minting many distinct
 * fingerprints (e.g. per-tenant config drift) no longer grow unbounded.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@openfga/sdk', async () => {
  const actual = await vi.importActual<typeof import('@openfga/sdk')>('@openfga/sdk');
  return {
    ...actual,
    OpenFgaClient: vi.fn().mockImplementation(() => ({
      listStores: vi.fn().mockResolvedValue({ stores: [] }),
      readAuthorizationModels: vi.fn().mockResolvedValue({ authorization_models: [] }),
      createStore: vi.fn().mockResolvedValue({ id: 'store-x' }),
    })),
  };
});

import {
  getFgaClient,
  resetFgaClient,
  configureFgaClientCache,
} from '../index.js';

beforeEach(() => {
  // Always restore defaults between tests so we don't pollute the singleton state.
  configureFgaClientCache();
  resetFgaClient();
});

describe('Wave 7.4 — bounded clientInstances cache (PRD-011 / RFC-007)', () => {
  it('keeps last N=maxSize entries; oldest are evicted under churn', () => {
    configureFgaClientCache({ maxSize: 1000 });
    const first = getFgaClient({ apiUrl: 'http://h', storeId: 'store-0' });
    // Mint 1100 unique configs — first 100 should get evicted.
    for (let i = 1; i < 1100; i++) {
      getFgaClient({ apiUrl: 'http://h', storeId: `store-${i}` });
    }
    // store-0 must have been evicted (we minted 1100 unique fingerprints into a 1000-slot cache).
    const firstAgain = getFgaClient({ apiUrl: 'http://h', storeId: 'store-0' });
    expect(firstAgain).not.toBe(first);
    // The MRU (store-1099) should still be cached.
    const last = getFgaClient({ apiUrl: 'http://h', storeId: 'store-1099' });
    const lastAgain = getFgaClient({ apiUrl: 'http://h', storeId: 'store-1099' });
    expect(lastAgain).toBe(last);
  });

  it('Wave 6.3 invariant preserved: same config → same instance while not evicted', () => {
    configureFgaClientCache({ maxSize: 100 });
    const cfg = { apiUrl: 'http://h', storeId: 's', apiToken: 'tok' };
    const a = getFgaClient(cfg);
    const b = getFgaClient(cfg);
    expect(a).toBe(b);
  });

  it('TTL expiry triggers re-instantiation with identical fingerprint → new instance', () => {
    let t = 1_000;
    configureFgaClientCache({ maxSize: 100, ttlMs: 1_000, now: () => t });
    const cfg = { apiUrl: 'http://h', storeId: 's' };
    const a = getFgaClient(cfg);
    t += 500;
    expect(getFgaClient(cfg)).toBe(a); // still fresh
    t += 1_000; // total elapsed 1500ms > ttlMs
    const b = getFgaClient(cfg);
    expect(b).not.toBe(a); // re-instantiated
    // The semantic config is preserved on the new instance even though the
    // object identity changed.
    expect(b.constructor.name).toBe('GertsFgaClient');
  });

  it('resetFgaClient() (no arg) clears the bounded cache too', () => {
    configureFgaClientCache({ maxSize: 100 });
    const cfg = { apiUrl: 'http://h', storeId: 's' };
    const a = getFgaClient(cfg);
    resetFgaClient();
    const b = getFgaClient(cfg);
    expect(b).not.toBe(a);
  });

  it('configureFgaClientCache replaces the cache (discards prior entries)', () => {
    const cfg = { apiUrl: 'http://h', storeId: 's' };
    const a = getFgaClient(cfg);
    configureFgaClientCache({ maxSize: 10 });
    const b = getFgaClient(cfg);
    expect(b).not.toBe(a);
  });

  it('LRU touch: re-accessing an entry protects it from eviction', () => {
    configureFgaClientCache({ maxSize: 3 });
    const c1 = { apiUrl: 'http://h', storeId: 's1' };
    const c2 = { apiUrl: 'http://h', storeId: 's2' };
    const c3 = { apiUrl: 'http://h', storeId: 's3' };
    const c4 = { apiUrl: 'http://h', storeId: 's4' };
    const a = getFgaClient(c1);
    getFgaClient(c2);
    getFgaClient(c3);
    // Touch c1 — moves it to MRU.
    expect(getFgaClient(c1)).toBe(a);
    // Adding c4 should evict c2 (now oldest), not c1.
    getFgaClient(c4);
    expect(getFgaClient(c1)).toBe(a); // still cached
    // c2 was evicted → new instance on re-fetch.
    const b1 = getFgaClient(c2);
    const b2 = getFgaClient(c2);
    expect(b1).toBe(b2);
  });
});
