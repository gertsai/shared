import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  BackoffCalculator,
  withRetry,
  retryAsync,
  createRetryConfig,
  createSimpleRetryConfig,
  sleep,
  isReasonableDelay,
  DEFAULT_RETRY_CONFIG,
  type RetryConfig,
} from './retry';

// Mock retryable error for testing
class MockTimeoutError extends Error {
  readonly timeoutMs: number;
  constructor(message: string, timeoutMs: number) {
    super(message);
    this.name = 'TimeoutError';
    this.timeoutMs = timeoutMs;
  }
  isRetryable(): boolean {
    return true;
  }
}

class MockRateLimitError extends Error {
  readonly retryAfterMs?: number;
  constructor(message: string, retryAfterMs?: number) {
    super(message);
    this.name = 'RateLimitError';
    this.retryAfterMs = retryAfterMs;
  }
  isRetryable(): boolean {
    return true;
  }
}

class MockValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
  isRetryable(): boolean {
    return false;
  }
}

describe('BackoffCalculator', () => {
  it('should calculate exponential delays', () => {
    const calculator = new BackoffCalculator({
      baseDelay: 100,
      maxDelay: 10000,
      backoffMultiplier: 2,
      jitter: false,
    });

    expect(calculator.calculateDelay(0)).toBe(100);
    expect(calculator.calculateDelay(1)).toBe(200);
    expect(calculator.calculateDelay(2)).toBe(400);
    expect(calculator.calculateDelay(3)).toBe(800);
  });

  it('should cap delay at maxDelay', () => {
    const calculator = new BackoffCalculator({
      baseDelay: 100,
      maxDelay: 500,
      backoffMultiplier: 2,
      jitter: false,
    });

    expect(calculator.calculateDelay(10)).toBe(500); // Would be 102400, capped at 500
  });

  it('should add jitter when enabled', () => {
    const calculator = new BackoffCalculator({
      baseDelay: 1000,
      maxDelay: 10000,
      backoffMultiplier: 2,
      jitter: true,
    });

    const delays = new Set<number>();
    for (let i = 0; i < 10; i++) {
      delays.add(calculator.calculateDelay(0));
    }

    // With jitter, we should get different values (with high probability)
    expect(delays.size).toBeGreaterThan(1);

    // All delays should be within ±10% of base
    for (const delay of delays) {
      expect(delay).toBeGreaterThanOrEqual(900);
      expect(delay).toBeLessThanOrEqual(1100);
    }
  });

  it('should throw on invalid config', () => {
    expect(() => new BackoffCalculator({
      baseDelay: -1,
      maxDelay: 1000,
      backoffMultiplier: 2,
      jitter: false,
    })).toThrow('baseDelay must be positive');

    expect(() => new BackoffCalculator({
      baseDelay: 100,
      maxDelay: 0,
      backoffMultiplier: 2,
      jitter: false,
    })).toThrow('maxDelay must be positive');

    expect(() => new BackoffCalculator({
      baseDelay: 100,
      maxDelay: 1000,
      backoffMultiplier: 0.5,
      jitter: false,
    })).toThrow('backoffMultiplier must be >= 1');
  });
});

describe('withRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should succeed on first try', async () => {
    const fn = vi.fn().mockResolvedValue('success');

    const promise = withRetry(fn, { maxAttempts: 3 });
    vi.runAllTimers();
    const result = await promise;

    expect(result.success).toBe(true);
    expect(result.value).toBe('success');
    expect(result.attempts).toBe(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on transient errors', async () => {
    vi.useRealTimers(); // Use real timers for this test

    const fn = vi.fn()
      .mockRejectedValueOnce(new MockTimeoutError('Timeout', 1000))
      .mockRejectedValueOnce(new MockTimeoutError('Timeout', 1000))
      .mockResolvedValue('success');

    const result = await withRetry(fn, { maxAttempts: 5, baseDelay: 10, jitter: false });

    expect(result.success).toBe(true);
    expect(result.value).toBe('success');
    expect(result.attempts).toBe(3);
    expect(fn).toHaveBeenCalledTimes(3);

    vi.useFakeTimers(); // Restore fake timers
  });

  it('should fail after max attempts', async () => {
    vi.useRealTimers(); // Use real timers for this test

    const error = new MockTimeoutError('Persistent timeout', 1000);
    const fn = vi.fn().mockRejectedValue(error);

    const result = await withRetry(fn, { maxAttempts: 3, baseDelay: 10, jitter: false });

    expect(result.success).toBe(false);
    expect(result.error).toBe(error);
    expect(result.attempts).toBe(3);
    expect(fn).toHaveBeenCalledTimes(3);

    vi.useFakeTimers(); // Restore fake timers
  });

  it('should not retry non-retryable errors', async () => {
    const error = new MockValidationError('Invalid input');
    const fn = vi.fn().mockRejectedValue(error);

    const promise = withRetry(fn, { maxAttempts: 5 });
    vi.runAllTimers();
    const result = await promise;

    expect(result.success).toBe(false);
    expect(result.error).toBe(error);
    expect(result.attempts).toBe(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should call onRetry callback', async () => {
    const onRetry = vi.fn();
    const error = new MockTimeoutError('Timeout', 1000);
    const fn = vi.fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValue('success');

    const promise = withRetry(fn, {
      maxAttempts: 3,
      baseDelay: 100,
      jitter: false,
      onRetry,
    });

    await vi.advanceTimersByTimeAsync(100);
    await promise;

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(1, error, 100);
  });

  it('should use custom shouldRetry function', async () => {
    vi.useRealTimers(); // Use real timers for this test

    const shouldRetry = vi.fn().mockReturnValue(true);
    const error = new MockValidationError('Custom retry');
    const fn = vi.fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValue('success');

    await withRetry(fn, {
      maxAttempts: 3,
      baseDelay: 10,
      jitter: false,
      shouldRetry,
    });

    expect(shouldRetry).toHaveBeenCalledWith(error, 1);

    vi.useFakeTimers(); // Restore fake timers
  });

  it('should handle RateLimitError with custom retry delay', async () => {
    vi.useRealTimers(); // Use real timers for this test

    const fn = vi.fn()
      .mockRejectedValueOnce(new MockRateLimitError('Rate limited', 5000))
      .mockResolvedValue('success');

    const result = await withRetry(fn, { maxAttempts: 3, baseDelay: 10, jitter: false });

    expect(result.success).toBe(true);
    expect(fn).toHaveBeenCalledTimes(2);

    vi.useFakeTimers(); // Restore fake timers
  });
});

