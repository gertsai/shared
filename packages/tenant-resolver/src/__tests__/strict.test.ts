// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { resolveTenantStrict } from '../strict.js';
import { UnauthorizedError } from '@gertsai/errors';
import type { TenantResolverStrategy } from '../strategy.js';

describe('resolveTenantStrict', () => {
  it('returns the resolution when resolver yields one', async () => {
    const r: TenantResolverStrategy<unknown> = {
      name: 'r',
      async resolve() {
        return { tenantId: 'tA', strategyName: 'r' };
      },
    };
    await expect(resolveTenantStrict(r, {})).resolves.toEqual({
      tenantId: 'tA',
      strategyName: 'r',
    });
  });

  it('throws UnauthorizedError when resolver returns null', async () => {
    const r: TenantResolverStrategy<unknown> = {
      name: 'r',
      async resolve() {
        return null;
      },
    };
    await expect(resolveTenantStrict(r, {})).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("UnauthorizedError details include the resolver's name", async () => {
    const r: TenantResolverStrategy<unknown> = {
      name: 'custom-resolver',
      async resolve() {
        return null;
      },
    };
    try {
      await resolveTenantStrict(r, {});
      expect.fail('expected UnauthorizedError');
    } catch (err) {
      expect(err).toBeInstanceOf(UnauthorizedError);
      const ue = err as UnauthorizedError;
      expect(ue.message).toContain('custom-resolver');
      expect(ue.details.reason).toContain('custom-resolver');
    }
  });
});
