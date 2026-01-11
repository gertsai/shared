import type { StorageAdapter } from '../adapters/StorageAdapter';
import { LimiterStrategy } from '../utils/types';

import { GCRAStrategy } from './GCRAStrategy';
import type { RateLimitStrategy } from './RateLimitStrategy';
import { SlidingWindowStrategy } from './SlidingWindowStrategy';

export class StrategyFactory {
  private readonly sliding: SlidingWindowStrategy;
  private readonly gcra: GCRAStrategy;

  constructor(adapter: StorageAdapter) {
    this.sliding = new SlidingWindowStrategy(adapter);
    this.gcra = new GCRAStrategy(adapter);
  }

  get(name: LimiterStrategy): RateLimitStrategy {
    switch (name) {
      case LimiterStrategy.GCRA:
        return this.gcra;
      case LimiterStrategy.SLIDING_WINDOW:
      default:
        return this.sliding;
    }
  }
}
