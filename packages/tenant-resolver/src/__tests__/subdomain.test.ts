// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { SubdomainStrategy } from '../strategies/subdomain.strategy.js';
import type { HttpRequestLike } from '../strategy.js';

const reqWithHost = (host: string | undefined): HttpRequestLike => ({
  headers: host === undefined ? {} : { host },
});

describe('SubdomainStrategy', () => {
  it('extracts a single-label subdomain (lowercased — DNS is case-insensitive)', async () => {
    const s = new SubdomainStrategy({ baseDomain: 'gertsai.dev' });
    await expect(s.resolve(reqWithHost('tenantA.gertsai.dev'))).resolves.toEqual({
      tenantId: 'tenanta',
      strategyName: 'subdomain',
    });
  });

  it('strips :port from host before matching', async () => {
    const s = new SubdomainStrategy({ baseDomain: 'gertsai.dev' });
    await expect(s.resolve(reqWithHost('tenanta.gertsai.dev:3000'))).resolves.toEqual({
      tenantId: 'tenanta',
      strategyName: 'subdomain',
    });
  });

  it('lowercases mixed-case host so case-spoofed cousins normalise to the same tenant', async () => {
    const s = new SubdomainStrategy({ baseDomain: 'gertsai.dev' });
    await expect(s.resolve(reqWithHost('TenantB.GERTSAI.dev'))).resolves.toEqual({
      tenantId: 'tenantb',
      strategyName: 'subdomain',
    });
  });

  it('returns null on apex domain (no subdomain)', async () => {
    const s = new SubdomainStrategy({ baseDomain: 'gertsai.dev' });
    await expect(s.resolve(reqWithHost('gertsai.dev'))).resolves.toBeNull();
  });

  it('returns null when host header missing', async () => {
    const s = new SubdomainStrategy({ baseDomain: 'gertsai.dev' });
    await expect(s.resolve(reqWithHost(undefined))).resolves.toBeNull();
  });

  it('returns null on IPv4 literal host', async () => {
    const s = new SubdomainStrategy({ baseDomain: 'gertsai.dev' });
    await expect(s.resolve(reqWithHost('10.0.0.5'))).resolves.toBeNull();
  });

  it('returns null on IPv6 literal host (bracketed)', async () => {
    const s = new SubdomainStrategy({ baseDomain: 'gertsai.dev' });
    await expect(s.resolve(reqWithHost('[2001:db8::1]'))).resolves.toBeNull();
  });

  it('takes the left-most label as tenant on multi-label subdomain', async () => {
    const s = new SubdomainStrategy({ baseDomain: 'gertsai.dev' });
    await expect(s.resolve(reqWithHost('staging.tenantA.gertsai.dev'))).resolves.toEqual({
      tenantId: 'staging',
      strategyName: 'subdomain',
    });
  });

  it('returns null when the leading label fails the strict label regex', async () => {
    const s = new SubdomainStrategy({ baseDomain: 'gertsai.dev' });
    // Hyphen at start is an invalid DNS label.
    await expect(s.resolve(reqWithHost('-bad.gertsai.dev'))).resolves.toBeNull();
  });

  it('honours allowedHosts whitelist', async () => {
    const s = new SubdomainStrategy({
      baseDomain: 'gertsai.dev',
      allowedHosts: ['tenanta.gertsai.dev'],
    });
    await expect(s.resolve(reqWithHost('tenantA.gertsai.dev'))).resolves.toEqual({
      tenantId: 'tenanta',
      strategyName: 'subdomain',
    });
    await expect(s.resolve(reqWithHost('tenantB.gertsai.dev'))).resolves.toBeNull();
  });

  it('throws when baseDomain is empty', () => {
    expect(() => new SubdomainStrategy({ baseDomain: '   ' })).toThrow(/non-empty baseDomain/);
  });
});
