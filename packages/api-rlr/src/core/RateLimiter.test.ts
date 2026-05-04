/**
 * Unit tests for RateLimiter core logic
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RateLimiter } from './RateLimiter';
import type { StorageAdapter, SlidingWindowResult, GCRAResult } from '../adapters/StorageAdapter';
import type { IncomingRequest, RateLimitOptions } from '../utils/types';
import { LimiterStrategy } from '../utils/types';

// Mock storage adapter - returns tuples as per StorageAdapter interface
function createMockAdapter(
  overrides?: Partial<{
    totalHits: number;
    remainingHits: number;
    resetMs: number;
    allow: number; // 1 = allow, 0 = block
  }>,
): StorageAdapter {
  const defaults = {
    totalHits: 1,
    remainingHits: 99,
    resetMs: 60000,
    allow: 1,
  };
  const opts = { ...defaults, ...overrides };

  return {
    // SlidingWindowResult 4-tuple: [allow, totalHits, remainingHits, resetMs]
    // Using 4-tuple to explicitly control allow flag
    incrementSW: vi
      .fn()
      .mockResolvedValue([
        opts.allow,
        opts.totalHits,
        opts.remainingHits,
        opts.resetMs,
      ] as SlidingWindowResult),
    // GCRAResult: [allow, remainingHits, resetMs]
    gcraCheck: vi
      .fn()
      .mockResolvedValue([opts.allow, opts.remainingHits, opts.resetMs] as GCRAResult),
  };
}

// Mock request
function createMockRequest(overrides?: Partial<IncomingRequest>): IncomingRequest {
  return {
    method: 'GET',
    url: '/api/users',
    originalUrl: '/api/users',
    headers: {},
    connection: { remoteAddress: '192.168.1.1' },
    socket: { remoteAddress: '192.168.1.1' },
    ...overrides,
  } as IncomingRequest;
}

describe('RateLimiter', () => {
  let adapter: StorageAdapter;
  let config: RateLimitOptions;

  beforeEach(() => {
    adapter = createMockAdapter();
    config = {
      limit: 100,
      timeFrame: 60000,
      store: vi.fn(),
      prefix: 'test',
    };
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Core functionality
  // ─────────────────────────────────────────────────────────────────────────

  describe('checkLimit', () => {
    it('should allow request when under limit', async () => {
      const limiter = new RateLimiter(adapter, config);
      const request = createMockRequest();

      const decision = await limiter.checkLimit(request);

      expect(decision.allowed).toBe(true);
      expect(decision.info.remainingHits).toBe(99);
      expect(decision.info.totalHits).toBe(1);
      expect(decision.info.limit).toBe(100);
    });

    it('should block request when limit exceeded', async () => {
      // allow: 0 means blocked
      adapter = createMockAdapter({ remainingHits: 0, totalHits: 100, allow: 0 });
      const limiter = new RateLimiter(adapter, config);
      const request = createMockRequest();

      const decision = await limiter.checkLimit(request);

      expect(decision.allowed).toBe(false);
      expect(decision.info.remainingHits).toBe(0);
    });

    it('should include bucket ID in info', async () => {
      const limiter = new RateLimiter(adapter, config);
      const request = createMockRequest({ method: 'POST', url: '/api/users' });

      const decision = await limiter.checkLimit(request);

      expect(decision.info.bucketId).toBe('post:/api/users');
    });

    it('should normalize path in bucket ID', async () => {
      const limiter = new RateLimiter(adapter, config);
      const request = createMockRequest({ url: '/api/users/12345678-abcd-1234-5678-abcdef123456' });

      const decision = await limiter.checkLimit(request);

      // UUID should be normalized to :id
      expect(decision.info.bucketId).toContain(':id');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Whitelist
  // ─────────────────────────────────────────────────────────────────────────

  describe('whitelist', () => {
    it('should allow whitelisted IPs without counting', async () => {
      const limiter = new RateLimiter(adapter, {
        ...config,
        whiteList: ['192.168.1.1'],
      });
      const request = createMockRequest();

      const decision = await limiter.checkLimit(request);

      expect(decision.allowed).toBe(true);
      expect(decision.info.remainingHits).toBe(100); // Full limit, not counted
      expect(adapter.incrementSW).not.toHaveBeenCalled();
    });

    it('should count requests from non-whitelisted IPs', async () => {
      const limiter = new RateLimiter(adapter, {
        ...config,
        whiteList: ['10.0.0.1'], // Different IP
      });
      const request = createMockRequest();

      await limiter.checkLimit(request);

      expect(adapter.incrementSW).toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Routes
  // ─────────────────────────────────────────────────────────────────────────

  describe('routes', () => {
    it('should apply route-specific limits', async () => {
      const limiter = new RateLimiter(adapter, {
        ...config,
        routes: [{ path: '/api/users', method: 'GET' as any, limit: 10, timeFrame: 10000 }],
      });
      const request = createMockRequest({ method: 'GET', url: '/api/users' });

      const decision = await limiter.checkLimit(request);

      expect(decision.info.limit).toBe(10);
      expect(decision.info.timeFrame).toBe(10000);
    });

    it('should skip unmatched routes when routesOnly is true', async () => {
      const limiter = new RateLimiter(adapter, {
        ...config,
        routesOnly: true,
        routes: [{ path: '/api/admin', method: 'GET' as any, limit: 10 }],
      });
      const request = createMockRequest({ url: '/api/users' }); // Not in routes

      const decision = await limiter.checkLimit(request);

      expect(decision.allowed).toBe(true);
      expect(adapter.incrementSW).not.toHaveBeenCalled(); // Skipped
    });

    it('should apply global limits for unmatched routes when routesOnly is false', async () => {
      const limiter = new RateLimiter(adapter, {
        ...config,
        routesOnly: false,
        routes: [{ path: '/api/admin', method: 'GET' as any, limit: 10 }],
      });
      const request = createMockRequest({ url: '/api/users' });

      await limiter.checkLimit(request);

      expect(adapter.incrementSW).toHaveBeenCalled(); // Applied global limits
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Custom resolvers
  // ─────────────────────────────────────────────────────────────────────────

  describe('bucketKeyResolver', () => {
    it('should use custom subject from resolver', async () => {
      const limiter = new RateLimiter(adapter, {
        ...config,
        bucketKeyResolver: (req) => req.headers['x-api-key'] as string,
      });
      const request = createMockRequest({
        headers: { 'x-api-key': 'my-api-key-123' },
      });

      await limiter.checkLimit(request);

      // Should use API key instead of IP
      expect(adapter.incrementSW).toHaveBeenCalledWith(
        expect.stringContaining('my-api-key-123'),
        expect.any(Number),
        expect.any(Number),
        expect.any(Number),
        undefined, // cost (defaults to undefined)
      );
    });

    it('should fallback to IP when resolver returns null', async () => {
      const limiter = new RateLimiter(adapter, {
        ...config,
        bucketKeyResolver: () => null,
      });
      const request = createMockRequest();

      await limiter.checkLimit(request);

      expect(adapter.incrementSW).toHaveBeenCalledWith(
        expect.stringContaining('192.168.1.1'),
        expect.any(Number),
        expect.any(Number),
        expect.any(Number),
        undefined, // cost (defaults to undefined)
      );
    });
  });

  describe('limitsResolver', () => {
    it('should apply dynamic limits from resolver', async () => {
      const limiter = new RateLimiter(adapter, {
        ...config,
        limitsResolver: ({ req }) => {
          // PRO users get higher limits
          if (req.headers['x-plan'] === 'pro') {
            return { limit: 1000, timeFrame: 60000 };
          }
          return null;
        },
      });
      const request = createMockRequest({
        headers: { 'x-plan': 'pro' },
      });

      const decision = await limiter.checkLimit(request);

      expect(decision.info.limit).toBe(1000);
    });

    it('should use base limits when resolver returns null', async () => {
      const limiter = new RateLimiter(adapter, {
        ...config,
        limitsResolver: () => null,
      });
      const request = createMockRequest();

      const decision = await limiter.checkLimit(request);

      expect(decision.info.limit).toBe(100); // Base config
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Strategy selection
  // ─────────────────────────────────────────────────────────────────────────

  describe('strategy', () => {
    it('should use sliding window by default', async () => {
      const limiter = new RateLimiter(adapter, config);
      const request = createMockRequest();

      const decision = await limiter.checkLimit(request);

      expect(decision.strategy).toBe(LimiterStrategy.SLIDING_WINDOW);
      expect(adapter.incrementSW).toHaveBeenCalled();
    });

    it('should use GCRA when configured', async () => {
      const limiter = new RateLimiter(adapter, {
        ...config,
        strategy: LimiterStrategy.GCRA,
        burst: 5,
      });
      const request = createMockRequest();

      const decision = await limiter.checkLimit(request);

      expect(decision.strategy).toBe(LimiterStrategy.GCRA);
      expect(adapter.gcraCheck).toHaveBeenCalled();
    });

    it('should use route-specific strategy', async () => {
      const limiter = new RateLimiter(adapter, {
        ...config,
        routes: [
          { path: '/api/burst', method: 'POST' as any, strategy: LimiterStrategy.GCRA, burst: 10 },
        ],
      });
      const request = createMockRequest({ method: 'POST', url: '/api/burst' });

      const decision = await limiter.checkLimit(request);

      expect(decision.strategy).toBe(LimiterStrategy.GCRA);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Bucket decoration
  // ─────────────────────────────────────────────────────────────────────────

  describe('bucket decoration', () => {
    it('should add /sse suffix for event streams', async () => {
      const limiter = new RateLimiter(adapter, config);
      const request = createMockRequest({
        method: 'GET',
        url: '/api/events',
        headers: { accept: 'text/event-stream' },
      });

      const decision = await limiter.checkLimit(request);

      expect(decision.info.bucketId).toContain('/sse');
    });

    it('should add /bulk suffix for bulk endpoints', async () => {
      const limiter = new RateLimiter(adapter, config);
      const request = createMockRequest({ method: 'POST', url: '/api/users/bulk' });

      const decision = await limiter.checkLimit(request);

      expect(decision.info.bucketId).toContain('/bulk');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Context
  // ─────────────────────────────────────────────────────────────────────────

  describe('context', () => {
    it('should populate context with request info', async () => {
      const limiter = new RateLimiter(adapter, config);
      const request = createMockRequest({ method: 'POST', url: '/api/users' });

      const decision = await limiter.checkLimit(request);

      // Method is normalized to lowercase
      expect(decision.context.get('method')).toBe('post');
      expect(decision.context.get('normalizedPath')).toBe('/api/users');
      expect(decision.context.get('decision')).toBe('allowed');
    });

    it('should track execution time', async () => {
      const limiter = new RateLimiter(adapter, config);
      const request = createMockRequest();

      const decision = await limiter.checkLimit(request);

      // getDuration() is the correct method name
      expect(decision.context.getDuration()).toBeGreaterThanOrEqual(0);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Error handling
  // ─────────────────────────────────────────────────────────────────────────

  describe('error handling', () => {
    it('should throw when IP cannot be determined', async () => {
      const limiter = new RateLimiter(adapter, config);
      const request = createMockRequest({
        connection: undefined,
        socket: undefined,
        headers: {}, // No x-forwarded-for
      } as any);

      await expect(limiter.checkLimit(request)).rejects.toThrow(
        'Unable to determine subject for rate limiting',
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Accessors
  // ─────────────────────────────────────────────────────────────────────────

  describe('accessors', () => {
    it('should return adapter', () => {
      const limiter = new RateLimiter(adapter, config);

      expect(limiter.getAdapter()).toBe(adapter);
    });

    it('should return config', () => {
      const limiter = new RateLimiter(adapter, config);

      expect(limiter.getConfig()).toBe(config);
    });
  });
});
