// SPDX-License-Identifier: Apache-2.0
import { RateLimitedError } from '@gertsai/errors';
import type { RateLimitConfig } from './types.js';

/**
 * Token-bucket rate limiter using `process.hrtime.bigint()` for monotonic
 * timing per ADR-009 R-4 mitigation (Node high-load precision).
 *
 * `tokensPerSecond` defines refill rate. `burst` (defaults to
 * `tokensPerSecond`) is the bucket capacity, allowing short bursts above
 * the steady-state rate. `tryAcquire` returns true if a token was
 * available; false otherwise. `acquire` throws `RateLimitedError`.
 */
export class TokenBucketRateLimiter {
  private readonly tokensPerSecond: number;
  private readonly capacity: number;
  private tokens: number;
  private lastRefillNs: bigint;

  constructor(config: RateLimitConfig) {
    if (config.tokensPerSecond <= 0) {
      throw new Error('tokensPerSecond must be > 0');
    }
    this.tokensPerSecond = config.tokensPerSecond;
    this.capacity = config.burst ?? config.tokensPerSecond;
    this.tokens = this.capacity;
    this.lastRefillNs = process.hrtime.bigint();
  }

  private refill(): void {
    const nowNs = process.hrtime.bigint();
    const elapsedNs = nowNs - this.lastRefillNs;
    if (elapsedNs <= 0n) return;
    const elapsedSeconds = Number(elapsedNs) / 1_000_000_000;
    const refilled = elapsedSeconds * this.tokensPerSecond;
    if (refilled > 0) {
      this.tokens = Math.min(this.capacity, this.tokens + refilled);
      this.lastRefillNs = nowNs;
    }
  }

  tryAcquire(): boolean {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }
    return false;
  }

  acquire(): void {
    if (!this.tryAcquire()) {
      throw new RateLimitedError({
        message: 'Rate limit exceeded',
        details: {
          limit: this.tokensPerSecond,
        },
      });
    }
  }

  getAvailable(): number {
    this.refill();
    return this.tokens;
  }
}
