// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { PathStrategy } from '../strategies/path.strategy.js';
import type { HttpRequestLike } from '../strategy.js';

const reqWithUrl = (url: string | undefined): HttpRequestLike => ({
  headers: {},
  ...(url !== undefined && { url }),
});

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

  it('does not collide with a literal "___WILDCARD___" in user patterns (EVID-080 M6)', async () => {
    // Wave 26: the wildcard transform sentinel was changed from the printable
    // string `___WILDCARD___` to a non-printable token. This test asserts the
    // old sentinel string is treated literally — the regex MUST require the
    // path to contain `___WILDCARD___` between the tenant and `___WILDCARD___`
    // segment, and the trailing `...` must still expand to `.*` independently.
    const s = new PathStrategy({
      pathPattern: '/t/:tenantId/___WILDCARD___/...',
    });
    // Path containing the literal `___WILDCARD___` segment matches.
    await expect(
      s.resolve(reqWithUrl('/t/tenantA/___WILDCARD___/anything/here')),
    ).resolves.toEqual({ tenantId: 'tenantA', strategyName: 'path' });
    // Path NOT containing it must NOT match (proves the sentinel is treated
    // literally rather than collapsed to `.*` by sentinel collision).
    await expect(
      s.resolve(reqWithUrl('/t/tenantA/something-else/anything')),
    ).resolves.toBeNull();
  });
});
