import type { LimiterStrategy, RLRRedis } from '../utils/types';

export type StrategyExecuteArgs = {
  store: RLRRedis;
  key: string;
  limit: number;
  timeFrame: number;
  now: number;
  burst?: number;
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
