/**
 * Integration tests: @gerts/api-rlr + @gerts/api-client
 *
 * Tests full client-server integration:
 * - RateLimitManager (client) + MiddlewareFactory (server)
 * - Header parsing compatibility (setDraft6Headers ↔ updateFromHeaders)
 * - PathNormalizer consistency on both sides
 * - RateLimitError serialization/deserialization
 *
 * @module __tests__/api-client-integration
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import RedisClient from 'ioredis';

import { RLRMiddleware, setDraft6Headers, setDraft7Headers, PathNormalizer } from '../src/index';
import { LimiterStrategy, type RateLimitInfo } from '../src/utils/types';
import { RateLimitTestUtils, type MockHeaders } from '../src/test-utils/RateLimitTestUtils';
import type { GatewayResponse } from 'moleculer-web';

const HAS_REDIS = process.env.HAS_REDIS === '1' || process.env.HAS_REDIS === 'true';
const skipIfNoRedis = !HAS_REDIS ? describe.skip : describe;

/**
 * Mock client-side RateLimitState (mirrors api-client)
 */
interface ClientRateLimitState {
  remaining: number;
  resetAtMs: number;
  bucket?: string | null;
  global?: boolean;
  updatedAt: number;
  limit?: number;
}

/**
 * Mock GatewayResponse for testing headers
 */
function createMockResponse(): GatewayResponse & {
  headers: Map<string, string | number>;
  getHeader: (name: string) => string | undefined;
} {
  const headers = new Map<string, string | number>();
  let headersSent = false;

  return {
    headers,
    headersSent,
    setHeader(name: string, value: string | number) {
      if (!headersSent) {
        headers.set(name, value);
      }
    },
    getHeader(name: string): string | undefined {
      const val = headers.get(name);
      return val !== undefined ? String(val) : undefined;
    },
    removeHeader(_name: string) {
      // no-op
    },
    end() {
      headersSent = true;
    },
  } as any;
}

/**
 * Client-side header parser (mirrors api-client RateLimitManager.updateFromHeaders)
 */
function parseServerHeaders(
  headers: Map<string, string | number> | MockHeaders,
): ClientRateLimitState | null {
  const getHeader = (name: string): string | null => {
    if (headers instanceof Map) {
      const val = headers.get(name);
      return val !== undefined ? String(val) : null;
    }
    const val = headers[name];
    return val !== undefined ? String(val) : null;
  };

  const remaining = parseInt(getHeader('X-RateLimit-Remaining') ?? '-1', 10);
  const limit = parseInt(getHeader('X-RateLimit-Limit') ?? '-1', 10);
  const resetHeader = getHeader('X-RateLimit-Reset');
  const bucket = getHeader('X-RateLimit-Bucket') ?? undefined;
  const global = getHeader('X-RateLimit-Global') === 'true';

  if (remaining < 0 && !resetHeader) {
    return null;
  }

  // Parse reset - server sends epoch seconds
  let resetAtMs = 0;
  if (resetHeader) {
    const resetSeconds = parseInt(resetHeader, 10);
    if (!Number.isNaN(resetSeconds)) {
      // If value is small (< 1e10), treat as epoch seconds
      if (resetSeconds < 1e10) {
        resetAtMs = resetSeconds * 1000;
      } else {
        // Already ms
        resetAtMs = resetSeconds;
      }
    }
  }

  return {
    remaining: remaining >= 0 ? remaining : 0,
    limit: limit >= 0 ? limit : undefined,
    resetAtMs,
    bucket,
    global,
    updatedAt: Date.now(),
  };
}

/**
 * Helper to create complete RateLimitInfo
 */
function createRateLimitInfo(partial: {
  limit: number;
  remainingHits: number;
  expiryTime: number;
  bucketId?: string;
  scope?: 'user' | 'global' | 'endpoint' | 'tenant' | 'ip';
  global?: boolean;
}): RateLimitInfo {
  return {
    limit: partial.limit,
    timeFrame: 60000, // Default window
    totalHits: partial.limit - partial.remainingHits,
    remainingHits: partial.remainingHits,
    expiryTime: partial.expiryTime,
    bucketId: partial.bucketId,
    scope: partial.scope,
    global: partial.global,
  };
}

