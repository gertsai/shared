// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { SubdomainStrategy } from '../strategies/subdomain.strategy.js';
import type { HttpRequestLike } from '../strategy.js';

const reqWithHost = (host: string): HttpRequestLike => ({ headers: { host } });

describe('SubdomainStrategy strict suffix matching (security P1-2)', () => {
  it('rejects an attacker-crafted host that contains baseDomain in the middle', async () => {
    const s = new SubdomainStrategy({ baseDomain: 'gertsai.dev' });
    // host ends with .attacker.com, NOT .gertsai.dev — should be rejected.
    await expect(
      s.resolve(reqWithHost('attacker.evil.gertsai.dev.attacker.com')),
    ).resolves.toBeNull();
  });

  it('rejects hosts that end with baseDomain as substring but not as labelled suffix', async () => {
    const s = new SubdomainStrategy({ baseDomain: 'gertsai.dev' });
    // 'fakegertsai.dev' has 'gertsai.dev' as substring but the boundary
    // is in the middle of a label — must NOT match.
    await expect(s.resolve(reqWithHost('tenantA.fakegertsai.dev'))).resolves.toBeNull();
  });

  it('accepts the strict labelled suffix with leading dot', async () => {
    const s = new SubdomainStrategy({ baseDomain: 'gertsai.dev' });
    await expect(s.resolve(reqWithHost('legit.gertsai.dev'))).resolves.toEqual({
      tenantId: 'legit',
      strategyName: 'subdomain',
    });
  });
});
