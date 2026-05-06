// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { HeaderStrategy } from '../strategies/header.strategy.js';
import type { HttpRequestLike } from '../strategy.js';

const req = (headers: Record<string, string | string[] | undefined>): HttpRequestLike => ({
  headers,
});

describe('HeaderStrategy', () => {
  it('reads exact-case header verbatim', async () => {
    const s = new HeaderStrategy({ headerName: 'X-Tenant-ID', trustProxy: true });
    await expect(s.resolve(req({ 'X-Tenant-ID': 'tA' }))).resolves.toEqual({
      tenantId: 'tA',
      strategyName: 'header',
    });
  });

  it('reads header case-insensitively (Node lowercases incoming)', async () => {
    const s = new HeaderStrategy({ headerName: 'X-Tenant-ID', trustProxy: true });
    await expect(s.resolve(req({ 'x-tenant-id': 'tB' }))).resolves.toEqual({
      tenantId: 'tB',
      strategyName: 'header',
    });
  });

  it('trims surrounding whitespace from header values', async () => {
    const s = new HeaderStrategy({ headerName: 'X-Tenant-ID', trustProxy: true });
    await expect(s.resolve(req({ 'x-tenant-id': '  tC  ' }))).resolves.toEqual({
      tenantId: 'tC',
      strategyName: 'header',
    });
  });

  it('returns null on empty / whitespace-only / missing values', async () => {
    const s = new HeaderStrategy({ headerName: 'X-Tenant-ID', trustProxy: true });
    await expect(s.resolve(req({}))).resolves.toBeNull();
    await expect(s.resolve(req({ 'x-tenant-id': '' }))).resolves.toBeNull();
    await expect(s.resolve(req({ 'x-tenant-id': '   ' }))).resolves.toBeNull();
  });

  it('handles array-valued headers by taking the first element', async () => {
    const s = new HeaderStrategy({ headerName: 'X-Tenant-ID', trustProxy: true });
    await expect(s.resolve(req({ 'x-tenant-id': ['tD', 'tE'] }))).resolves.toEqual({
      tenantId: 'tD',
      strategyName: 'header',
    });
  });
});
