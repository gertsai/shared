import type { StorageAdapter } from '../adapters/StorageAdapter';
import { LimiterStrategy } from '../utils/types';

import type { RateLimitStrategy, StrategyExecuteArgs, StrategyResult } from './RateLimitStrategy';

export class GCRAStrategy implements RateLimitStrategy {
  readonly name: LimiterStrategy = LimiterStrategy.GCRA;

  constructor(private readonly adapter: StorageAdapter) {}

  async execute(args: StrategyExecuteArgs): Promise<StrategyResult> {
    const { key, limit, timeFrame, now, burst = 3, cost } = args;
    const out = await this.adapter.gcraCheck(key, timeFrame, limit, burst, now, cost);
    const allow = Number(out?.[0] ?? 0) === 1;
    const remainingHits = Number(out?.[1] ?? 0);
    const retryAfter = Number(out?.[2] ?? 0);
    const expiryTime = retryAfter;
    // totalHits должен отражать фактическое число использованных запросов в текущем окне.
    // GCRA возвращает remainingHits = сколько ещё можно сейчас. Поэтому totalHits = limit - remaining.
    const totalHits = Math.max(0, limit - remainingHits);
    return { allow, totalHits, remainingHits, expiryTime, retryAfter };
  }
}
