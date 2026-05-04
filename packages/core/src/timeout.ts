/**
 * @gertsai/core - Timeout Utilities
 *
 * Provides utilities for adding timeouts to promises and managing
 * AbortController-based timeout cancellation.
 *
 * @module @gertsai/core/timeout
 */

// Note: We use a local TimeoutError class instead of importing from errors.ts
// to avoid circular dependency issues with vitest bundling.
// The GertsError-based TimeoutError in errors.ts should be used for
// error handling logic that needs the full GertsError interface.

/**
 * Lightweight TimeoutError for timeout utilities.
 * For GertsError-compatible TimeoutError, use import from './errors'.
 */
export class TimeoutError extends Error {
  readonly timeoutMs: number;

  constructor(message: string, timeoutMs: number) {
    super(message);
    this.name = 'TimeoutError';
    this.timeoutMs = timeoutMs;
    Object.setPrototypeOf(this, TimeoutError.prototype);
  }

  /**
   * Whether this error is retryable (always true for timeout).
   */
  isRetryable(): boolean {
    return true;
  }
}

// =============================================================================
// Types
// =============================================================================

/**
 * Options for withTimeout function.
 */
export interface TimeoutOptions {
  /** Timeout in milliseconds */
  timeoutMs: number;
  /** Optional AbortSignal for external cancellation */
  signal?: AbortSignal;
  /** Callback called when timeout occurs */
  onTimeout?: () => void;
  /** Custom error message (default: 'Operation timed out after {timeoutMs}ms') */
  message?: string;
}

/**
 * Result from createTimeoutController.
 */
export interface TimeoutController {
  /** AbortSignal that will be aborted on timeout */
  signal: AbortSignal;
  /** Cleanup function to clear the timeout timer */
  cleanup: () => void;
  /** Cancel the timeout manually */
  abort: (reason?: string) => void;
}

// =============================================================================
// Main Functions
// =============================================================================

/**
 * Wrap a promise with a timeout.
 *
 * If the promise doesn't resolve/reject within timeoutMs, a TimeoutError is thrown.
 * Supports external cancellation via AbortSignal.
 *
 * @param promise - Promise to wrap with timeout
 * @param options - Timeout configuration
 * @returns Promise that resolves with the original value or rejects with TimeoutError
 *
 * @example
 * ```typescript
 * // Basic usage
 * const result = await withTimeout(
 *   fetch('https://api.example.com/data'),
 *   { timeoutMs: 5000 }
 * );
 *
 * // With callback and custom message
 * const result = await withTimeout(
 *   longRunningOperation(),
 *   {
 *     timeoutMs: 10000,
 *     message: 'Database query timed out',
 *     onTimeout: () => console.warn('Operation is taking too long')
 *   }
 * );
 *
 * // With external AbortSignal
 * const controller = new AbortController();
 * const result = await withTimeout(
 *   fetchData(controller.signal),
 *   { timeoutMs: 5000, signal: controller.signal }
 * );
 * ```
 *
 * @throws {TimeoutError} If the operation times out
 * @throws {Error} If the external signal is aborted
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  options: TimeoutOptions
): Promise<T> {
  const { timeoutMs, signal, onTimeout, message } = options;

  if (timeoutMs <= 0) {
    throw new Error('timeoutMs must be positive');
  }

  // Check if already aborted
  if (signal?.aborted) {
    throw new Error(signal.reason ?? 'Operation was aborted');
  }

  return new Promise<T>((resolve, reject) => {
    let settled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    // Cleanup function
    const cleanup = () => {
      settled = true;
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
        timeoutId = undefined;
      }
    };

    // Timeout handler
    timeoutId = setTimeout(() => {
      if (!settled) {
        cleanup();
        onTimeout?.();
        const errorMessage = message ?? `Operation timed out after ${timeoutMs}ms`;
        reject(new TimeoutError(errorMessage, timeoutMs));
      }
    }, timeoutMs);

    // External abort handler
    const abortHandler = () => {
      if (!settled) {
        cleanup();
        reject(new Error(signal?.reason ?? 'Operation was aborted'));
      }
    };

    if (signal) {
      signal.addEventListener('abort', abortHandler, { once: true });
    }

    // Original promise handlers
    promise
      .then((value) => {
        if (!settled) {
          cleanup();
          if (signal) {
            signal.removeEventListener('abort', abortHandler);
          }
          resolve(value);
        }
      })
      .catch((error) => {
        if (!settled) {
          cleanup();
          if (signal) {
            signal.removeEventListener('abort', abortHandler);
          }
          reject(error);
        }
      });
  });
}

/**
 * Create an AbortController that auto-aborts after a timeout.
 *
 * Useful for passing timeout signal to fetch or other abortable APIs.
 * Remember to call cleanup() when done to prevent memory leaks.
 *
 * @param ms - Timeout in milliseconds
 * @returns TimeoutController with signal, cleanup, and abort functions
 *
 * @example
 * ```typescript
 * // Basic usage with fetch
 * const controller = createTimeoutController(5000);
 * try {
 *   const response = await fetch('/api/data', { signal: controller.signal });
 *   return await response.json();
 * } finally {
 *   controller.cleanup(); // Always cleanup to prevent memory leaks
 * }
 *
 * // Early cancellation
 * const controller = createTimeoutController(10000);
 * if (userCancelled) {
 *   controller.abort('User cancelled');
 * }
 * ```
 */
