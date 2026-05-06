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
});
