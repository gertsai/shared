/**
 * Wave 6.3 / RFC-004 Edge 1.6 — multi-instance scoping unit tests.
 *
 * Verifies the ADR-012 invariants on `getFgaClient`/`createFgaClient`/
 * `resetFgaClient` after the singleton-to-Map refactor.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@openfga/sdk', async () => {
  const actual = await vi.importActual<typeof import('@openfga/sdk')>('@openfga/sdk');
  return {
    ...actual,
    OpenFgaClient: vi.fn().mockImplementation(() => ({
      listStores: vi.fn().mockResolvedValue({ stores: [{ id: 'store-x', name: 'gerts.ai' }] }),
      readAuthorizationModels: vi.fn().mockResolvedValue({
        authorization_models: [{ id: 'model-x' }],
      }),
      createStore: vi.fn().mockResolvedValue({ id: 'store-x' }),
    })),
  };
});

import {
  GertsFgaClient,
  getFgaClient,
  createFgaClient,
  resetFgaClient,
  fingerprint,
  DEFAULT_FINGERPRINT,
} from '../index.js';

beforeEach(() => {
  resetFgaClient();
});

describe('Wave 6.3 — multi-instance client cache (RFC-004 Edge 1.6)', () => {
  it('I-1 back-compat: same config returns the same cached instance', () => {
    const c = { apiUrl: 'http://localhost:8080', storeId: 's1' };
    const a = getFgaClient(c);
    const b = getFgaClient(c);
    expect(a).toBe(b);
  });

  it('I-1 back-compat: no-arg form resolves to a stable __default__ slot', () => {
    const a = getFgaClient();
    const b = getFgaClient();
    expect(a).toBe(b);
  });

  it('multi-instance: different apiUrl → different instances', () => {
    const a = getFgaClient({ apiUrl: 'http://host-a:8080', storeId: 's' });
    const b = getFgaClient({ apiUrl: 'http://host-b:8080', storeId: 's' });
    expect(a).not.toBe(b);
  });

  it('multi-instance: different storeId → different instances', () => {
    const a = getFgaClient({ apiUrl: 'http://localhost:8080', storeId: 's1' });
    const b = getFgaClient({ apiUrl: 'http://localhost:8080', storeId: 's2' });
    expect(a).not.toBe(b);
  });

  it('multi-instance: different apiToken → different instances', () => {
    const base = { apiUrl: 'http://localhost:8080', storeId: 's' };
    const a = getFgaClient({ ...base, apiToken: 'token-a' });
    const b = getFgaClient({ ...base, apiToken: 'token-b' });
    expect(a).not.toBe(b);
  });

  it('determinism (ADR-012 I-3): different property order, same values → same instance', () => {
    const a = getFgaClient({ apiUrl: 'http://x', storeId: 's', apiToken: 't' });
    // Different literal property order — TypeScript permits this; we want
    // the same instance back regardless.
    const b = getFgaClient({ apiToken: 't', storeId: 's', apiUrl: 'http://x' });
    expect(a).toBe(b);
  });

  it('createFgaClient always returns a fresh non-cached instance', () => {
    const c = { apiUrl: 'http://localhost:8080', storeId: 's' };
    const cached = getFgaClient(c);
    const fresh1 = createFgaClient(c);
    const fresh2 = createFgaClient(c);
    expect(fresh1).toBeInstanceOf(GertsFgaClient);
    expect(fresh1).not.toBe(cached);
    expect(fresh1).not.toBe(fresh2);
  });

  it('resetFgaClient(config) deletes ONE instance; others remain', () => {
    const c1 = { apiUrl: 'http://h1', storeId: 's' };
    const c2 = { apiUrl: 'http://h2', storeId: 's' };
    const a = getFgaClient(c1);
    const b = getFgaClient(c2);
    resetFgaClient(c1);
    const a2 = getFgaClient(c1);
    const b2 = getFgaClient(c2);
    expect(a2).not.toBe(a); // re-created
    expect(b2).toBe(b); // untouched
  });

  it('resetFgaClient() (no arg) clears ALL — back-compat (ADR-012 I-5)', () => {
    const c1 = { apiUrl: 'http://h1', storeId: 's' };
    const c2 = { apiUrl: 'http://h2', storeId: 's' };
    const a = getFgaClient(c1);
    const b = getFgaClient(c2);
    resetFgaClient();
    expect(getFgaClient(c1)).not.toBe(a);
    expect(getFgaClient(c2)).not.toBe(b);
  });

  it('I-2 token confidentiality: apiToken does not appear in fingerprint key', () => {
    const TOKEN = 'super-secret-bearer-do-not-leak';
    const fp = fingerprint({ apiUrl: 'http://x', storeId: 's', apiToken: TOKEN });
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
    expect(fp).not.toContain(TOKEN);
  });

  it('fingerprint(): no-config path returns DEFAULT_FINGERPRINT', () => {
    expect(fingerprint()).toBe(DEFAULT_FINGERPRINT);
    expect(fingerprint(undefined)).toBe(DEFAULT_FINGERPRINT);
  });

  it('async safety: concurrent getFgaClient(sameConfig) returns ONE instance', async () => {
    const c = { apiUrl: 'http://localhost:8080', storeId: 's' };
    const [a, b, d] = await Promise.all([
      Promise.resolve(getFgaClient(c)),
      Promise.resolve(getFgaClient(c)),
      Promise.resolve(getFgaClient(c)),
    ]);
    expect(a).toBe(b);
    expect(b).toBe(d);
  });
});