export function createTimeoutController(ms: number): TimeoutController {
  if (ms <= 0) {
    throw new Error('timeout must be positive');
  }

  const controller = new AbortController();
  let cleared = false;

  const timeoutId = setTimeout(() => {
    if (!cleared) {
      controller.abort(new TimeoutError(`Timeout after ${ms}ms`, ms));
    }
  }, ms);

  return {
    signal: controller.signal,
    cleanup: () => {
      if (!cleared) {
        cleared = true;
        clearTimeout(timeoutId);
      }
    },
    abort: (reason?: string) => {
      if (!cleared) {
        cleared = true;
        clearTimeout(timeoutId);
        controller.abort(reason ?? 'Manually aborted');
      }
    },
  };
}

// =============================================================================
// Race Utilities
// =============================================================================

/**
 * Race multiple promises with a timeout.
 *
 * Returns the first promise to resolve, or throws TimeoutError if all are too slow.
 *
 * @param promises - Array of promises to race
 * @param timeoutMs - Timeout in milliseconds
 * @returns First resolved value
 *
 * @example
 * ```typescript
 * const result = await raceWithTimeout(
 *   [
 *     fetchFromPrimary(),
 *     fetchFromBackup(),
 *   ],
 *   5000
 * );
 * ```
 */
export async function raceWithTimeout<T>(
  promises: Promise<T>[],
  timeoutMs: number
): Promise<T> {
  return withTimeout(Promise.race(promises), { timeoutMs });
}

/**
 * Execute multiple promises with individual timeouts.
 *
 * Returns settled results for each promise, with TimeoutError for timed out ones.
 *
 * @param entries - Array of [promise, timeoutMs] tuples
 * @returns Array of PromiseSettledResult
 *
 * @example
 * ```typescript
 * const results = await allWithTimeouts([
 *   [fetchFast(), 1000],
 *   [fetchSlow(), 5000],
 * ]);
 *
 * results.forEach((result, i) => {
 *   if (result.status === 'fulfilled') {
 *     console.log(`Promise ${i} succeeded:`, result.value);
 *   } else {
 *     console.log(`Promise ${i} failed:`, result.reason);
 *   }
 * });
 * ```
 */
export async function allWithTimeouts<T>(
  entries: Array<[Promise<T>, number]>
): Promise<PromiseSettledResult<T>[]> {
  const wrappedPromises = entries.map(([promise, timeoutMs]) =>
    withTimeout(promise, { timeoutMs })
  );
  return Promise.allSettled(wrappedPromises);
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Create a promise that rejects after a timeout.
 *
 * Useful for custom race conditions or deadline enforcement.
 *
 * @param ms - Timeout in milliseconds
 * @param message - Custom error message
 * @returns Promise that rejects with TimeoutError
 *
 * @example
 * ```typescript
 * // Custom deadline
 * const result = await Promise.race([
 *   processData(),
 *   deadline(30000, 'Processing deadline exceeded')
 * ]);
 * ```
 */
export function deadline(ms: number, message?: string): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(new TimeoutError(message ?? `Deadline exceeded after ${ms}ms`, ms));
    }, ms);
  });
}

/**
 * Check if an error is a TimeoutError.
 */
export function isTimeoutError(error: unknown): error is TimeoutError {
  return error instanceof TimeoutError;
}

/**
 * Sleep for a given number of milliseconds.
 * Convenience re-export from retry module.
 */
export { sleep } from './retry';