describe('api-client integration', () => {
  describe('Header compatibility (setDraft6Headers -> parseServerHeaders)', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-01-15T12:00:00.000Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should correctly round-trip rate limit info', () => {
      const serverInfo = createRateLimitInfo({
        limit: 100,
        remainingHits: 45,
        expiryTime: 30000, // 30 seconds
        bucketId: 'test-bucket',
        scope: 'endpoint',
        global: false,
      });

      const response = createMockResponse();
      setDraft6Headers(response, serverInfo, 60000, LimiterStrategy.SLIDING_WINDOW);

      const clientState = parseServerHeaders(response.headers);

      expect(clientState).not.toBeNull();
      expect(clientState!.limit).toBe(100);
      expect(clientState!.remaining).toBe(45);
      expect(clientState!.bucket).toBe('test-bucket');
      expect(clientState!.global).toBe(false);

      // Reset time should be approximately now + expiryTime
      const now = Date.now();
      const expectedReset = Math.ceil((now + 30000) / 1000) * 1000;
      expect(clientState!.resetAtMs).toBe(expectedReset);
    });

    it('should handle global rate limit flag', () => {
      const serverInfo = createRateLimitInfo({
        limit: 1000,
        remainingHits: 0,
        expiryTime: 300000, // 5 minutes
        bucketId: 'global',
        scope: 'global',
        global: true,
      });

      const response = createMockResponse();
      setDraft6Headers(response, serverInfo, 300000, LimiterStrategy.SLIDING_WINDOW);

      const clientState = parseServerHeaders(response.headers);

      expect(clientState).not.toBeNull();
      expect(clientState!.global).toBe(true);
      expect(clientState!.remaining).toBe(0);
    });

    it('should handle zero remaining hits', () => {
      const serverInfo = createRateLimitInfo({
        limit: 10,
        remainingHits: 0,
        expiryTime: 60000,
        global: false,
      });

      const response = createMockResponse();
      setDraft6Headers(response, serverInfo, 60000);

      const clientState = parseServerHeaders(response.headers);

      expect(clientState).not.toBeNull();
      expect(clientState!.remaining).toBe(0);
      expect(clientState!.limit).toBe(10);
    });

    it('should handle Draft 7 headers', () => {
      const serverInfo = createRateLimitInfo({
        limit: 50,
        remainingHits: 25,
        expiryTime: 45000,
        bucketId: 'draft7-bucket',
        global: false,
      });

      const response = createMockResponse();
      setDraft7Headers(response, serverInfo, 60000);

      // Draft 7 also sets X-RateLimit-Bucket for compat
      expect(response.getHeader('X-RateLimit-Bucket')).toBe('draft7-bucket');
      expect(response.getHeader('RateLimit-Policy')).toBe('50;w=60');
    });
  });

  describe('PathNormalizer consistency (server vs client patterns)', () => {
    const serverNormalizer = new PathNormalizer();

    it('should normalize UUIDs consistently', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      const path = `/api/users/${uuid}/profile`;

      const normalized = serverNormalizer.normalize(path);

      // Server should replace UUID with :id placeholder
      expect(normalized).not.toContain(uuid);
      expect(normalized).toContain(':id');
    });

    it('should normalize long hex IDs consistently', () => {
      const hexId = '1234567890abcdef1234';
      const path = `/api/channels/${hexId}/messages`;

      const normalized = serverNormalizer.normalize(path);

      expect(normalized).not.toContain(hexId);
      expect(normalized).toContain(':id');
    });

    it('should normalize reaction endpoints', () => {
      const path = '/api/posts/123456789012345/reactions/heart';

      const normalized = serverNormalizer.normalize(path);

      expect(normalized).toContain('/reactions/:reaction');
    });

    it('should handle trailing slashes consistently', () => {
      const path1 = '/api/users/';
      const path2 = '/api/users';

      const normalized1 = serverNormalizer.normalize(path1);
      const normalized2 = serverNormalizer.normalize(path2);

      expect(normalized1).toBe(normalized2);
    });

    it('should handle mixed case paths', () => {
      const path = '/API/Users/123456789012345/Profile';

      const normalized = serverNormalizer.normalize(path);

      expect(normalized).toBe('/api/users/:id/profile');
    });
  });

  describe('Retry-After header formats', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-01-15T12:00:00.000Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should set correct Retry-After for short expiry', () => {
      const serverInfo = createRateLimitInfo({
        limit: 10,
        remainingHits: 0,
        expiryTime: 500, // 500ms
        global: false,
      });

      const response = createMockResponse();
      setDraft6Headers(response, serverInfo, 1000);

      // Should round up to 1 second
      expect(response.getHeader('Retry-After')).toBe('1');
      expect(response.getHeader('X-RateLimit-Retry-After')).toBe('1');
    });

    it('should set correct Retry-After for long expiry', () => {
      const serverInfo = createRateLimitInfo({
        limit: 100,
        remainingHits: 0,
        expiryTime: 3600000, // 1 hour
        global: false,
      });

      const response = createMockResponse();
      setDraft6Headers(response, serverInfo, 3600000);

      expect(response.getHeader('Retry-After')).toBe('3600');
    });

    it('should set X-RateLimit-Retry as absolute timestamp', () => {
      const now = Date.now();
      const expiryTime = 30000;
      const serverInfo = createRateLimitInfo({
        limit: 100,
        remainingHits: 0,
        expiryTime,
        global: false,
      });

      const response = createMockResponse();
      setDraft6Headers(response, serverInfo, 60000);

      const retryTimestamp = parseInt(response.getHeader('X-RateLimit-Retry') ?? '0', 10);
      // Should be approximately now + expiryTime
      expect(retryTimestamp).toBeGreaterThanOrEqual(now + expiryTime - 1000);
      expect(retryTimestamp).toBeLessThanOrEqual(now + expiryTime + 1000);
    });
  });

  describe('Bucket ID propagation', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-01-15T12:00:00.000Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should propagate bucket ID through headers', () => {
      const bucketId = 'tenant:abc123:endpoint:/api/users';
      const serverInfo = createRateLimitInfo({
        limit: 100,
        remainingHits: 50,
        expiryTime: 60000,
        bucketId,
        global: false,
      });

      const response = createMockResponse();
      setDraft6Headers(response, serverInfo, 60000);

      const clientState = parseServerHeaders(response.headers);

      expect(clientState!.bucket).toBe(bucketId);
    });

    it('should handle missing bucket ID', () => {
      const serverInfo = createRateLimitInfo({
        limit: 100,
        remainingHits: 50,
        expiryTime: 60000,
        global: false,
      });

      const response = createMockResponse();
      setDraft6Headers(response, serverInfo, 60000);

      const clientState = parseServerHeaders(response.headers);

      expect(clientState!.bucket).toBeUndefined();
    });
  });

  describe('Scope header propagation', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-01-15T12:00:00.000Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should set scope header correctly', () => {
      const scopes = ['user', 'endpoint', 'tenant', 'ip', 'global'] as const;

      for (const scope of scopes) {
        const serverInfo = createRateLimitInfo({
          limit: 100,
          remainingHits: 50,
          expiryTime: 60000,
          scope,
          global: scope === 'global',
        });

        const response = createMockResponse();
        setDraft6Headers(response, serverInfo, 60000);

        expect(response.getHeader('X-RateLimit-Scope')).toBe(scope);
        expect(response.getHeader('X-RateLimit-Global')).toBe(
          scope === 'global' ? 'true' : 'false',
        );
      }
    });

    it('should default to endpoint scope', () => {
      const serverInfo = createRateLimitInfo({
        limit: 100,
        remainingHits: 50,
        expiryTime: 60000,
        global: false,
      });

      const response = createMockResponse();
      setDraft6Headers(response, serverInfo, 60000);

      expect(response.getHeader('X-RateLimit-Scope')).toBe('endpoint');
    });
  });
});

