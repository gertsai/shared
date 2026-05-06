// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { ChainTenantResolver } from '../chain-resolver.js';
import { UnauthorizedError } from '@gertsai/errors';
import type { TenantResolverStrategy } from '../strategy.js';

const nullStrategy = (name: string): TenantResolverStrategy<unknown> => ({
  name,
  async resolve() {
    return null;
  },
});

const hit = (name: string, tenantId: string): TenantResolverStrategy<unknown> => ({
  name,
  async resolve() {
    return { tenantId, strategyName: name };
  },
});

describe('ChainTenantResolver strict mode (Amendment 1.2.6 / I-18)', () => {
  it('strict is the default mode — fail-closed when chain exhausts', async () => {
    const chain = new ChainTenantResolver<unknown>([nullStrategy('a'), nullStrategy('b')]);
    await expect(chain.resolve({})).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("strict-mode UnauthorizedError details lists each constituent strategy by name", async () => {
    const chain = new ChainTenantResolver<unknown>(
      [nullStrategy('header'), nullStrategy('subdomain'), nullStrategy('path')],
      { mode: 'strict' },
    );
    try {
      await chain.resolve({});
      expect.fail('expected UnauthorizedError');
    } catch (err) {
      expect(err).toBeInstanceOf(UnauthorizedError);
      const ue = err as UnauthorizedError;
      expect(ue.message).toContain('header');
      expect(ue.message).toContain('subdomain');
      expect(ue.message).toContain('path');
      expect(ue.details.reason).toContain('chain');
      expect(ue.details.reason).toContain('header');
    }
  });

  it('strict mode does NOT throw when a strategy resolves', async () => {
    const chain = new ChainTenantResolver<unknown>(
      [nullStrategy('a'), hit('b', 'tb'), nullStrategy('c')],
      { mode: 'strict' },
    );
    const resolution = await chain.resolve({});
    expect(resolution).toEqual({ tenantId: 'tb', strategyName: 'b' });
  });

  it('optional mode preserves null-on-exhaust semantics', async () => {
    const chain = new ChainTenantResolver<unknown>(
      [nullStrategy('a'), nullStrategy('b')],
      { mode: 'optional' },
    );
    await expect(chain.resolve({})).resolves.toBeNull();
  });
});
