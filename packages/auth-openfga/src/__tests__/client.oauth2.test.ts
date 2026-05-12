/**
 * Wave 7.5 / RFC-008 — OAuth2 client-credentials plumbing tests.
 *
 * Mocks `@openfga/sdk` `OpenFgaClient` constructor and asserts:
 *   - When `oauth2` is set on `FgaClientConfig`, every internal
 *     `new OpenFgaClient(...)` call is given
 *     `credentials: { method: ClientCredentials, config: { clientId, clientSecret, apiTokenIssuer, apiAudience } }`
 *     with the ergonomic → SDK field mapping (`issuer` → `apiTokenIssuer`,
 *     `audience` → `apiAudience`).
 *   - When BOTH `apiToken` and `oauth2` are set, construction throws
 *     `Error('FgaClientConfig: apiToken and oauth2 are mutually exclusive')`.
 *   - Wave 6.2 backwards-compat: `apiToken`-only path still produces
 *     `method: ApiToken`.
 *   - Wave 6.3 backwards-compat: anonymous (neither auth method) still
 *     omits `credentials` entirely.
 *   - Wave 6.3 cache fingerprint: same oauth2 config → same cached
 *     instance; differing `oauth2.audience` → distinct instances.
 *   - SDK does NOT make outbound HTTP at construction (lazy token fetch
 *     contract — verified by checking `global.fetch` was not invoked).
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
import {
  GertsFgaClient,
  getFgaClient,
  resetFgaClient,
} from '../index.js';
import type { FgaOAuth2Config } from '../types.js';

beforeEach(() => {
  capturedSdkConfigs.length = 0;
  resetFgaClient();
});

const OAUTH2_BASE: FgaOAuth2Config = {
  clientId: 'm2m-client-id-abc',
  clientSecret: 'super-secret-do-not-leak',
  issuer: 'https://example.auth0.com',
  audience: 'https://api.us1.fga.dev/',
};

describe('GertsFgaClient — OAuth2 plumbing (Wave 7.5 / RFC-008)', () => {
  it('construction with valid oauth2 config does not throw', () => {
    expect(
      () =>
        new GertsFgaClient({
          apiUrl: 'http://localhost:8080',
          storeId: 'store-x',
          oauth2: OAUTH2_BASE,
        }),
    ).not.toThrow();
  });

  it('passes credentials.method=ClientCredentials with the SDK-mapped fields to every internal SDK client', async () => {
    const client = new GertsFgaClient({
      apiUrl: 'http://localhost:8080',
      storeId: 'store-x',
      oauth2: OAUTH2_BASE,
    });

    await client.initialize();

    // doInitialize creates at least 2 SDK clients (discovery, post-model).
    // ALL must receive the same credentials payload with mapped field names.
    expect(capturedSdkConfigs.length).toBeGreaterThanOrEqual(2);
    for (const cfg of capturedSdkConfigs) {
      expect(cfg.apiUrl).toBe('http://localhost:8080');
      expect(cfg.credentials).toEqual({
        method: CredentialsMethod.ClientCredentials,
        config: {
          clientId: 'm2m-client-id-abc',
          clientSecret: 'super-secret-do-not-leak',
          apiTokenIssuer: 'https://example.auth0.com',
          apiAudience: 'https://api.us1.fga.dev/',
        },
      });
    }
  });

  it('uses the literal SDK enum value (CredentialsMethod.ClientCredentials = "client_credentials"), not a string', async () => {
    const client = new GertsFgaClient({
      apiUrl: 'http://localhost:8080',
      storeId: 'store-x',
      oauth2: OAUTH2_BASE,
    });
    await client.initialize();

    expect(capturedSdkConfigs.length).toBeGreaterThan(0);
    const first = capturedSdkConfigs[0]!;
    const creds = first.credentials as { method: string };
    expect(creds.method).toBe('client_credentials');
    expect(creds.method).toBe(CredentialsMethod.ClientCredentials);
  });

  it('field mapping: ergonomic `issuer` → SDK `apiTokenIssuer`, `audience` → `apiAudience`', async () => {
    const client = new GertsFgaClient({
      apiUrl: 'http://localhost:8080',
      storeId: 'store-x',
      oauth2: {
        clientId: 'cid',
        clientSecret: 'csec',
        issuer: 'https://issuer.example.com',
        audience: 'https://audience.example.com/',
      },
    });
    await client.initialize();

    const first = capturedSdkConfigs[0]!;
    const config = (first.credentials as { config: Record<string, unknown> }).config;
    expect(config.apiTokenIssuer).toBe('https://issuer.example.com');
    expect(config.apiAudience).toBe('https://audience.example.com/');
    expect(config).not.toHaveProperty('issuer');
    expect(config).not.toHaveProperty('audience');
  });

  it('throws when BOTH apiToken and oauth2 are set (mutual exclusivity)', () => {
    expect(
      () =>
        new GertsFgaClient({
          apiUrl: 'http://localhost:8080',
          storeId: 'store-x',
          apiToken: 'preshared-token',
          oauth2: OAUTH2_BASE,
        }),
    ).toThrow('FgaClientConfig: apiToken and oauth2 are mutually exclusive');
  });

  it('throws the exact error message specified by RFC-008', () => {
    expect(
      () =>
        new GertsFgaClient({
          apiToken: 't',
          oauth2: OAUTH2_BASE,
        }),
    ).toThrowError(/^FgaClientConfig: apiToken and oauth2 are mutually exclusive$/);
  });

  it('Wave 6.3 back-compat: neither apiToken nor oauth2 → no credentials key (anonymous)', async () => {
    const client = new GertsFgaClient({
      apiUrl: 'http://localhost:8080',
      storeId: 'store-x',
    });
    await client.initialize();

    expect(capturedSdkConfigs.length).toBeGreaterThanOrEqual(2);
    for (const cfg of capturedSdkConfigs) {
      expect(cfg.credentials).toBeUndefined();
    }
  });

  it('Wave 6.2 back-compat: apiToken-only → credentials.method=ApiToken (unchanged)', async () => {
    const client = new GertsFgaClient({
      apiUrl: 'http://localhost:8080',
      storeId: 'store-x',
      apiToken: 'still-works-bearer',
    });
    await client.initialize();

    expect(capturedSdkConfigs.length).toBeGreaterThanOrEqual(2);
    for (const cfg of capturedSdkConfigs) {
      expect(cfg.credentials).toEqual({
        method: CredentialsMethod.ApiToken,
        config: { token: 'still-works-bearer' },
      });
    }
  });

  it('cache invariant: same oauth2 config + same other fields → same cached instance', () => {
    const cfg = {
      apiUrl: 'http://localhost:8080',
      storeId: 'store-x',
      oauth2: OAUTH2_BASE,
    };
    const a = getFgaClient(cfg);
    const b = getFgaClient(cfg);
    expect(a).toBe(b);
  });

  it('cache invariant: different oauth2.audience → distinct cached instances', () => {
    const base = { apiUrl: 'http://localhost:8080', storeId: 'store-x' };
    const a = getFgaClient({
      ...base,
      oauth2: { ...OAUTH2_BASE, audience: 'https://api-a.example.com/' },
    });
    const b = getFgaClient({
      ...base,
      oauth2: { ...OAUTH2_BASE, audience: 'https://api-b.example.com/' },
    });
    expect(a).not.toBe(b);
  });

  it('cache invariant: different oauth2.clientId → distinct cached instances', () => {
    const base = { apiUrl: 'http://localhost:8080', storeId: 'store-x' };
    const a = getFgaClient({
      ...base,
      oauth2: { ...OAUTH2_BASE, clientId: 'cid-a' },
    });
    const b = getFgaClient({
      ...base,
      oauth2: { ...OAUTH2_BASE, clientId: 'cid-b' },
    });
    expect(a).not.toBe(b);
  });

  it('cache invariant: different oauth2.clientSecret → distinct cached instances (Wave 6.3 I-2 via fingerprint extension)', () => {
    const base = { apiUrl: 'http://localhost:8080', storeId: 'store-x' };
    const a = getFgaClient({
      ...base,
      oauth2: { ...OAUTH2_BASE, clientSecret: 'secret-a' },
    });
    const b = getFgaClient({
      ...base,
      oauth2: { ...OAUTH2_BASE, clientSecret: 'secret-b' },
    });
    expect(a).not.toBe(b);
  });

  it('cache scope isolation: apiToken-keyed and oauth2-keyed configs do not collide', () => {
    const base = { apiUrl: 'http://localhost:8080', storeId: 'store-x' };
    const apiTokenClient = getFgaClient({ ...base, apiToken: 'tok' });
    const oauth2Client = getFgaClient({ ...base, oauth2: OAUTH2_BASE });
    const anonClient = getFgaClient(base);
    expect(apiTokenClient).not.toBe(oauth2Client);
    expect(apiTokenClient).not.toBe(anonClient);
    expect(oauth2Client).not.toBe(anonClient);
  });

  it('SDK does NOT make outbound HTTP at construction (lazy token fetch contract)', () => {
    // Spy on global fetch — SDK's `Credentials` class lazily fetches the
    // access token on first request, NOT at constructor time. If we ever
    // accidentally wired eager-fetch into our wrapper, this would break.
    const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(async () => {
      throw new Error('fetch should not be called at construction time');
    });
    try {
      new GertsFgaClient({
        apiUrl: 'http://localhost:8080',
        storeId: 'store-x',
        oauth2: OAUTH2_BASE,
      });
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('clientSecret is not logged at construction (smoke check on console.*)', () => {
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    new GertsFgaClient({
      apiUrl: 'http://localhost:8080',
      oauth2: {
        clientId: 'cid',
        clientSecret: 'do-not-log-this-oauth2-secret',
        issuer: 'https://i.example.com',
        audience: 'https://a.example.com/',
      },
    });

    const allArgs = [
      ...consoleLog.mock.calls.flat(),
      ...consoleError.mock.calls.flat(),
      ...consoleWarn.mock.calls.flat(),
    ];
    for (const arg of allArgs) {
      expect(typeof arg === 'string' ? arg : JSON.stringify(arg)).not.toContain(
        'do-not-log-this-oauth2-secret',
      );
    }

    consoleLog.mockRestore();
    consoleError.mockRestore();
    consoleWarn.mockRestore();
  });
});
