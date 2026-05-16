import { describe, expect, it, vi } from 'vitest';
import { GCRAStrategy } from './GCRAStrategy';
import type { StorageAdapter } from '../adapters/StorageAdapter';

describe('GCRAStrategy (negative)', () => {
  it('throws when store.gcraCheck is missing', async () => {
    const mockAdapter = {
      gcraCheck: vi.fn().mockRejectedValue(new Error('GCRA check method not available')),
    } as unknown as StorageAdapter;

    const strategy = new GCRAStrategy(mockAdapter);

    await expect(
      strategy.execute({
        key: 'k',
        limit: 10,
        timeFrame: 1000,
        now: Date.now(),
        burst: 3,
      }),
    ).rejects.toThrow('GCRA check method not available');
  });
});
