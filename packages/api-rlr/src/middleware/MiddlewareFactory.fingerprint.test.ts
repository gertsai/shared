/**
 * Wave 12.D-fix / FR-003 / EVID-051 A-2:
 *
 * Confirms the module-private store registry replaces the
 * pre-Wave-12.D `globalThis.__RLR_STORES__` anti-pattern:
 *   - Same fingerprint (same identity fields)         → reuses store.
 *   - Different fingerprint (different identity fields) → distinct stores.
 *   - `__resetStoreInstancesForTesting()` clears the map.
 *   - No `globalThis.__RLR_STORES__` is ever populated.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  MiddlewareFactory,
  __getStoreInstancesSizeForTesting,
  __resetStoreInstancesForTesting,
} from './MiddlewareFactory';
import { LimiterStrategy, type RateLimitOptions } from '../utils/types';
import type { Redis } from 'ioredis';

function makeMockStore(): Redis {
  // Minimal ioredis-shaped mock — enough for setupStore + AdapterFactory
  // wiring to not throw during smoke.
  const mock = {
    on: vi.fn(),
    defineCommand: vi.fn(),
    quit: vi.fn(),
    script: vi.fn().mockResolvedValue('sha1'),
  };
  return mock as unknown as Redis;
}

function makeOptions(
  overrides: Partial<RateLimitOptions> = {},
): RateLimitOptions {
  return {
    timeFrame: 1000,
    limit: 10,
    store: () => makeMockStore(),
    strategy: LimiterStrategy.SLIDING_WINDOW,
    ...overrides,
  };
}

describe('MiddlewareFactory — module-private store registry (FR-003)', () => {
  beforeEach(() => {
    __resetStoreInstancesForTesting();
  });

  it('does NOT populate globalThis.__RLR_STORES__', () => {
    const opts = makeOptions({ storeSingletonKey: 'k1' });
    MiddlewareFactory.create(opts);

    expect(
      (globalThis as unknown as { __RLR_STORES__?: unknown }).__RLR_STORES__,
    ).toBeUndefined();
  });

  it('reuses the same store for identical configs with a singletonKey', () => {
    let storeCallCount = 0;
    const sharedStore = makeMockStore();
    const opts: RateLimitOptions = {
      timeFrame: 1000,
      limit: 10,
      store: () => {
        storeCallCount += 1;
        return sharedStore;
      },
      strategy: LimiterStrategy.SLIDING_WINDOW,
      storeSingletonKey: 'shared',
    };

    MiddlewareFactory.create(opts);
    MiddlewareFactory.create(opts);
    MiddlewareFactory.create(opts);

    // Only ONE store factory invocation — subsequent .create() calls
    // returned the cached instance.
    expect(storeCallCount).toBe(1);
    expect(__getStoreInstancesSizeForTesting()).toBe(1);
  });

  it('creates distinct store instances for configs with different identity fields', () => {
    const opts1 = makeOptions({ storeSingletonKey: 'a', prefix: 'tenant-a' });
    const opts2 = makeOptions({ storeSingletonKey: 'b', prefix: 'tenant-b' });

    MiddlewareFactory.create(opts1);
    MiddlewareFactory.create(opts2);

    expect(__getStoreInstancesSizeForTesting()).toBe(2);
  });

  it('always returns a fresh store when storeSingletonKey is absent', () => {
    let storeCallCount = 0;
    const opts: RateLimitOptions = {
      timeFrame: 1000,
      limit: 10,
      store: () => {
        storeCallCount += 1;
        return makeMockStore();
      },
      strategy: LimiterStrategy.SLIDING_WINDOW,
      // no storeSingletonKey → no caching
    };

    MiddlewareFactory.create(opts);
    MiddlewareFactory.create(opts);

    expect(storeCallCount).toBe(2);
    expect(__getStoreInstancesSizeForTesting()).toBe(0);
  });

  it('__resetStoreInstancesForTesting clears the registry', () => {
    MiddlewareFactory.create(makeOptions({ storeSingletonKey: 'foo' }));
    expect(__getStoreInstancesSizeForTesting()).toBe(1);

    __resetStoreInstancesForTesting();
    expect(__getStoreInstancesSizeForTesting()).toBe(0);
  });
});
