// SPDX-License-Identifier: Apache-2.0
import { UnauthorizedError } from '@gertsai/errors';
import type { TenantResolution, TenantResolverStrategy } from './strategy.js';

/**
 * Resolve strictly: invoke `resolver.resolve(source)` and throw
 * `UnauthorizedError` if it returns `null`.
 *
 * Useful when wrapping a single strategy (or an `'optional'`-mode chain)
 * inline at a call-site that requires a tenant. For chain-level strict
 * behaviour prefer `new ChainTenantResolver(strategies, { mode: 'strict' })`
 * — this helper exists for callers composing strategies ad-hoc.
 */
export async function resolveTenantStrict<Source>(
  resolver: TenantResolverStrategy<Source>,
  source: Source,
): Promise<TenantResolution> {
  const result = await resolver.resolve(source);
  if (result === null) {
    throw new UnauthorizedError({
      message: `No tenant resolved by [${resolver.name}]`,
      details: { reason: `resolver[${resolver.name}] returned null` },
    });
  }
  return result;
}
