/**
 * @gerts/core - Timeout Utilities Tests
 *
 * Uses real timers with minimal delays due to vitest fake timer issues.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  withTimeout,
  createTimeoutController,
  raceWithTimeout,
  allWithTimeouts,
  deadline,
  isTimeoutError,
} from './timeout';

// =============================================================================
// Test Helpers
// =============================================================================

/**
 * Create a promise that resolves after delay.
 */
function delay<T>(ms: number, value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

/**
 * Create a promise that rejects after delay.
 */
function delayReject(ms: number, error: Error): Promise<never> {
  return new Promise((_, reject) => setTimeout(() => reject(error), ms));
}

/**
 * Check if error looks like TimeoutError (duck typing for vitest issues).
 */
function looksLikeTimeoutError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.name === 'TimeoutError' &&
    'timeoutMs' in error
  );
}

// =============================================================================
// withTimeout Tests
// =============================================================================

describe('withTimeout', () => {
  describe('success cases', () => {
    it('should resolve if promise completes before timeout', async () => {
      const result = await withTimeout(
        delay(10, 'success'),
        { timeoutMs: 200 }
      );
      expect(result).toBe('success');
    });

    it('should preserve promise value type', async () => {
      const obj = { id: 1, name: 'test' };
      const result = await withTimeout(
        Promise.resolve(obj),
        { timeoutMs: 200 }
      );
      expect(result).toEqual(obj);
    });

    it('should handle immediately resolving promises', async () => {
      const result = await withTimeout(
        Promise.resolve(42),
        { timeoutMs: 200 }
      );
      expect(result).toBe(42);
    });
  });

  describe('timeout cases', () => {
    it('should throw TimeoutError if promise exceeds timeout', async () => {
      try {
        await withTimeout(delay(300, 'slow'), { timeoutMs: 50 });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(looksLikeTimeoutError(error)).toBe(true);
      }
    });

    it('should include timeout duration in error', async () => {
      try {
        await withTimeout(delay(300, 'slow'), { timeoutMs: 50 });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(looksLikeTimeoutError(error)).toBe(true);
        expect((error as { timeoutMs: number }).timeoutMs).toBe(50);
      }
    });

    it('should use custom error message', async () => {
      try {
        await withTimeout(delay(300, 'slow'), {
          timeoutMs: 50,
          message: 'Custom timeout message',
        });
        expect.fail('Should have thrown');
      } catch (error) {
        expect((error as Error).message).toBe('Custom timeout message');
      }
    });

    it('should call onTimeout callback when timeout occurs', async () => {
      const onTimeout = vi.fn();

      try {
        await withTimeout(delay(300, 'slow'), {
          timeoutMs: 50,
          onTimeout,
        });
      } catch {
        // Expected
      }

      expect(onTimeout).toHaveBeenCalledTimes(1);
    });

    it('should not call onTimeout if promise resolves in time', async () => {
      const onTimeout = vi.fn();

      await withTimeout(delay(10, 'fast'), {
        timeoutMs: 200,
        onTimeout,
      });

      expect(onTimeout).not.toHaveBeenCalled();
    });
  });

  describe('error propagation', () => {
    it('should propagate original error if promise rejects before timeout', async () => {
      const originalError = new Error('Original error');

      await expect(
        withTimeout(delayReject(10, originalError), { timeoutMs: 200 })
      ).rejects.toThrow('Original error');
    });

    it('should throw if timeoutMs is zero', async () => {
      await expect(
        withTimeout(Promise.resolve('value'), { timeoutMs: 0 })
      ).rejects.toThrow('timeoutMs must be positive');
    });

    it('should throw if timeoutMs is negative', async () => {
      await expect(
        withTimeout(Promise.resolve('value'), { timeoutMs: -100 })
      ).rejects.toThrow('timeoutMs must be positive');
    });
  });

  describe('AbortSignal support', () => {
    it('should reject if signal is already aborted', async () => {
      const controller = new AbortController();
      controller.abort('Pre-aborted');

      await expect(
        withTimeout(delay(10, 'value'), {
          timeoutMs: 200,
          signal: controller.signal,
        })
      ).rejects.toThrow('Pre-aborted');
    });

    it('should reject if signal is aborted during execution', async () => {
      const controller = new AbortController();

      setTimeout(() => controller.abort('Aborted mid-flight'), 30);

      await expect(
        withTimeout(delay(500, 'slow'), {
          timeoutMs: 1000,
          signal: controller.signal,
        })
      ).rejects.toThrow('Aborted mid-flight');
    });

    it('should clean up abort listener on success', async () => {
      const controller = new AbortController();
      const removeListenerSpy = vi.spyOn(controller.signal, 'removeEventListener');

      await withTimeout(delay(10, 'fast'), {
        timeoutMs: 200,
        signal: controller.signal,
      });

      expect(removeListenerSpy).toHaveBeenCalled();
    });
  });
});

