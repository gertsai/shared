import type { LimiterStrategy, RLRRedis } from '../utils/types';

export type StrategyExecuteArgs = {
  store: RLRRedis;
  key: string;
  limit: number;
  timeFrame: number;
  now: number;
  burst?: number;
  /**
   * Cost of this request in tokens (default: 1)
   * Strategies will consume this many tokens instead of 1
   */
  cost?: number;
};

export type StrategyResult = {
  allow: boolean;
  totalHits: number;
  remainingHits: number;
  expiryTime: number; // milliseconds till reset
  retryAfter?: number;
};

export interface RateLimitStrategy {
  readonly name: LimiterStrategy;
  execute(args: StrategyExecuteArgs): Promise<StrategyResult>;
}