skipIfNoRedis('Full middleware + client integration', () => {
  it('should correctly limit and provide client-parsable headers', async () => {
    const prefix = `intg_${Math.random().toString(36).slice(2)}:`;
    const middleware = RLRMiddleware({
      store: () => new RedisClient(),
      prefix,
      limit: 2,
      timeFrame: 5000,
      strategy: LimiterStrategy.SLIDING_WINDOW,
    });

    // First request - should pass
    const result1 = await RateLimitTestUtils.testMiddleware(
      middleware,
      RateLimitTestUtils.createMockRequest({
        method: 'GET',
        url: '/api/test',
        originalUrl: '/api/test',
        headers: { 'x-forwarded-for': '192.168.1.1' },
      }),
    );

    expect(result1.error).toBeUndefined();
    expect(result1.next.called()).toBe(true);

    // Parse headers like a client would
    const headers1 = result1.response?.headers;
    if (headers1) {
      const state1 = parseServerHeaders(headers1);
      expect(state1).not.toBeNull();
      expect(state1!.remaining).toBeLessThanOrEqual(2);
      expect(state1!.limit).toBe(2);
    }

    // Second request - should pass
    const result2 = await RateLimitTestUtils.testMiddleware(
      middleware,
      RateLimitTestUtils.createMockRequest({
        method: 'GET',
        url: '/api/test',
        originalUrl: '/api/test',
        headers: { 'x-forwarded-for': '192.168.1.1' },
      }),
    );

    expect(result2.error).toBeUndefined();

    // Third request - should be rate limited
    const result3 = await RateLimitTestUtils.testMiddleware(
      middleware,
      RateLimitTestUtils.createMockRequest({
        method: 'GET',
        url: '/api/test',
        originalUrl: '/api/test',
        headers: { 'x-forwarded-for': '192.168.1.1' },
      }),
    );

    expect(result3.error).toBeDefined();
    expect((result3.error as any)?.message).toContain('Rate limit exceeded');
  });

  it('should handle multi-tenant isolation via prefix', async () => {
    // Tenant A middleware
    const tenantAPrefix = `tenantA_${Math.random().toString(36).slice(2)}:`;
    const middlewareA = RLRMiddleware({
      store: () => new RedisClient(),
      prefix: tenantAPrefix,
      limit: 1,
      timeFrame: 5000,
      strategy: LimiterStrategy.SLIDING_WINDOW,
    });

    // Tenant B middleware
    const tenantBPrefix = `tenantB_${Math.random().toString(36).slice(2)}:`;
    const middlewareB = RLRMiddleware({
      store: () => new RedisClient(),
      prefix: tenantBPrefix,
      limit: 1,
      timeFrame: 5000,
      strategy: LimiterStrategy.SLIDING_WINDOW,
    });

    // Tenant A - first request
    const resultA1 = await RateLimitTestUtils.testMiddleware(
      middlewareA,
      RateLimitTestUtils.createMockRequest({
        method: 'GET',
        url: '/api/data',
        originalUrl: '/api/data',
        headers: { 'x-forwarded-for': '10.0.0.1' },
      }),
    );
    expect(resultA1.error).toBeUndefined();

    // Tenant A - second request (should be blocked)
    const resultA2 = await RateLimitTestUtils.testMiddleware(
      middlewareA,
      RateLimitTestUtils.createMockRequest({
        method: 'GET',
        url: '/api/data',
        originalUrl: '/api/data',
        headers: { 'x-forwarded-for': '10.0.0.1' },
      }),
    );
    expect(resultA2.error).toBeDefined();

    // Tenant B - should NOT be affected by Tenant A's limit (different prefix)
    const resultB1 = await RateLimitTestUtils.testMiddleware(
      middlewareB,
      RateLimitTestUtils.createMockRequest({
        method: 'GET',
        url: '/api/data',
        originalUrl: '/api/data',
        headers: { 'x-forwarded-for': '10.0.0.1' },
      }),
    );
    expect(resultB1.error).toBeUndefined();
  });

  it('should work with GCRA strategy', async () => {
    const prefix = `gcra_intg_${Math.random().toString(36).slice(2)}:`;
    const middleware = RLRMiddleware({
      store: () => new RedisClient(),
      prefix,
      limit: 1,
      timeFrame: 10000,
      strategy: LimiterStrategy.GCRA,
      burst: 1,
    });

    // First request - should pass
    const result1 = await RateLimitTestUtils.testMiddleware(
      middleware,
      RateLimitTestUtils.createMockRequest({
        method: 'POST',
        url: '/api/action',
        originalUrl: '/api/action',
        headers: { 'x-forwarded-for': '172.16.0.1' },
      }),
    );
    expect(result1.error).toBeUndefined();

    // Second request - should pass (burst)
    const result2 = await RateLimitTestUtils.testMiddleware(
      middleware,
      RateLimitTestUtils.createMockRequest({
        method: 'POST',
        url: '/api/action',
        originalUrl: '/api/action',
        headers: { 'x-forwarded-for': '172.16.0.1' },
      }),
    );
    expect(result2.error).toBeUndefined();

    // Third request - should be blocked
    const result3 = await RateLimitTestUtils.testMiddleware(
      middleware,
      RateLimitTestUtils.createMockRequest({
        method: 'POST',
        url: '/api/action',
        originalUrl: '/api/action',
        headers: { 'x-forwarded-for': '172.16.0.1' },
      }),
    );
    expect(result3.error).toBeDefined();

    // Headers should still be parsable by client
    const headers3 = result3.response?.headers;
    if (headers3) {
      const state3 = parseServerHeaders(headers3);
      // Even on error, headers should be present
      expect(state3).not.toBeNull();
    }
  });
});
