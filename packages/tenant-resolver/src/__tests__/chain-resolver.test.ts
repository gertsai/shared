// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { ChainTenantResolver } from '../chain-resolver.js';
import type { TenantResolverStrategy } from '../strategy.js';

const fixed = (
  name: string,
  outcome: { tenantId: string } | null,
): TenantResolverStrategy<unknown> => ({
  name,
  async resolve() {
    return outcome === null ? null : { tenantId: outcome.tenantId, strategyName: name };
  },
});

describe('ChainTenantResolver', () => {
  it('returns the first non-null resolution and preserves provenance', async () => {
    const chain = new ChainTenantResolver<unknown>(
      [fixed('a', null), fixed('b', { tenantId: 'tb' }), fixed('c', { tenantId: 'tc' })],
      { mode: 'optional' },
    );
    const resolution = await chain.resolve({});
    expect(resolution).toEqual({ tenantId: 'tb', strategyName: 'b' });
  });

  it("optional mode returns null when every strategy yields null", async () => {
    const chain = new ChainTenantResolver<unknown>([fixed('a', null), fixed('b', null)], {
      mode: 'optional',
    });
    await expect(chain.resolve({})).resolves.toBeNull();
  });

  it('exposes a stable `name` so it can be nested as a strategy', async () => {
    const chain = new ChainTenantResolver<unknown>([], { mode: 'optional' });
    expect(chain.name).toBe('chain');
  });

  it('honours strategy ordering — later strategies are not called once one resolves', async () => {
    let cCalls = 0;
    const c: TenantResolverStrategy<unknown> = {
      name: 'c',
      async resolve() {
        cCalls += 1;
        return { tenantId: 'tc', strategyName: 'c' };
      },
    };
    const chain = new ChainTenantResolver<unknown>(
      [fixed('a', { tenantId: 'ta' }), c],
      { mode: 'optional' },
    );
    const resolution = await chain.resolve({});
    expect(resolution?.tenantId).toBe('ta');
    expect(cCalls).toBe(0);
  });

  it('awaits async strategies sequentially', async () => {
    const order: string[] = [];
    const slow = (name: string, ms: number, hit: boolean): TenantResolverStrategy<unknown> => ({
      name,
      async resolve() {
        await new Promise((r) => setTimeout(r, ms));
        order.push(name);
        return hit ? { tenantId: name, strategyName: name } : null;
      },
    });
    const chain = new ChainTenantResolver<unknown>(
      [slow('a', 5, false), slow('b', 1, true), slow('c', 0, true)],
      { mode: 'optional' },
    );
    const resolution = await chain.resolve({});
    expect(resolution?.tenantId).toBe('b');
    expect(order).toEqual(['a', 'b']);
  });
});
