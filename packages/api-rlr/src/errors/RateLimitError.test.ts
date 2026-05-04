import { describe, expect, it, vi } from 'vitest';
import { RateLimitError } from './RateLimitError';

// Mock the Moleculer Errors module
vi.mock('moleculer', () => ({
  Errors: {
    MoleculerError: class MoleculerError extends Error {
      code: number;
      type: string;
      data: unknown;

      constructor(message: string, code: number, type: string, data: unknown) {
        super(message);
        this.name = 'MoleculerError';
        this.code = code;
        this.type = type;
        this.data = data;
      }
    },
  },
}));

describe('RateLimitError', () => {
  it('creates error with default message and 429 status', () => {
    const error = new RateLimitError();

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('Rate limit exceeded');
    expect(error.code).toBe(429);
    expect(error.type).toBe('RateLimitError');
  });

  it('accepts custom data', () => {
    const customData = {
      type: 'rate_limit_error' as const,
      message: 'Too many requests from this IP',
      remaining: 0,
      resetAt: Date.now() + 60000,
    };

    const error = new RateLimitError(customData);

    expect(error.data).toEqual(customData);
    expect(error.message).toBe('Rate limit exceeded');
    expect(error.code).toBe(429);
  });

  it('uses empty object as default data', () => {
    const error = new RateLimitError();

    expect(error.data).toEqual({});
  });

  it('preserves error type information', () => {
    const error = new RateLimitError({
      type: 'rate_limit_error' as const,
      message: 'API rate limit exceeded',
    });

    expect(error.type).toBe('RateLimitError');
    expect(error.data).toHaveProperty('type', 'rate_limit_error');
    expect(error.data).toHaveProperty('message', 'API rate limit exceeded');
  });

  it('can be caught as Error', () => {
    const throwError = () => {
      throw new RateLimitError();
    };

    expect(throwError).toThrow(Error);
    expect(throwError).toThrow(RateLimitError);
  });

  it('maintains proper error stack trace', () => {
    const error = new RateLimitError();

    expect(error.stack).toBeDefined();
    expect(error.stack).toContain('RateLimitError');
  });
});
