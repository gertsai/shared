/**
 * Tests for backward compatibility
 * Ensures that existing code continues to work with new changes
 */

import { describe, expect, it, vi } from 'vitest';

import { RLRMiddleware } from '../src/index';
import type { RateLimitOptions } from '../src/utils/types';
import { LimiterStrategy, Methods } from '../src/utils/types';

describe('Backward Compatibility', () => {
  it('should work with legacy configuration', () => {
    const mockStore = {
      defineCommand: vi.fn(),
      on: vi.fn(),
      quit: vi.fn(),
      script: vi.fn().mockResolvedValue('sha1'),
    };

    const options: RateLimitOptions = {
      store: () => mockStore as any,
      limit: 100,
      timeFrame: 60000,
    };

    const middleware = RLRMiddleware(options);
    expect(middleware).toBeDefined();
    expect(typeof middleware).toBe('function');
  });

  it('should work with all legacy options', () => {
    const mockStore = {
      defineCommand: vi.fn(),
      on: vi.fn(),
      quit: vi.fn(),
      script: vi.fn().mockResolvedValue('sha1'),
    };

    const options: RateLimitOptions = {
      store: () => mockStore as any,
      limit: 100,
      timeFrame: 60000,
      whiteList: ['127.0.0.1'],
      skip: false,
      prefix: 'rlr:',
      resetExpiryOnChange: true,
      routes: [
        {
          path: /^\/api\//,
          method: Methods.GET,
          limit: 50,
          timeFrame: 30000,
        },
      ],
      strategy: LimiterStrategy.SLIDING_WINDOW,
      burst: 5,
      routesOnly: false,
      useRedisTime: false,
      failOpenOnStoreError: true,
      bucketKeyResolver: (req) => req.headers?.['api-key'] as string,
      limitsResolver: ({ base }) => ({ limit: base.limit * 2 }),
      storeSingletonKey: 'test-store',
    };

    const middleware = RLRMiddleware(options);
    expect(middleware).toBeDefined();
    expect(typeof middleware).toBe('function');
  });

  it('should use legacy implementation by default', () => {
    const mockStore = {
      defineCommand: vi.fn(),
      on: vi.fn(),
      quit: vi.fn(),
      script: vi.fn().mockResolvedValue('sha1'),
    };

    const options: RateLimitOptions = {
      store: () => mockStore as any,
      limit: 100,
      timeFrame: 60000,
    };

    // Should not use modular architecture by default
    const middleware = RLRMiddleware(options);

    // Check that Lua commands are defined (legacy behavior)
    expect(mockStore.defineCommand).toHaveBeenCalledWith(
      'incrementSW',
      expect.objectContaining({ numberOfKeys: 1 }),
    );
    expect(mockStore.defineCommand).toHaveBeenCalledWith(
      'gcraCheck',
      expect.objectContaining({ numberOfKeys: 1 }),
    );
  });

  it('should switch to new architecture when explicitly enabled', () => {
    const mockStore = {
      defineCommand: vi.fn(),
      on: vi.fn(),
      quit: vi.fn(),
      script: vi.fn().mockResolvedValue('sha1'),
    };

    const options: RateLimitOptions = {
      store: () => mockStore as any,
      limit: 100,
      timeFrame: 60000,
      useModularArchitecture: true,
    };

    const middleware = RLRMiddleware(options);
    expect(middleware).toBeDefined();
    expect(typeof middleware).toBe('function');

    // New architecture also defines commands for compatibility
    expect(mockStore.defineCommand).toHaveBeenCalled();
  });

  it('should maintain same middleware signature', async () => {
    const mockStore = {
      defineCommand: vi.fn(),
      on: vi.fn(),
      quit: vi.fn(),
      script: vi.fn().mockResolvedValue('sha1'),
      incrementSW: vi.fn().mockResolvedValue([1, 5, 60000]),
    };

    const options: RateLimitOptions = {
      store: () => mockStore as any,
      limit: 100,
      timeFrame: 60000,
    };

    const middleware = RLRMiddleware(options);

    // Test middleware signature
    const mockReq = {
      method: 'GET',
      url: '/api/test',
      headers: { 'x-forwarded-for': '127.0.0.1' },
    };
    const mockRes = {
      headersSent: false,
      setHeader: vi.fn(),
    };
    const mockNext = vi.fn();

    // Middleware should have same signature
    await middleware(mockReq as any, mockRes as any, mockNext);

    // Should call next (request allowed)
    expect(mockNext).toHaveBeenCalled();
  });

  it('should support both resilience and legacy failOpenOnStoreError', () => {
    const mockStore = {
      defineCommand: vi.fn(),
      on: vi.fn(),
      quit: vi.fn(),
      script: vi.fn().mockResolvedValue('sha1'),
    };

    // Legacy option
    const options1: RateLimitOptions = {
      store: () => mockStore as any,
      limit: 100,
      timeFrame: 60000,
      failOpenOnStoreError: true,
    };

    const middleware1 = RLRMiddleware(options1);
    expect(middleware1).toBeDefined();

    // New resilience option
    const options2: RateLimitOptions = {
      store: () => mockStore as any,
      limit: 100,
      timeFrame: 60000,
      resilience: {
        fallbackStrategy: 'allow',
        retryAttempts: 3,
      },
    };

    const middleware2 = RLRMiddleware(options2);
    expect(middleware2).toBeDefined();
  });

  it('should maintain same rate limit info structure', async () => {
    const mockStore = {
      defineCommand: vi.fn(),
      on: vi.fn(),
      quit: vi.fn(),
      script: vi.fn().mockResolvedValue('sha1'),
      incrementSW: vi.fn().mockResolvedValue([1, 5, 60000]),
    };

    const options: RateLimitOptions = {
      store: () => mockStore as any,
      limit: 100,
      timeFrame: 60000,
    };

    const middleware = RLRMiddleware(options);

    const mockReq: any = {
      method: 'GET',
      url: '/api/test',
      headers: { 'x-forwarded-for': '127.0.0.1' },
    };
    const mockRes = {
      headersSent: false,
      setHeader: vi.fn(),
    };
    const mockNext = vi.fn();

    await middleware(mockReq, mockRes as any, mockNext);

    // Check that rate limit info is attached to request
    expect(mockReq.rateLimit).toBeDefined();
    expect(mockReq.rateLimit).toHaveProperty('limit');
    expect(mockReq.rateLimit).toHaveProperty('timeFrame');
    expect(mockReq.rateLimit).toHaveProperty('totalHits');
    expect(mockReq.rateLimit).toHaveProperty('remainingHits');

    // Legacy property
    expect(mockReq.rateLimit).toHaveProperty('current');
  });

  it('should maintain same header format', async () => {
    const mockStore = {
      defineCommand: vi.fn(),
      on: vi.fn(),
      quit: vi.fn(),
      script: vi.fn().mockResolvedValue('sha1'),
      incrementSW: vi.fn().mockResolvedValue([1, 5, 60000]),
    };

    const options: RateLimitOptions = {
      store: () => mockStore as any,
      limit: 100,
      timeFrame: 60000,
    };

    const middleware = RLRMiddleware(options);

    const mockReq = {
      method: 'GET',
      url: '/api/test',
      headers: { 'x-forwarded-for': '127.0.0.1' },
    };
    const mockRes = {
      headersSent: false,
      setHeader: vi.fn(),
    };
    const mockNext = vi.fn();

    await middleware(mockReq as any, mockRes as any, mockNext);

    // Check headers are set correctly
    expect(mockRes.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', expect.any(String));
    expect(mockRes.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', expect.any(String));
  });
});
