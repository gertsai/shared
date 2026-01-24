// Lua may return 3-tuple [totalHits, remainingHits, resetMs] or 4-tuple [allowFlag, totalHits, remainingHits, resetMs]
export type SlidingWindowResult = [number, number, number] | [number, number, number, number];
export type GCRAResult = [number, number, number];
/** [allow, currentLevel, capacity, drainRate, retryAfter] */
export type LeakyBucketResult = [number, number, number, number, number];

export interface StorageAdapter {
  /**
   * Sliding Window rate limit check
   * @param key - Rate limit key
   * @param timeFrame - Time window in ms
   * @param limit - Maximum requests per window
   * @param now - Current timestamp in ms
   * @param cost - Cost of this request (default: 1)
   */
  incrementSW(
    key: string,
    timeFrame: number,
    limit: number,
    now: number,
    cost?: number,
  ): Promise<SlidingWindowResult>;

  /**
   * GCRA (Generic Cell Rate Algorithm) check
   * @param key - Rate limit key
   * @param timeFrame - Time window in ms
   * @param limit - Maximum requests per window
   * @param burst - Burst allowance
   * @param now - Current timestamp in ms
   * @param cost - Cost of this request (default: 1)
   */
  gcraCheck(
    key: string,
    timeFrame: number,
    limit: number,
    burst: number,
    now: number,
    cost?: number,
  ): Promise<GCRAResult>;

  /**
   * Leaky Bucket rate limit check
   * @param key - Rate limit key
   * @param capacity - Maximum bucket capacity (burst size)
   * @param drainRate - Requests drained per second
   * @param now - Current timestamp in ms
   * @param cost - Cost of this request (default: 1)
   * @returns [allow, currentLevel, capacity, drainRate, retryAfter]
   */
  leakyBucket?(
    key: string,
    capacity: number,
    drainRate: number,
    now: number,
    cost?: number,
  ): Promise<LeakyBucketResult>;

  /**
   * Get current time from the store (for clock synchronization)
   * Redis/Valkey returns server time via TIME command
   * Memory adapter returns Date.now()
   * @returns Current timestamp in milliseconds
   */
  getTime?(): Promise<number>;
}
