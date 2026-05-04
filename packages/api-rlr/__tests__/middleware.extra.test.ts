import { describe, expect, it, vi } from 'vitest';
import RedisClient from 'ioredis';

import { RLRMiddleware } from '../src/index';
import { DraftVersionType, LimiterStrategy, Methods } from '../src/utils/types';
import type { RLRRedis } from '../src/utils/types';

import { RateLimitTestUtils } from '../src/test-utils/RateLimitTestUtils';

const HAS_REDIS = process.env.HAS_REDIS === '1' || process.env.HAS_REDIS === 'true';
const skipIfNoRedis = !HAS_REDIS ? describe.skip : describe;

skipIfNoRedis('Middleware extra integration', () => {
  it('emits RFC draft7 RateLimit header', async () => {
    const prefix = `hdr_${Date.now()}:`;
    const middleware = RLRMiddleware({
      store: () => new RedisClient(),
      prefix,
      draftVersion: DraftVersionType.DRAFT7,
      limit: 1,
      timeFrame: 500,
    });

    const reqBase = { method: 'GET', url: '/hdr', originalUrl: '/hdr' } as any;

    // first request allowed
    let { response } = await RateLimitTestUtils.testMiddleware(
      middleware,
      RateLimitTestUtils.createMockRequest(reqBase),
    );
    expect(response.getHeader('RateLimit')).toBeDefined();

    // second request blocked → RateLimit header still present
    ({ response } = await RateLimitTestUtils.testMiddleware(
      middleware,
      RateLimitTestUtils.createMockRequest(reqBase),
    ));
    expect(response.getHeader('RateLimit')).toBeDefined();
  });

  it('routesOnly=false falls back to global limit', async () => {
    const prefix = `fallback_${Math.random().toString(36).slice(2)}:`;
    const middleware = RLRMiddleware({
      store: () => new RedisClient(),
      prefix,
      routesOnly: false,
      routes: [{ path: '/limited', method: Methods.GET, limit: 5, timeFrame: 1000 }],
      limit: 1,
      timeFrame: 1000,
    });

    const reqBase = {
      method: 'GET',
      url: '/other',
      originalUrl: '/other',
    } as any;

    // first ok
    let { error } = await RateLimitTestUtils.testMiddleware(
      middleware,
      RateLimitTestUtils.createMockRequest(reqBase),
    );
    expect(error).toBeUndefined();

    // second blocked by global limit=1
    ({ error } = await RateLimitTestUtils.testMiddleware(
      middleware,
      RateLimitTestUtils.createMockRequest(reqBase),
    ));
    expect(error).toBeDefined();
  });
});

describe('Middleware failOpenOnStoreError', () => {
  it('calls next when store errors and failOpenOnStoreError=true', async () => {
    // stub store that throws
    const mockStore = {
      defineCommand: vi.fn(),
      incrementSW: vi.fn().mockRejectedValue(new Error('redis down')),
      script: vi.fn().mockResolvedValue('sha'),
      on: vi.fn(),
    } as unknown as RLRRedis;

    const middleware = RLRMiddleware({
      store: () => mockStore,
      failOpenOnStoreError: true,
      limit: 1,
      timeFrame: 1000,
      strategy: LimiterStrategy.SLIDING_WINDOW,
    });

    const { next, error } = await RateLimitTestUtils.testMiddleware(
      middleware,
      RateLimitTestUtils.createMockRequest({
        method: 'GET',
        url: '/',
        originalUrl: '/',
      } as any),
    );

    expect(error).toBeUndefined();
    expect(next.called()).toBe(true);
  });
});
