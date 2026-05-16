// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from 'vitest';
import { RateLimitedError } from '@gertsai/errors';
import { TokenBucketRateLimiter } from '../rate-limiter.js';
import { sleep } from '@gertsai/async-utils';

describe('TokenBucketRateLimiter', () => {
  it('happy path — acquire within capacity succeeds', () => {
    const rl = new TokenBucketRateLimiter({ tokensPerSecond: 10, burst: 5 });
    expect(rl.tryAcquire()).toBe(true);
    expect(rl.tryAcquire()).toBe(true);
    expect(rl.tryAcquire()).toBe(true);
  });

  it('refills tokens over wall-clock time', async () => {
    const rl = new TokenBucketRateLimiter({ tokensPerSecond: 50, burst: 1 });
    expect(rl.tryAcquire()).toBe(true);
    expect(rl.tryAcquire()).toBe(false);
    await sleep(60); // 50 tokens/s * 60ms ≈ 3 tokens (>=1)
    expect(rl.tryAcquire()).toBe(true);
  });

  it('burst capacity caps total available tokens', () => {
    const rl = new TokenBucketRateLimiter({ tokensPerSecond: 5, burst: 3 });
    expect(rl.tryAcquire()).toBe(true);
    expect(rl.tryAcquire()).toBe(true);
    expect(rl.tryAcquire()).toBe(true);
    expect(rl.tryAcquire()).toBe(false);
  });

  it('exhaustion throws RateLimitedError on acquire()', () => {
    const rl = new TokenBucketRateLimiter({ tokensPerSecond: 1, burst: 1 });
    rl.acquire();
    expect(() => rl.acquire()).toThrowError(RateLimitedError);
  });

  // PRD-034 FR-007 — integer-bucket model: no fractional drift.
  it('refills exactly 1 token after 1 second at tokensPerSecond=1', async () => {
    const rl = new TokenBucketRateLimiter({ tokensPerSecond: 1, burst: 1 });
    expect(rl.tryAcquire()).toBe(true); // consume the initial token
    expect(rl.tryAcquire()).toBe(false);
    await sleep(1_050); // 1.05s — comfortably past the 1s refill mark
    // After ≥1s a single whole token must be available — no `0.9999…` drift.
    expect(rl.tryAcquire()).toBe(true);
    expect(rl.tryAcquire()).toBe(false);
  });

  it('does not accumulate fractional surplus across rapid back-to-back calls', () => {
    // tokensPerSecond=10 → 0.01 tokens/ms. Burst=1. Rapid-fire calls
    // within the same millisecond must NOT both pass (the old float-math
    // path could produce `1.0000…001` and let the second acquire through).
    const rl = new TokenBucketRateLimiter({ tokensPerSecond: 10, burst: 1 });
    expect(rl.tryAcquire()).toBe(true);
    for (let i = 0; i < 50; i += 1) {
      // tight loop — well under 100ms, so < 1 token can have refilled
      expect(rl.tryAcquire()).toBe(false);
    }
  });

  it('100 consecutive tryAcquire at tokensPerSecond=100, burst=10 — no spurious rejection at steady state', async () => {
    const rl = new TokenBucketRateLimiter({ tokensPerSecond: 100, burst: 10 });
    let granted = 0;
    // Drain the burst first so we measure steady-state refill, not capacity.
    for (let i = 0; i < 10; i += 1) {
      if (rl.tryAcquire()) granted += 1;
    }
    expect(granted).toBe(10);

    // Then issue 90 requests paced at 12ms each (~83 req/s steady) over
    // ~1080ms. At 100 tokens/s refill the bucket should keep up — every
    // one of these must succeed if the integer-bucket math is drift-free.
    let postBurstGranted = 0;
    for (let i = 0; i < 90; i += 1) {
      await sleep(12);
      if (rl.tryAcquire()) postBurstGranted += 1;
    }
    expect(postBurstGranted).toBe(90);
  });
});
