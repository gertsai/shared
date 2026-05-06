// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { nodeHttpAdapter } from '../http/index.js';
import { HeaderStrategy } from '../strategies/header.strategy.js';

describe('nodeHttpAdapter', () => {
  it('adapts a Node IncomingMessage-like into HttpRequestLike preserving headers / url / method', () => {
    const fakeReq = {
      headers: { 'x-tenant-id': 'tA', host: 'foo.example.com' },
      url: '/x',
      method: 'GET',
    };
    const adapted = nodeHttpAdapter(fakeReq as unknown as Parameters<typeof nodeHttpAdapter>[0]);
    expect(adapted.headers).toEqual({ 'x-tenant-id': 'tA', host: 'foo.example.com' });
    expect(adapted.url).toBe('/x');
    expect(adapted.method).toBe('GET');
  });

  it('integrates with HeaderStrategy end-to-end', async () => {
    const fakeReq = { headers: { 'x-tenant-id': 'tB' }, url: '/api', method: 'POST' };
    const adapted = nodeHttpAdapter(fakeReq as unknown as Parameters<typeof nodeHttpAdapter>[0]);
    const strategy = new HeaderStrategy({ headerName: 'X-Tenant-ID', trustProxy: true });
    await expect(strategy.resolve(adapted)).resolves.toEqual({
      tenantId: 'tB',
      strategyName: 'header',
    });
  });
});
