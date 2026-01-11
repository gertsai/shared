import { describe, expect, it, vi } from 'vitest';
import { SlidingWindowStrategy } from './SlidingWindowStrategy';
import type { RLRRedis } from '../utils/types';
import type { StorageAdapter } from '../adapters/StorageAdapter';

describe('SlidingWindowStrategy (negative)', () => {
  it('throws when store.incrementSW is missing', async () => {
    const mockAdapter = {
      incrementSW: vi.fn().mockRejectedValue(new Error('incrementSW method not available')),
    } as unknown as StorageAdapter;

    const strategy = new SlidingWindowStrategy(mockAdapter);
    const mockStore = { defineCommand: vi.fn() } as unknown as RLRRedis;

    await expect(
      strategy.execute({
        store: mockStore,
        key: 'k',
        limit: 10,
        timeFrame: 1000,
        now: Date.now(),
      }),
    ).rejects.toThrow('incrementSW method not available');
  });
});
