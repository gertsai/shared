import type { LimiterStrategy } from '../utils/types';

/**
 * Wave 12.D-fix / EVID-051 T-3 (FR-014): `store` field dropped — it was
 * unused dead-code coupling. Strategies receive their adapter via the
 * constructor (`new SlidingWindowStrategy(adapter)` etc.); the
 * pre-Wave-12.D `args.store` channel was always passed `null as any`.
 */
export type StrategyExecuteArgs = {
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
