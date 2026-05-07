import { describe, expect, it } from 'vitest';
import RedisClient from 'ioredis';

import { RLRMiddleware } from '../src/index';
import { LimiterStrategy, Methods } from '../src/utils/types';
import { RateLimitTestUtils } from '../src/test-utils/RateLimitTestUtils';

const HAS_REDIS = process.env.HAS_REDIS === '1' || process.env.HAS_REDIS === 'true';

const skipIfNoRedis = !HAS_REDIS ? describe.skip : describe;

skipIfNoRedis('Middleware integration', () => {
  it('enforces sliding window on GET route (limit: 2)', async () => {
    const prefix = `it_slw_${Math.random().toString(36).slice(2)}:`;
    const middleware = RLRMiddleware({
      store: () => new RedisClient(),
      prefix,
      limit: 100, // Default limit (not used with routesOnly=true)
      timeFrame: 60000, // Default timeFrame (not used with routesOnly=true)
      routesOnly: true,
      routes: [
        {
          path: '/int/slw',
          method: Methods.GET,
          limit: 2,
          timeFrame: 2000,
          strategy: LimiterStrategy.SLIDING_WINDOW,
        },
      ],
    });

    // 1st request allowed
    let { next, error } = await RateLimitTestUtils.testMiddleware(
      middleware,
      RateLimitTestUtils.createMockRequest({
        method: 'GET',
        url: '/int/slw',
        originalUrl: '/int/slw',
        headers: {
          'x-forwarded-for': '127.0.0.10',
        },
      }),
    );
    expect(error).toBeUndefined();
    expect(next.called()).toBe(true);

    // 2nd request allowed (limit 2)
    ({ next, error } = await RateLimitTestUtils.testMiddleware(
      middleware,
      RateLimitTestUtils.createMockRequest({
        method: 'GET',
        url: '/int/slw',
        originalUrl: '/int/slw',
        headers: {
          'x-forwarded-for': '127.0.0.10',
        },
      }),
    ));
    expect(error).toBeUndefined();
    expect(next.called()).toBe(true);

    // 3rd request blocked (remaining becomes < 0 attempt)
    ({ next, error } = await RateLimitTestUtils.testMiddleware(
      middleware,
      RateLimitTestUtils.createMockRequest({
        method: 'GET',
        url: '/int/slw',
        originalUrl: '/int/slw',
        headers: {
          'x-forwarded-for': '127.0.0.10',
        },
      }),
    ));
    expect(error).toBeDefined();
    expect((error as any)?.message).toContain('Rate limit exceeded');
  });

  it('enforces gcra on POST route (limit: 1, burst:1)', async () => {
    const prefix = `it_gcra_${Math.random().toString(36).slice(2)}:`;
    const middleware = RLRMiddleware({
      store: () => new RedisClient(),
      prefix,
      limit: 100, // Default limit (not used with routesOnly=true)
      timeFrame: 60000, // Default timeFrame (not used with routesOnly=true)
      routesOnly: true,
      routes: [
        {
          path: '/int/gcra',
          method: Methods.POST,
          limit: 1,
          timeFrame: 10000, // 10 seconds
          strategy: LimiterStrategy.GCRA,
          burst: 1, // Allow 1 burst
        },
      ],
    });

    // First request allowed
    let { error } = await RateLimitTestUtils.testMiddleware(
      middleware,
      RateLimitTestUtils.createMockRequest({
        method: 'POST',
        url: '/int/gcra',
        originalUrl: '/int/gcra',
        headers: {
          'x-forwarded-for': '127.0.0.11',
        },
      }),
    );
    expect(error).toBeUndefined();

    // Second request immediately should be allowed due to burst
    ({ error } = await RateLimitTestUtils.testMiddleware(
      middleware,
      RateLimitTestUtils.createMockRequest({
        method: 'POST',
        url: '/int/gcra',
        originalUrl: '/int/gcra',
        headers: {
          'x-forwarded-for': '127.0.0.11',
        },
      }),
    ));
    expect(error).toBeUndefined(); // Burst allows it

    // Third request should be blocked (exceeded burst)
    ({ error } = await RateLimitTestUtils.testMiddleware(
      middleware,
      RateLimitTestUtils.createMockRequest({
        method: 'POST',
        url: '/int/gcra',
        originalUrl: '/int/gcra',
        headers: {
          'x-forwarded-for': '127.0.0.11',
        },
      }),
    ));
    expect(error).toBeDefined();
  });

  it('respects routesOnly=true and ignore=true', async () => {
    const prefix = `it_routes_${Math.random().toString(36).slice(2)}:`;
    const middleware = RLRMiddleware({
      store: () => new RedisClient(),
      prefix,
      limit: 100, // Default limit (not used with routesOnly=true)
      timeFrame: 60000, // Default timeFrame (not used with routesOnly=true)
      routesOnly: true,
      routes: [
        { path: '/int/open', method: Methods.GET, ignore: true },
        { path: '/int/closed', method: Methods.GET, limit: 1, timeFrame: 1000 },
      ],
    });

    // Ignored route should always pass
    let { next, error } = await RateLimitTestUtils.testMiddleware(
      middleware,
      RateLimitTestUtils.createMockRequest({
        method: 'GET',
        url: '/int/open',
        originalUrl: '/int/open',
        headers: {
          'x-forwarded-for': '127.0.0.12',
        },
      }),
    );
    expect(error).toBeUndefined();
    expect(next.called()).toBe(true);

    // Unmatched route should skip (routesOnly=true)
    ({ next, error } = await RateLimitTestUtils.testMiddleware(
      middleware,
      RateLimitTestUtils.createMockRequest({
        method: 'GET',
        url: '/int/unknown',
        originalUrl: '/int/unknown',
        headers: {
          'x-forwarded-for': '127.0.0.13',
        },
      }),
    ));
    expect(error).toBeUndefined();
    expect(next.called()).toBe(true);

    // Closed route should block on second hit
    ({ next, error } = await RateLimitTestUtils.testMiddleware(
      middleware,
      RateLimitTestUtils.createMockRequest({
        method: 'GET',
        url: '/int/closed',
        originalUrl: '/int/closed',
        headers: {
          'x-forwarded-for': '127.0.0.20',
        },
      }),
    ));
    expect(error).toBeUndefined();
    ({ next, error } = await RateLimitTestUtils.testMiddleware(
      middleware,
      RateLimitTestUtils.createMockRequest({
        method: 'GET',
        url: '/int/closed',
        originalUrl: '/int/closed',
        headers: {
          'x-forwarded-for': '127.0.0.20',
        },
      }),
    ));
    expect(error).toBeDefined();
  });
});
