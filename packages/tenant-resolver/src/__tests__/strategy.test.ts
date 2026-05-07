// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import type {
  HttpRequestLike,
  TenantResolution,
  TenantResolverStrategy,
} from '../strategy.js';

describe('TenantResolverStrategy interface', () => {
  it('admits inline duck-typed strategy implementations', async () => {
    const inline: TenantResolverStrategy<{ id: string | null }> = {
      name: 'inline',
      async resolve(source) {
        if (source.id === null) return null;
        return { tenantId: source.id, strategyName: this.name };
      },
    };
    expect(inline.name).toBe('inline');
    await expect(inline.resolve({ id: null })).resolves.toBeNull();
    const expected: TenantResolution = { tenantId: 'abc', strategyName: 'inline' };
    await expect(inline.resolve({ id: 'abc' })).resolves.toEqual(expected);
  });

  it('HttpRequestLike accepts headers as case-mixed object', () => {
    const req: HttpRequestLike = {
      headers: { 'X-Tenant-ID': 'foo', host: 'bar.example.com' },
      url: '/x',
      method: 'GET',
    };
    expect(req.headers['X-Tenant-ID']).toBe('foo');
  });
});
