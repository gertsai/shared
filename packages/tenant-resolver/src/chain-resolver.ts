// SPDX-License-Identifier: Apache-2.0
import { UnauthorizedError } from '@gertsai/errors';
import type { TenantResolution, TenantResolverStrategy } from './strategy.js';

export type ChainResolverMode = 'strict' | 'optional';

export interface ChainTenantResolverOptions {
  /**
   * `'strict'` (default per ADR-006 I-18): `resolve()` throws
   * `UnauthorizedError` if every constituent strategy returned `null`.
   *
   * `'optional'`: `resolve()` returns `null` when the chain is exhausted
   * — used by routes intentionally not tenant-isolated (health checks,
   * public docs, anonymous landing pages).
   */
  readonly mode?: ChainResolverMode;
}

/**
 * Composable orchestrator that runs a sequence of strategies and returns
 * the first non-null resolution. First-wins ordering is the consumer's
 * responsibility — list strategies by precedence (most-specific first).
 *
 * Defaults to `mode: 'strict'` per ADR-006 I-18 (security P1-5): the
 * historical fail-open default has been replaced by fail-closed so that
 * mis-configured tenant-aware routes refuse traffic instead of silently
 * accepting it.
 */
export class ChainTenantResolver<Source> implements TenantResolverStrategy<Source> {
  readonly name = 'chain';
  private readonly strategies: readonly TenantResolverStrategy<Source>[];
  private readonly mode: ChainResolverMode;

  constructor(
    strategies: readonly TenantResolverStrategy<Source>[],
    options: ChainTenantResolverOptions = {},
  ) {
    this.strategies = strategies;
    this.mode = options.mode ?? 'strict';
  }

  async resolve(source: Source): Promise<TenantResolution | null> {
    for (const strategy of this.strategies) {
      const result = await strategy.resolve(source);
      if (result !== null) {
        return result;
      }
    }

    if (this.mode === 'strict') {
      const names = this.strategies.map((s) => s.name);
      throw new UnauthorizedError({
        message: `No tenant resolved from any strategy [${names.join(', ')}]`,
        details: {
          reason: `chain[${this.name}] exhausted strategies: ${names.join(', ')}`,
        },
      });
    }
    return null;
  }
}
