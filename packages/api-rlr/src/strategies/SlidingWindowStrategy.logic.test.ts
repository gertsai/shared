import { describe, expect, it, vi } from 'vitest';

import { SlidingWindowStrategy } from './SlidingWindowStrategy';
import { LimiterStrategy } from '../utils/types';
import type { StorageAdapter } from '../adapters/StorageAdapter';

describe('SlidingWindowStrategy logic', () => {
  it('parses lua result correctly (allow flag)', async () => {
    // mock adapter by monkey-patching RedisAdapter inside strategy via dependency injection (store.incrementSW)
    const fakeResult: [number, number, number, number] = [1, 3, 0, 500];
    const mockAdapter = {
      incrementSW: vi.fn().mockResolvedValue(fakeResult),
    } as unknown as StorageAdapter;

    const strategy = new SlidingWindowStrategy(mockAdapter);

    const out = await strategy.execute({
      key: 'k',
      limit: 3,
      timeFrame: 1000,
      now: Date.now(),
    });

    expect(out.allow).toBe(true);
    expect(out.totalHits).toBe(3);
    expect(out.remainingHits).toBe(0);
    expect(out.expiryTime).toBe(500);
    expect(strategy.name).toBe(LimiterStrategy.SLIDING_WINDOW);
  });
});
