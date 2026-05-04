import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RedisAdapter } from './RedisAdapter';
import type { RLRRedis } from '../utils/types';

describe('RedisAdapter (negative)', () => {
  let store: Partial<RLRRedis>;

  beforeEach(() => {
    store = {
      defineCommand: vi.fn(),
    } as unknown as Partial<RLRRedis>;
  });

  it('incrementSW throws if command missing', async () => {
    const adapter = new RedisAdapter(store as RLRRedis);
    await expect(adapter.incrementSW('k', 1000, 10, Date.now())).rejects.toThrow(
      'incrementSW method not available',
    );
  });

  it('gcraCheck throws if command missing', async () => {
    const adapter = new RedisAdapter(store as RLRRedis);
    await expect(adapter.gcraCheck('k', 1000, 10, 3, Date.now())).rejects.toThrow(
      'GCRA check method not available',
    );
  });
});
