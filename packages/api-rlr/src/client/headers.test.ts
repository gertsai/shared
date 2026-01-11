import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GatewayResponse } from 'moleculer-web';
import { setDraft6Headers, setDraft7Headers } from './headers';
import { LimiterStrategy } from '../utils/types';
import type { RateLimitInfo } from '../utils/types';
import { createMockResponse } from '../utils/test-types';

describe('headers', () => {
  let mockResponse: GatewayResponse;
  let headers: Record<string, string>;

  beforeEach(() => {
    headers = {};
    const response: any = {
      get headersSent() {
        return false;
      },
      setHeader: vi.fn((name: string, value: string | number) => {
        headers[name] = value.toString();
        return response; // Return self for chaining
      }),
    };
    mockResponse = createMockResponse(response);
  });

  describe('setDraft6Headers', () => {
    it('sets all required headers for Draft 6', () => {
      const info = {
        limit: 100,
        timeFrame: 60000,
        totalHits: 25,
        remainingHits: 75,
        expiryTime: 45000,
      } satisfies RateLimitInfo;

      setDraft6Headers(mockResponse, info, 60000);

      expect(headers['X-RateLimit-Policy']).toBe('100;w=60;policy="sliding_window"');
      expect(headers['X-RateLimit-Limit']).toBe('100');
      expect(headers['X-RateLimit-Remaining']).toBe('75');
      expect(headers['X-RateLimit-Retry-After']).toBe('45');
      expect(headers['Retry-After']).toBe('45');
      expect(headers['X-RateLimit-Bucket']).toBeUndefined();
    });

    it('includes bucket ID when provided', () => {
      const info = {
        limit: 50,
        timeFrame: 30000,
        totalHits: 10,
        remainingHits: 40,
        expiryTime: 15000,
        bucketId: 'get:/api/users',
      };

      setDraft6Headers(mockResponse, info, 30000);

      expect(headers['X-RateLimit-Bucket']).toBe('get:/api/users');
    });

    it('sets GCRA strategy in policy header', () => {
      const info = {
        limit: 100,
        timeFrame: 60000,
        totalHits: 1,
        remainingHits: 99,
        expiryTime: 1000,
      };

      setDraft6Headers(mockResponse, info, 60000, LimiterStrategy.GCRA);

      expect(headers['X-RateLimit-Policy']).toBe('100;w=60;policy="gcra"');
    });

    it('calculates reset time correctly', () => {
      const now = Date.now();
      vi.spyOn(Date, 'now').mockReturnValue(now);

      const info = {
        limit: 100,
        timeFrame: 60000,
        totalHits: 100,
        remainingHits: 0,
        expiryTime: 30000,
      } satisfies RateLimitInfo;

      setDraft6Headers(mockResponse, info, 60000);

      const expectedResetEpoch = Math.ceil((now + 30000) / 1000);
      expect(headers['X-RateLimit-Reset']).toBe(expectedResetEpoch.toString());
      expect(headers['X-RateLimit-Retry']).toBe(Math.floor(now + 30000).toString());
    });

    it('rounds retry-after up to nearest second', () => {
      const info = {
        limit: 10,
        timeFrame: 10000,
        totalHits: 10,
        remainingHits: 0,
        expiryTime: 1500, // 1.5 seconds
      };

      setDraft6Headers(mockResponse, info, 10000);

      expect(headers['X-RateLimit-Retry-After']).toBe('2');
      expect(headers['Retry-After']).toBe('2');
    });

    it('does not set headers if already sent', () => {
      const response: any = {
        get headersSent() {
          return true;
        },
        setHeader: vi.fn(() => response), // Return self for chaining
      };
      mockResponse = createMockResponse(response);
      const info = {
        limit: 100,
        timeFrame: 60000,
        totalHits: 25,
        remainingHits: 75,
        expiryTime: 45000,
      } satisfies RateLimitInfo;

      setDraft6Headers(mockResponse, info, 60000);

      expect(mockResponse.setHeader).not.toHaveBeenCalled();
      expect(Object.keys(headers)).toHaveLength(0);
    });
  });

  describe('setDraft7Headers', () => {
    it('sets all required headers for Draft 7', () => {
      const info = {
        limit: 100,
        timeFrame: 60000,
        totalHits: 25,
        remainingHits: 75,
        expiryTime: 45000,
      } satisfies RateLimitInfo;

      setDraft7Headers(mockResponse, info, 60000);

      expect(headers['RateLimit-Policy']).toBe('100;w=60');
      expect(headers['RateLimit']).toBe('limit=100, remaining=75, reset=45');
      expect(headers['X-RateLimit-Bucket']).toBeUndefined();
    });

    it('includes bucket ID when provided', () => {
      const info = {
        limit: 50,
        timeFrame: 30000,
        totalHits: 10,
        remainingHits: 40,
        expiryTime: 15000,
        bucketId: 'post:/api/messages',
      };

      setDraft7Headers(mockResponse, info, 30000);

      expect(headers['X-RateLimit-Bucket']).toBe('post:/api/messages');
    });

    it('calculates reset seconds correctly', () => {
      const info = {
        limit: 10,
        timeFrame: 10000,
        totalHits: 10,
        remainingHits: 0,
        expiryTime: 2500, // 2.5 seconds
      };

      setDraft7Headers(mockResponse, info, 10000);

      // Should round up to 3 seconds
      expect(headers['RateLimit']).toBe('limit=10, remaining=0, reset=3');
    });

    it('does not set headers if already sent', () => {
      const response: any = {
        get headersSent() {
          return true;
        },
        setHeader: vi.fn(() => response), // Return self for chaining
      };
      mockResponse = createMockResponse(response);
      const info = {
        limit: 100,
        timeFrame: 60000,
        totalHits: 25,
        remainingHits: 75,
        expiryTime: 45000,
      } satisfies RateLimitInfo;

      setDraft7Headers(mockResponse, info, 60000);

      expect(mockResponse.setHeader).not.toHaveBeenCalled();
      expect(Object.keys(headers)).toHaveLength(0);
    });

    it('handles zero expiry time', () => {
      const info = {
        limit: 100,
        timeFrame: 60000,
        totalHits: 0,
        remainingHits: 100,
        expiryTime: 0,
      } satisfies RateLimitInfo;

      setDraft7Headers(mockResponse, info, 60000);

      expect(headers['RateLimit']).toBe('limit=100, remaining=100, reset=0');
    });
  });
});
