// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { PathStrategy } from '../strategies/path.strategy.js';
import type { HttpRequestLike } from '../strategy.js';

const reqWithUrl = (url: string): HttpRequestLike => ({ headers: {}, url });

describe('PathStrategy adversarial: traversal & injection (security P1-1)', () => {
  it('rejects %2F injection inside tenantId', async () => {
    const s = new PathStrategy({ pathPattern: '/t/:tenantId/...' });
    await expect(s.resolve(reqWithUrl('/t/foo%2F..%2Fvictim/projects/1'))).resolves.toBeNull();
  });

  it('rejects literal `..` segments before tenantId', async () => {
    const s = new PathStrategy({ pathPattern: '/t/:tenantId/...' });
    await expect(s.resolve(reqWithUrl('/t/../victim/projects/1'))).resolves.toBeNull();
  });

  it('rejects `.` segments inside the URL', async () => {
    const s = new PathStrategy({ pathPattern: '/t/:tenantId/...' });
    await expect(s.resolve(reqWithUrl('/t/./tenantA/x'))).resolves.toBeNull();
  });

  it('rejects double-encoded traversal (%252e%252e)', async () => {
    const s = new PathStrategy({ pathPattern: '/t/:tenantId/...' });
    // After ONE pass of decoding, `%252e%252e` becomes `%2e%2e` which still
    // contains `%` and is rejected by the post-match guard.
    await expect(s.resolve(reqWithUrl('/t/%252e%252e/x'))).resolves.toBeNull();
  });

  it('rejects NUL byte inside tenantId', async () => {
    const s = new PathStrategy({ pathPattern: '/t/:tenantId/...' });
    await expect(s.resolve(reqWithUrl('/t/foo%00bar/x'))).resolves.toBeNull();
  });

  it('rejects non-printable / control characters inside tenantId', async () => {
    const s = new PathStrategy({ pathPattern: '/t/:tenantId/...' });
    await expect(s.resolve(reqWithUrl('/t/foo%01bar/x'))).resolves.toBeNull();
  });

  it('rejects malformed percent-encodings safely (no throw)', async () => {
    const s = new PathStrategy({ pathPattern: '/t/:tenantId/...' });
    await expect(s.resolve(reqWithUrl('/t/%E0%A4%A/x'))).resolves.toBeNull();
  });
});