// =============================================================================
// createTimeoutController Tests
// =============================================================================

describe('createTimeoutController', () => {
  describe('basic functionality', () => {
    it('should return signal, cleanup, and abort', () => {
      const controller = createTimeoutController(200);

      expect(controller.signal).toBeInstanceOf(AbortSignal);
      expect(typeof controller.cleanup).toBe('function');
      expect(typeof controller.abort).toBe('function');

      controller.cleanup();
    });

    it('should not be aborted initially', () => {
      const controller = createTimeoutController(200);
      expect(controller.signal.aborted).toBe(false);
      controller.cleanup();
    });

    it('should abort after timeout', async () => {
      const controller = createTimeoutController(50);

      await delay(100, null);

      expect(controller.signal.aborted).toBe(true);
    });

    it('should not abort if cleanup called before timeout', async () => {
      const controller = createTimeoutController(200);

      await delay(10, null);
      controller.cleanup();
      await delay(250, null);

      expect(controller.signal.aborted).toBe(false);
    });
  });

  describe('manual abort', () => {
    it('should abort immediately when abort() called', () => {
      const controller = createTimeoutController(1000);

      controller.abort('Manual abort');

      expect(controller.signal.aborted).toBe(true);
    });

    it('should use default reason if none provided', () => {
      const controller = createTimeoutController(1000);

      controller.abort();

      expect(controller.signal.aborted).toBe(true);
    });

    it('should be idempotent - multiple abort calls are safe', () => {
      const controller = createTimeoutController(1000);

      controller.abort('First');
      controller.abort('Second');

      expect(controller.signal.aborted).toBe(true);
    });

    it('should be idempotent - multiple cleanup calls are safe', () => {
      const controller = createTimeoutController(1000);

      controller.cleanup();
      controller.cleanup();

      expect(controller.signal.aborted).toBe(false);
    });
  });

  describe('validation', () => {
    it('should throw if timeout is zero', () => {
      expect(() => createTimeoutController(0)).toThrow('timeout must be positive');
    });

    it('should throw if timeout is negative', () => {
      expect(() => createTimeoutController(-100)).toThrow('timeout must be positive');
    });
  });

  describe('integration with fetch-like APIs', () => {
    it('should work with Promise.race pattern', async () => {
      const controller = createTimeoutController(50);

      try {
        await Promise.race([
          delay(300, 'slow'),
          new Promise((_, reject) => {
            controller.signal.addEventListener('abort', () => {
              reject(new Error('Aborted'));
            });
          }),
        ]);
        expect.fail('Should have been aborted');
      } catch (error) {
        expect((error as Error).message).toBe('Aborted');
      }
    });
  });
});

// =============================================================================
// raceWithTimeout Tests
// =============================================================================

describe('raceWithTimeout', () => {
  it('should return first resolved promise', async () => {
    const result = await raceWithTimeout(
      [delay(10, 'first'), delay(50, 'second')],
      200
    );
    expect(result).toBe('first');
  });

  it('should timeout if all promises are slow', async () => {
    try {
      await raceWithTimeout([delay(300, 'slow1'), delay(400, 'slow2')], 50);
      expect.fail('Should have thrown');
    } catch (error) {
      expect(looksLikeTimeoutError(error)).toBe(true);
    }
  });

  it('should propagate first rejection', async () => {
    await expect(
      raceWithTimeout(
        [delayReject(10, new Error('First error')), delay(50, 'second')],
        200
      )
    ).rejects.toThrow('First error');
  });
});

// =============================================================================
// allWithTimeouts Tests
// =============================================================================

