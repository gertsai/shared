/**
 * Testing utilities for rate limiter
 * Provides helpers for testing rate limiting functionality
 */

import type { RateLimitRequest } from '../client/rlr';
import type { ClientRateLimitInfo, GatewayResponse, IncomingRequest } from '../utils/types';

export interface SimulationResult {
  key: string;
  result: ClientRateLimitInfo;
  allowed: boolean;
  timestamp: number;
}

export interface MockHeaders {
  [key: string]: string | number;
}

export class RateLimitTestUtils {
  /**
   * Simulate multiple requests to test rate limiting
   */
  static async simulateRequests(
    limiter: RateLimitRequest,
    count: number,
    delay: number = 0,
    keyPrefix: string = 'test-key',
  ): Promise<SimulationResult[]> {
    const results: SimulationResult[] = [];

    for (let i = 0; i < count; i++) {
      if (delay > 0 && i > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      const key = `${keyPrefix}-${i}`;
      const timestamp = Date.now();
      const result = await limiter.incrementSW(key, timestamp);

      results.push({
        key,
        result,
        allowed: result.remainingHits > 0,
        timestamp,
      });
    }

    return results;
  }

  /**
   * Simulate burst requests (all at once)
   */
  static async simulateBurst(
    limiter: RateLimitRequest,
    count: number,
    key: string = 'burst-test',
  ): Promise<SimulationResult[]> {
    const timestamp = Date.now();
    const promises = Array.from({ length: count }, async () => {
      const result = await limiter.incrementSW(key, timestamp);
      return {
        key,
        result,
        allowed: result.remainingHits > 0,
        timestamp,
      };
    });

    return Promise.all(promises);
  }

  /**
   * Create a mock request object
   */
  static createMockRequest(overrides?: Partial<IncomingRequest>): IncomingRequest {
    return {
      method: 'GET',
      url: '/test',
      originalUrl: '/test',
      headers: {
        'x-forwarded-for': '127.0.0.1',
        'user-agent': 'test-agent',
      },
      ip: '127.0.0.1',
      connection: {
        remoteAddress: '127.0.0.1',
      },
      ...overrides,
    } as IncomingRequest;
  }

  /**
   * Create a mock response object with header tracking
   */
  static createMockResponse(): GatewayResponse & { headers: MockHeaders } {
    const headers: MockHeaders = {};

    const resp: Partial<GatewayResponse> & { headers: MockHeaders } = {
      headers,
      headersSent: false,
      setHeader: (name: string, value: string | number): void => {
        headers[name] = value;
      },
      getHeader: (name: string): string | number | undefined => headers[name],
      getHeaders: (): Record<string, string | number> => headers,
      removeHeader: (name: string): void => {
        delete headers[name];
      },
    } as unknown as GatewayResponse & { headers: MockHeaders };

    // Attach optional helpers for compatibility
    (
      resp as unknown as {
        writeHead: (
          statusCode: number,
          statusMessage?: string,
          headers?: Record<string, string | number>,
        ) => void;
        end: () => void;
        write: () => boolean;
      }
    ).writeHead = (
      _statusCode: number,
      _statusMessage?: string,
      hdrs?: Record<string, string | number>,
    ): void => {
      if (hdrs) {
        Object.assign(headers, hdrs);
      }
    };

    (resp as unknown as { end: () => void }).end = (): void => {};
    (resp as unknown as { write: () => boolean }).write = (): boolean => true;

    return resp as GatewayResponse & { headers: MockHeaders };
  }

  /**
   * Create a mock next function for middleware testing
   */
  static createMockNext(): ((error?: unknown) => void) & {
    mock: { calls: unknown[][]; lastCall: unknown };
    called: () => boolean;
    calledWith: (error?: unknown) => boolean;
    calledWithError: () => boolean;
    getError: () => Error | undefined;
  } {
    const calls: unknown[][] = [];
    const fn = ((error?: unknown) => {
      calls.push([error]);
    }) as ((error?: unknown) => void) & {
      mock: { calls: unknown[][]; lastCall: unknown };
      called: () => boolean;
      calledWith: (error?: unknown) => boolean;
      calledWithError: () => boolean;
      getError: () => Error | undefined;
    };

    fn.mock = {
      calls,
      get lastCall(): unknown {
        return calls.length ? calls[calls.length - 1]?.[0] : undefined;
      },
    } as any;

    fn.called = () => calls.length > 0;
    fn.calledWith = (error?: unknown) => calls.some((call) => call[0] === error);
    fn.calledWithError = () => calls.some((call) => call[0] instanceof Error);
    fn.getError = () => {
      const errorCall = calls.find((call) => call[0] instanceof Error);
      return (errorCall?.[0] as Error | undefined) ?? undefined;
    };

    return fn;
  }

  /**
   * Validate rate limit headers
   * Returns validation results for use in tests
   */
  static validateRateLimitHeaders(
    response: GatewayResponse & { headers: MockHeaders },
    expected: {
      limit?: number;
      remaining?: number;
      reset?: number;
      policy?: string;
    },
  ): { valid: boolean; errors: string[] } {
    const headers = response.headers;
    const errors: string[] = [];

    if (expected.limit !== undefined) {
      const limitHeader = headers['X-RateLimit-Limit'] || headers['RateLimit'];
      if (!limitHeader) {
        errors.push('Limit header not found');
      } else if (typeof limitHeader === 'string' && limitHeader.includes(',')) {
        // Draft 7 format
        if (!limitHeader.includes(`limit=${expected.limit}`)) {
          errors.push(`Expected limit=${expected.limit} in header, got ${limitHeader}`);
        }
      } else if (Number(limitHeader) !== expected.limit) {
        errors.push(`Expected limit ${expected.limit}, got ${limitHeader}`);
      }
    }

    if (expected.remaining !== undefined) {
      const remainingHeader = headers['X-RateLimit-Remaining'] || headers['RateLimit'];
      if (!remainingHeader) {
        errors.push('Remaining header not found');
      } else if (typeof remainingHeader === 'string' && remainingHeader.includes(',')) {
        // Draft 7 format
        if (!remainingHeader.includes(`remaining=${expected.remaining}`)) {
          errors.push(`Expected remaining=${expected.remaining} in header, got ${remainingHeader}`);
        }
      } else if (Number(remainingHeader) !== expected.remaining) {
        errors.push(`Expected remaining ${expected.remaining}, got ${remainingHeader}`);
      }
    }

    if (expected.reset !== undefined) {
      const resetHeader = headers['X-RateLimit-Reset'];
      if (!resetHeader) {
        errors.push('Reset header not found');
      } else if (Number(resetHeader) <= 0) {
        errors.push(`Invalid reset value: ${resetHeader}`);
      }
    }

    if (expected.policy !== undefined) {
      if (headers['X-RateLimit-Policy'] !== expected.policy) {
        errors.push(`Expected policy ${expected.policy}, got ${headers['X-RateLimit-Policy']}`);
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Wait for rate limit window to reset
   */
  static async waitForReset(timeFrame: number, buffer: number = 100): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, timeFrame + buffer));
  }

  /**
   * Create a test scenario for middleware
   */
  static async testMiddleware(
    middleware: (req: IncomingRequest, res: GatewayResponse, next?: any) => Promise<void>,
    request: IncomingRequest = RateLimitTestUtils.createMockRequest(),
  ): Promise<{
    request: IncomingRequest;
    response: GatewayResponse & { headers: MockHeaders };
    next: any;
    error?: Error;
  }> {
    const response = RateLimitTestUtils.createMockResponse();
    const next = RateLimitTestUtils.createMockNext();

    try {
      await middleware(request, response, next);
    } catch (error) {
      return { request, response, next, error: error as Error };
    }

    return { request, response, next, error: next.getError() || undefined };
  }

  /**
   * Generate random IP addresses for testing
   */
  static generateIPs(count: number): string[] {
    return Array.from({ length: count }, () => {
      const octet1 = Math.floor(Math.random() * 255);
      const octet2 = Math.floor(Math.random() * 255);
      const octet3 = Math.floor(Math.random() * 255);
      const octet4 = Math.floor(Math.random() * 255);
      return `${octet1}.${octet2}.${octet3}.${octet4}`;
    });
  }

  /**
   * Create a batch of requests with different IPs
   */
  static createRequestBatch(
    count: number,
    baseOverrides?: Partial<IncomingRequest>,
  ): IncomingRequest[] {
    const ips = RateLimitTestUtils.generateIPs(count);

    return ips.map((ip) => {
      const overrides: Partial<IncomingRequest> = {
        ...baseOverrides,
        headers: {
          ...(baseOverrides?.headers as Record<string, string> | undefined),
          'x-forwarded-for': ip,
        },
      };
      (overrides as unknown as { ip?: string }).ip = ip;
      return RateLimitTestUtils.createMockRequest(overrides);
    });
  }
}
