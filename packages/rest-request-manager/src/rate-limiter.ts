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
 *
 * Wave 12.C-fix-2+3 / PRD-034 FR-007: integer-bucket model with a
 * fractional `tokenCarry` accumulator. The previous implementation used
 * `elapsedSeconds * tokensPerSecond` floating-point math directly on
 * `tokens`, which (a) leaked rounding errors so a "full" bucket actually
 * held `0.9999…` tokens — spurious `RateLimitedError` — and (b) could
 * stack a microscopic surplus across back-to-back refills, letting two
 * near-simultaneous calls both pass with a `1.0000…001` reading.
 *
 * Now: every refill computes whole tokens via `Math.floor`, with the
 * sub-1-token remainder held in `tokenCarry` so sub-millisecond rates
 * (e.g. `tokensPerSecond = 100` → `0.1` tokens/ms) still converge
 * exactly over time. The integer-only `tokens` counter then makes
 * `tokens >= 1` a strict, drift-free predicate.
 */
export class TokenBucketRateLimiter {
  private readonly tokensPerSecond: number;
  private readonly tokensPerMs: number;
  private readonly capacity: number;
  private tokens: number;
  private tokenCarry: number;
  private lastRefillNs: bigint;

  constructor(config: RateLimitConfig) {
    if (config.tokensPerSecond <= 0) {
      throw new Error('tokensPerSecond must be > 0');
    }
    this.tokensPerSecond = config.tokensPerSecond;
    this.tokensPerMs = config.tokensPerSecond / 1000;
    this.capacity = config.burst ?? config.tokensPerSecond;
    this.tokens = this.capacity;
    this.tokenCarry = 0;
    this.lastRefillNs = process.hrtime.bigint();
  }

  private refill(): void {
    const nowNs = process.hrtime.bigint();
    const elapsedNs = nowNs - this.lastRefillNs;
    if (elapsedNs <= 0n) return;
    // Integer-millisecond elapsed window (BigInt floor-division). Anything
    // sub-millisecond is held back via `lastRefillNs` so we don't lose
    // the residual time on the next refill.
    const elapsedMs = Number(elapsedNs / 1_000_000n);
    if (elapsedMs <= 0) return;

    const fractional = elapsedMs * this.tokensPerMs + this.tokenCarry;
    const wholeTokens = Math.floor(fractional);
    this.tokenCarry = fractional - wholeTokens;

    if (wholeTokens > 0) {
      this.tokens = Math.min(this.capacity, this.tokens + wholeTokens);
    }
    // Advance the cursor by exactly the integer-ms window we consumed;
    // anything finer stays in `lastRefillNs` as residual nanoseconds.
    this.lastRefillNs += BigInt(elapsedMs) * 1_000_000n;
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