describe('retryAsync', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return value on success', async () => {
    const fn = vi.fn().mockResolvedValue({ data: 'test' });

    const promise = retryAsync(fn);
    vi.runAllTimers();
    const result = await promise;

    expect(result).toEqual({ data: 'test' });
  });

  it('should throw on failure', async () => {
    const error = new MockValidationError('Invalid');
    const fn = vi.fn().mockRejectedValue(error);

    const promise = retryAsync(fn, { maxAttempts: 2 });

    await expect(promise).rejects.toThrow('Invalid');
  });
});

describe('createRetryConfig', () => {
  it('should return defaults when no overrides', () => {
    const config = createRetryConfig();
    expect(config).toEqual(DEFAULT_RETRY_CONFIG);
  });

  it('should merge overrides with defaults', () => {
    const config = createRetryConfig({ maxAttempts: 5, baseDelay: 200 });

    expect(config.maxAttempts).toBe(5);
    expect(config.baseDelay).toBe(200);
    expect(config.maxDelay).toBe(DEFAULT_RETRY_CONFIG.maxDelay);
    expect(config.backoffMultiplier).toBe(DEFAULT_RETRY_CONFIG.backoffMultiplier);
  });
});

describe('createSimpleRetryConfig', () => {
  it('should create config with maxAttempts and baseDelay', () => {
    const config = createSimpleRetryConfig(5, 200);

    expect(config.maxAttempts).toBe(5);
    expect(config.baseDelay).toBe(200);
  });

  it('should use default baseDelay', () => {
    const config = createSimpleRetryConfig(3);

    expect(config.maxAttempts).toBe(3);
    expect(config.baseDelay).toBe(100);
  });
});

describe('sleep', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should wait for specified time', async () => {
    const start = Date.now();
    const promise = sleep(1000);

    await vi.advanceTimersByTimeAsync(500);
    expect(Date.now() - start).toBe(500);

    await vi.advanceTimersByTimeAsync(500);
    await promise;
    expect(Date.now() - start).toBe(1000);
  });
});

describe('isReasonableDelay', () => {
  it('should accept delays within range', () => {
    expect(isReasonableDelay(0)).toBe(true);
    expect(isReasonableDelay(1000)).toBe(true);
    expect(isReasonableDelay(60000)).toBe(true);
  });

  it('should reject negative delays', () => {
    expect(isReasonableDelay(-1)).toBe(false);
  });

  it('should reject delays exceeding max', () => {
    expect(isReasonableDelay(60001)).toBe(false);
    expect(isReasonableDelay(100000)).toBe(false);
  });

  it('should use custom max', () => {
    expect(isReasonableDelay(5000, 10000)).toBe(true);
    expect(isReasonableDelay(15000, 10000)).toBe(false);
  });
});

describe('Integration with error types', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should retry TimeoutError', async () => {
    vi.useRealTimers(); // Use real timers for this test

    const fn = vi.fn()
      .mockRejectedValueOnce(new MockTimeoutError('Timeout', 5000))
      .mockResolvedValue('done');

    const result = await withRetry(fn, { maxAttempts: 3, baseDelay: 10, jitter: false });

    expect(result.success).toBe(true);
    expect(result.attempts).toBe(2);

    vi.useFakeTimers(); // Restore fake timers
  });

  it('should retry RateLimitError', async () => {
    vi.useRealTimers(); // Use real timers for this test

    const fn = vi.fn()
      .mockRejectedValueOnce(new MockRateLimitError('Too many requests', 1000))
      .mockResolvedValue('done');

    const result = await withRetry(fn, { maxAttempts: 3, baseDelay: 10, jitter: false });

    expect(result.success).toBe(true);
    expect(result.attempts).toBe(2);

    vi.useFakeTimers(); // Restore fake timers
  });

  it('should NOT retry ValidationError', async () => {
    const fn = vi.fn().mockRejectedValue(new MockValidationError('Bad input'));

    const promise = withRetry(fn, { maxAttempts: 3 });
    vi.runAllTimers();
    const result = await promise;

    expect(result.success).toBe(false);
    expect(result.attempts).toBe(1);
  });
});
