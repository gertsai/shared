import type { StorageAdapter } from '../adapters/StorageAdapter';
import { LimiterStrategy } from '../utils/types';

import type { RateLimitStrategy, StrategyExecuteArgs, StrategyResult } from './RateLimitStrategy';

export class SlidingWindowStrategy implements RateLimitStrategy {
  readonly name: LimiterStrategy = LimiterStrategy.SLIDING_WINDOW;

  constructor(private readonly adapter: StorageAdapter) {}

  async execute(args: StrategyExecuteArgs): Promise<StrategyResult> {
    const { key, limit, timeFrame, now } = args;
    const values = await this.adapter.incrementSW(key, timeFrame, limit, now);

    // If Lua returns 4 elements, first is allow flag (1|0)
    let allowFlag = 1;
    let idxOffset = 0;
    if (values.length === 4) {
      allowFlag = Number(values[0]);
      idxOffset = 1;
    }

    const totalHits = Number(values[idxOffset] ?? 0);
    const remainingHits = Number(values[idxOffset + 1] ?? 0);
    const expiryTime = Number(values[idxOffset + 2] ?? 0);

    const allow = allowFlag === 1;

    return {
      allow,
      totalHits,
      remainingHits,
      expiryTime,
    };
  }
}
