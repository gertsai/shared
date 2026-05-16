/**
 * @fileoverview Wave 12.D-fix (PRD-036 FR-009) — Vault provider rejects
 * cleartext `http://` addresses unless the host is a loopback (dev only).
 *
 * The `X-Vault-Token` header carries the auth secret on every request;
 * over HTTP it is trivially intercepted. Fail-closed at construction so
 * the misconfiguration surfaces before the first RPC.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { VaultProvider, HSMError, HSMErrorCodes } from '../src/index.js';
import type { VaultConfig } from '../src/types.js';

function baseConfig(overrides: Partial<VaultConfig> = {}): VaultConfig {
  return {
    provider: 'vault',
    enabled: true,
    address: 'https://vault.example.com',
    authMethod: 'token',
    token: 'dev-root-token',
    transitMount: 'transit',
    keyName: 'gerts-ce-key',
    timeoutMs: 5000,
    retryAttempts: 3,
    retryDelayMs: 1000,
    fallbackMode: 'error',
    ...overrides,
  };
}

describe('VaultProvider — address validation (FR-009)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('accepts https:// addresses', () => {
    expect(() => new VaultProvider(baseConfig({ address: 'https://vault.prod' }))).not.toThrow();
  });

  it('rejects http:// for non-loopback hosts with CONFIG_ERROR', () => {
    let caught: HSMError | undefined;
    try {
      new VaultProvider(baseConfig({ address: 'http://prod-vault.example.com' }));
    } catch (err) {
      caught = err as HSMError;
    }
    expect(caught).toBeInstanceOf(HSMError);
    expect(caught!.code).toBe(HSMErrorCodes.CONFIG_ERROR);
    expect(caught!.message).toMatch(/Cleartext token transmission rejected/);
  });

  it('rejects http:// for arbitrary external host even on dev-looking port', () => {
    expect(
      () => new VaultProvider(baseConfig({ address: 'http://10.0.0.5:8200' })),
    ).toThrowError(/Cleartext token transmission rejected/);
  });

  it('permits http://localhost (loopback dev exemption) with warning', () => {
    expect(
      () => new VaultProvider(baseConfig({ address: 'http://localhost:8200' })),
    ).not.toThrow();
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringMatching(/token transmitted cleartext/),
    );
  });

  it('permits http://127.0.0.1 (loopback dev exemption)', () => {
    expect(
      () => new VaultProvider(baseConfig({ address: 'http://127.0.0.1:8200' })),
    ).not.toThrow();
  });

  it('permits http://[::1] (IPv6 loopback dev exemption)', () => {
    expect(
      () => new VaultProvider(baseConfig({ address: 'http://[::1]:8200' })),
    ).not.toThrow();
  });

  it('rejects malformed URLs with CONFIG_ERROR', () => {
    let caught: HSMError | undefined;
    try {
      new VaultProvider(baseConfig({ address: 'not a url' }));
    } catch (err) {
      caught = err as HSMError;
    }
    expect(caught).toBeInstanceOf(HSMError);
    expect(caught!.code).toBe(HSMErrorCodes.CONFIG_ERROR);
  });
});