describe('allWithTimeouts', () => {
  it('should return all results with individual timeouts', async () => {
    const results = await allWithTimeouts([
      [delay(10, 'fast'), 200],
      [delay(20, 'medium'), 200],
    ]);

    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({ status: 'fulfilled', value: 'fast' });
    expect(results[1]).toEqual({ status: 'fulfilled', value: 'medium' });
  });

  it('should handle mixed success and timeout', async () => {
    const results = await allWithTimeouts([
      [delay(10, 'fast'), 200],
      [delay(300, 'slow'), 50],
    ]);

    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({ status: 'fulfilled', value: 'fast' });
    expect(results[1].status).toBe('rejected');
    expect(looksLikeTimeoutError((results[1] as PromiseRejectedResult).reason)).toBe(true);
  });

  it('should handle empty array', async () => {
    const results = await allWithTimeouts([]);
    expect(results).toEqual([]);
  });
});

// =============================================================================
// deadline Tests
// =============================================================================

describe('deadline', () => {
  it('should reject with TimeoutError after specified time', async () => {
    try {
      await deadline(50);
      expect.fail('Should have rejected');
    } catch (error) {
      expect(looksLikeTimeoutError(error)).toBe(true);
    }
  });

  it('should use custom message', async () => {
    try {
      await deadline(50, 'Custom deadline message');
      expect.fail('Should have rejected');
    } catch (error) {
      expect((error as Error).message).toBe('Custom deadline message');
    }
  });

  it('should include timeout in error', async () => {
    try {
      await deadline(50);
      expect.fail('Should have rejected');
    } catch (error) {
      expect(looksLikeTimeoutError(error)).toBe(true);
      expect((error as { timeoutMs: number }).timeoutMs).toBe(50);
    }
  });

  it('should work with Promise.race', async () => {
    const result = await Promise.race([
      delay(10, 'fast'),
      deadline(200),
    ]);
    expect(result).toBe('fast');
  });
});

// =============================================================================
// isTimeoutError Tests
// =============================================================================

describe('isTimeoutError', () => {
  it('should return false for regular Error', () => {
    const error = new Error('Regular error');
    expect(isTimeoutError(error)).toBe(false);
  });

  it('should return false for null', () => {
    expect(isTimeoutError(null)).toBe(false);
  });

  it('should return false for undefined', () => {
    expect(isTimeoutError(undefined)).toBe(false);
  });

  it('should return false for non-error objects', () => {
    expect(isTimeoutError({ message: 'fake' })).toBe(false);
  });

  it('should return true for actual TimeoutError from withTimeout', async () => {
    try {
      await withTimeout(delay(200, 'slow'), { timeoutMs: 50 });
    } catch (error) {
      expect(isTimeoutError(error)).toBe(true);
    }
  });
});

// =============================================================================
// Integration Tests
// =============================================================================

describe('Integration', () => {
  it('should work with retry pattern', async () => {
    let attempts = 0;

    const operation = async () => {
      attempts++;
      if (attempts < 3) {
        await delay(200, null); // Slow first 2 attempts
        return 'slow';
      }
      return 'success';
    };

    // First attempt - timeout
    try {
      await withTimeout(operation(), { timeoutMs: 50 });
    } catch (error) {
      expect(looksLikeTimeoutError(error)).toBe(true);
    }

    // Second attempt - timeout
    try {
      await withTimeout(operation(), { timeoutMs: 50 });
    } catch (error) {
      expect(looksLikeTimeoutError(error)).toBe(true);
    }

    // Third attempt - success
    const result = await withTimeout(operation(), { timeoutMs: 200 });
    expect(result).toBe('success');
    expect(attempts).toBe(3);
  });

  it('should combine withTimeout and createTimeoutController', async () => {
    const controller = createTimeoutController(500);

    try {
      const result = await withTimeout(
        delay(50, 'value'),
        { timeoutMs: 200, signal: controller.signal }
      );
      expect(result).toBe('value');
    } finally {
      controller.cleanup();
    }

    expect(controller.signal.aborted).toBe(false);
  });

  it('should handle concurrent timeout operations', async () => {
    const results = await Promise.all([
      withTimeout(delay(10, 'a'), { timeoutMs: 200 }),
      withTimeout(delay(20, 'b'), { timeoutMs: 200 }),
      withTimeout(delay(30, 'c'), { timeoutMs: 200 }),
    ]);

    expect(results).toEqual(['a', 'b', 'c']);
  });
});
