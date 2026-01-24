/**
 * Tests for useRedisTime feature
 * @module core/RateLimiter.useRedisTime.test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { MemoryAdapter } from '../adapters/MemoryAdapter';
import type { StorageAdapter } from '../adapters/StorageAdapter';
import type { IncomingRequest } from '../utils/types';

import { RateLimiter } from './RateLimiter';

const createMockRequest = (overrides: Partial<IncomingRequest> = {}): IncomingRequest =>
  ({
    method: 'GET',
    url: '/api/test',
    originalUrl: '/api/test',
    headers: { 'x-forwarded-for': '192.168.1.1' },
    ...overrides,
  }) as unknown as IncomingRequest;

describe('RateLimiter - useRedisTime', () => {
  let adapter: MemoryAdapter;

  beforeEach(() => {
    adapter = new MemoryAdapter({ cleanupInterval: 0 });
  });

  afterEach(() => {
    adapter.destroy();
    vi.restoreAllMocks();
  });

  it('should use Date.now() when useRedisTime is false', async () => {
    const dateSpy = vi.spyOn(Date, 'now').mockReturnValue(1000000);
    const getTimeSpy = vi.spyOn(adapter, 'getTime');

    const limiter = new RateLimiter(adapter, {
      limit: 100,
      timeFrame: 60000,
      store: () => null as any,
      useRedisTime: false,
    });

    await limiter.checkLimit(createMockRequest());

    expect(dateSpy).toHaveBeenCalled();
    expect(getTimeSpy).not.toHaveBeenCalled();
  });

  it('should use adapter.getTime() when useRedisTime is true', async () => {
    const redisTime = 2000000; // Different from Date.now()
    const getTimeSpy = vi.spyOn(adapter, 'getTime').mockResolvedValue(redisTime);

    const limiter = new RateLimiter(adapter, {
      limit: 100,
      timeFrame: 60000,
      store: () => null as any,
      useRedisTime: true,
    });

    await limiter.checkLimit(createMockRequest());

    expect(getTimeSpy).toHaveBeenCalled();
  });

  it('should fallback to Date.now() if adapter.getTime() fails', async () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(adapter, 'getTime').mockRejectedValue(new Error('Redis connection failed'));

    const limiter = new RateLimiter(adapter, {
      limit: 100,
      timeFrame: 60000,
      store: () => null as any,
      useRedisTime: true,
    });

    // Should not throw, should use fallback
    const decision = await limiter.checkLimit(createMockRequest());

    expect(decision.allowed).toBe(true);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to get Redis time'),
      expect.any(Error),
    );
  });

  it('should use Date.now() if adapter does not support getTime', async () => {
    // Create adapter without getTime method
    const adapterWithoutGetTime: StorageAdapter = {
      incrementSW: adapter.incrementSW.bind(adapter),
      gcraCheck: adapter.gcraCheck.bind(adapter),
      // No getTime method
    };

    const dateSpy = vi.spyOn(Date, 'now').mockReturnValue(4000000);

    const limiter = new RateLimiter(adapterWithoutGetTime, {
      limit: 100,
      timeFrame: 60000,
      store: () => null as any,
      useRedisTime: true, // Enabled but adapter doesn't support it
    });

    await limiter.checkLimit(createMockRequest());

    expect(dateSpy).toHaveBeenCalled();
  });
});
