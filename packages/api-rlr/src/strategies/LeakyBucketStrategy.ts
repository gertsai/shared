/**
 * Leaky Bucket Rate Limiting Strategy
 *
 * Models a bucket that:
 * - Has a maximum capacity (burst size)
 * - Leaks/drains at a constant rate
 * - Each request adds `cost` units of "water" (default: 1)
 * - Request is allowed if bucket has room for the cost
 *
 * Benefits:
 * - Smooth traffic shaping with predictable output rate
 * - Allows controlled bursts up to capacity
 * - Natural rate limiting without hard edges
 * - Supports cost-based limiting (expensive ops consume more tokens)
 *
 * Parameters:
 * - capacity: Maximum burst size (bucket size)
 * - drainRate: Requests per second that drain from bucket
 * - cost: Tokens consumed per request (default: 1)
 *
 * @module strategies/LeakyBucketStrategy
 */

import type { StorageAdapter } from '../adapters/StorageAdapter';
import { LimiterStrategy } from '../utils/types';

import type { RateLimitStrategy, StrategyExecuteArgs, StrategyResult } from './RateLimitStrategy';

export class LeakyBucketStrategy implements RateLimitStrategy {
  readonly name: LimiterStrategy = LimiterStrategy.LEAKY_BUCKET;

  constructor(private readonly adapter: StorageAdapter) {}

  async execute(args: StrategyExecuteArgs): Promise<StrategyResult> {
    const { key, limit, timeFrame, now, burst, cost } = args;

    // Check if adapter supports leaky bucket
    if (!this.adapter.leakyBucket) {
      throw new Error('Storage adapter does not support Leaky Bucket algorithm');
    }

    // Convert parameters:
    // - capacity = burst (or limit if burst not specified)
    // - drainRate = limit / (timeFrame / 1000) = requests per second
    const capacity = burst ?? limit;
    const drainRate = limit / (timeFrame / 1000);

    const result = await this.adapter.leakyBucket(key, capacity, drainRate, now, cost);

    const allow = result[0] === 1;
    const currentLevel = result[1];
    const bucketCapacity = result[2];
    const retryAfter = result[4];

    // Calculate remaining as capacity - current level
    const remainingHits = Math.max(0, Math.floor(bucketCapacity - currentLevel));

    // totalHits represents how full the bucket is
    const totalHits = Math.ceil(currentLevel);

    // expiryTime: time until bucket empties (for header purposes)
    const expiryTime = drainRate > 0 ? Math.ceil((currentLevel / drainRate) * 1000) : 0;

    return {
      allow,
      totalHits,
      remainingHits,
      expiryTime,
      ...(retryAfter > 0 && { retryAfter }),
    };
  }
}
