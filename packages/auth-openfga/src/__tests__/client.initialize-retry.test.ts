/**
 * Wave 12.D-fix (PRD-036 FR-022) — `initialize()` clears the cached
 * `initPromise` on failure so subsequent retries can succeed.
 *
 * Before the fix, a single failed discovery (network blip, OpenFGA cold
 * start) caused every future `initialize()` call to await the rejected
 * promise and re-throw the same error, masking transients as permanent
 * failures. After the fix, retries re-enter `doInitialize()` cleanly.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

let failOnce = false;

vi.mock('@openfga/sdk', async () => {
  const actual = await vi.importActual<typeof import('@openfga/sdk')>('@openfga/sdk');
  return {
    ...actual,
    OpenFgaClient: vi.fn().mockImplementation(() => ({
      listStores: vi.fn().mockImplementation(async () => {
        if (failOnce) {
          failOnce = false;
          throw new Error('transient: OpenFGA cold start');
        }
        return { stores: [{ id: 'store-x', name: 'gerts.ai' }] };
      }),
      readAuthorizationModels: vi.fn().mockResolvedValue({
        authorization_models: [{ id: 'model-x' }],
      }),
      createStore: vi.fn().mockResolvedValue({ id: 'store-x' }),
    })),
  };
});

import { GertsFgaClient } from '../client.js';

beforeEach(() => {
  failOnce = false;
});

describe('GertsFgaClient.initialize — retry-after-failure (FR-022)', () => {
  it('clears initPromise on failure so the next call can succeed', async () => {
    failOnce = true;

    const client = new GertsFgaClient({ apiUrl: 'http://localhost:8080' });

    // First call: transient failure surfaces as a rejection.
    await expect(client.initialize()).rejects.toThrow('transient: OpenFGA cold start');

    // Second call: must NOT inherit the rejected promise — it should
    // re-enter doInitialize() and succeed because `failOnce` consumed
    // its one-shot.
    const resolved = await client.initialize();
    expect(resolved.apiUrl).toBe('http://localhost:8080');
    expect(resolved.storeId).toBe('store-x');
  });

  it('coalesces concurrent initialize() calls on the happy path (no double-init)', async () => {
    const client = new GertsFgaClient({ apiUrl: 'http://localhost:8080' });
    const [a, b] = await Promise.all([client.initialize(), client.initialize()]);
    expect(a).toBe(b);
  });
});
