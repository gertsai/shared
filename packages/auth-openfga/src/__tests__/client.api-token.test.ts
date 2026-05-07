/**
 * Wave 6.2 / RFC-003 Edge 1 — apiToken plumbing unit test.
 *
 * Mocks `@openfga/sdk` `OpenFgaClient` constructor and asserts:
 *   - When `apiToken` is set on `FgaClientConfig`, every internal
 *     `new OpenFgaClient(...)` call is given
 *     `credentials: { method: ApiToken, config: { token } }`.
 *   - When `apiToken` is absent, `credentials` is OMITTED entirely
 *     (preserves backwards-compat invariant I-1 from RFC-003).
 *
 * The test uses `vi.mock` to intercept `OpenFgaClient` construction and
 * record the constructor args without making any network call.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Capture constructor args on each `new OpenFgaClient(...)` call.
const capturedSdkConfigs: Array<Record<string, unknown>> = [];

vi.mock('@openfga/sdk', async () => {
  const actual = await vi.importActual<typeof import('@openfga/sdk')>('@openfga/sdk');
  return {
    ...actual,
    OpenFgaClient: vi.fn().mockImplementation((config: Record<string, unknown>) => {
      capturedSdkConfigs.push(config);
      return {
        // Stub the discovery methods doInitialize() awaits — return shapes
        // matching what the real SDK would return so the code path proceeds
        // to the FINAL `new OpenFgaClient(...)` call (which is the most
        // important credentials check).
        listStores: vi.fn().mockResolvedValue({ stores: [{ id: 'store-x', name: 'gerts.ai' }] }),
        readAuthorizationModels: vi.fn().mockResolvedValue({
          authorization_models: [{ id: 'model-x' }],
        }),
        createStore: vi.fn().mockResolvedValue({ id: 'store-x' }),
      };
    }),
  };
});

import { CredentialsMethod } from '@openfga/sdk';
import { GertsFgaClient } from '../client.js';

beforeEach(() => {
  capturedSdkConfigs.length = 0;
});

describe('GertsFgaClient — apiToken plumbing (Wave 6.2 / RFC-003 Edge 1)', () => {
  it('passes credentials.method=ApiToken and config.token to every internal SDK client when apiToken is set', async () => {
    const client = new GertsFgaClient({
      apiUrl: 'http://localhost:8080',
      storeId: 'store-x',
      apiToken: 'secret-bearer-123',
    });

    await client.initialize();

    // doInitialize creates 3 SDK clients (discovery, post-storeId,
    // post-model). All three MUST receive the same credentials.
    expect(capturedSdkConfigs.length).toBeGreaterThanOrEqual(2);
    for (const cfg of capturedSdkConfigs) {
      expect(cfg.apiUrl).toBe('http://localhost:8080');
      expect(cfg.credentials).toEqual({
        method: CredentialsMethod.ApiToken,
        config: { token: 'secret-bearer-123' },
      });
    }
  });

  it('omits credentials entirely when apiToken is unset (backwards compat, RFC-003 I-1)', async () => {
    const client = new GertsFgaClient({
      apiUrl: 'http://localhost:8080',
      storeId: 'store-x',
    });

    await client.initialize();

    expect(capturedSdkConfigs.length).toBeGreaterThanOrEqual(2);
    for (const cfg of capturedSdkConfigs) {
      expect(cfg.apiUrl).toBe('http://localhost:8080');
      expect(cfg.credentials).toBeUndefined();
    }
  });

  it('echoes apiToken on resolvedConfig so callers can confirm acceptance', async () => {
    const client = new GertsFgaClient({
      apiUrl: 'http://localhost:8080',
      storeId: 'store-x',
      apiToken: 'echo-test',
    });

    const resolved = await client.initialize();

    expect(resolved.apiToken).toBe('echo-test');
  });

  it('does not log the token at construction (smoke check on console.log)', () => {
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    new GertsFgaClient({
      apiUrl: 'http://localhost:8080',
      apiToken: 'do-not-log-me',
    });

    const allArgs = [
      ...consoleLog.mock.calls.flat(),
      ...consoleError.mock.calls.flat(),
      ...consoleWarn.mock.calls.flat(),
    ];
    for (const arg of allArgs) {
      expect(typeof arg === 'string' ? arg : JSON.stringify(arg)).not.toContain('do-not-log-me');
    }

    consoleLog.mockRestore();
    consoleError.mockRestore();
    consoleWarn.mockRestore();
  });
});
