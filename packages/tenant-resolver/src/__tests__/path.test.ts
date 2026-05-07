// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { PathStrategy } from '../strategies/path.strategy.js';
import type { HttpRequestLike } from '../strategy.js';

const reqWithUrl = (url: string | undefined): HttpRequestLike => ({ headers: {}, url });

describe('PathStrategy', () => {
  it('extracts tenantId from a basic /t/:tenantId pattern', async () => {
    const s = new PathStrategy({ pathPattern: '/t/:tenantId/...' });
    await expect(s.resolve(reqWithUrl('/t/tenantA/projects/123'))).resolves.toEqual({
      tenantId: 'tenantA',
      strategyName: 'path',
    });
  });

  it('strips query string before matching', async () => {
    const s = new PathStrategy({ pathPattern: '/t/:tenantId/...' });
    await expect(s.resolve(reqWithUrl('/t/tenantA/x?foo=bar'))).resolves.toEqual({
      tenantId: 'tenantA',
      strategyName: 'path',
    });
  });

  it('returns null when url is missing', async () => {
    const s = new PathStrategy({ pathPattern: '/t/:tenantId/...' });
    await expect(s.resolve(reqWithUrl(undefined))).resolves.toBeNull();
  });

  it('returns null when path does not match', async () => {
    const s = new PathStrategy({ pathPattern: '/t/:tenantId/...' });
    await expect(s.resolve(reqWithUrl('/api/foo'))).resolves.toBeNull();
  });

  it('decodes URL-encoded valid tenant identifiers', async () => {
    const s = new PathStrategy({ pathPattern: '/t/:tenantId/...' });
    await expect(s.resolve(reqWithUrl('/t/tenant%20A/x'))).resolves.toEqual({
      tenantId: 'tenant A',
      strategyName: 'path',
    });
  });

  it('throws when pathPattern lacks :tenantId placeholder', () => {
    expect(() => new PathStrategy({ pathPattern: '/t/foo/...' })).toThrow(/:tenantId/);
  });

  it('throws when pathPattern does not start with /', () => {
    expect(() => new PathStrategy({ pathPattern: 't/:tenantId/...' })).toThrow(/starting with "\/"/);
  });
});
