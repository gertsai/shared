import type { StorageAdapter } from '../adapters/StorageAdapter';
import { LimiterStrategy } from '../utils/types';

import type { RateLimitStrategy, StrategyExecuteArgs, StrategyResult } from './RateLimitStrategy';

export class GCRAStrategy implements RateLimitStrategy {
  readonly name: LimiterStrategy = LimiterStrategy.GCRA;

  constructor(private readonly adapter: StorageAdapter) {}

  async execute(args: StrategyExecuteArgs): Promise<StrategyResult> {
    const { key, limit, timeFrame, now, burst = 3 } = args;
    const out = await this.adapter.gcraCheck(key, timeFrame, limit, burst, now);
    const allow = Number(out?.[0] ?? 0) === 1;
    const remainingHits = Number(out?.[1] ?? 0);
    const retryAfter = Number(out?.[2] ?? 0);
    const expiryTime = retryAfter;
    const totalHits = allow ? 1 : limit;
    return { allow, totalHits, remainingHits, expiryTime, retryAfter };
  }
}
