/**
 * @fileoverview Retry utilities for HSM operations
 *
 * Provides exponential backoff retry logic for transient failures.
 *
 * @module @gerts/hsm/utils/retry
 */

// =============================================================================
// TYPES
// =============================================================================

/**
 * Retry configuration options
 */
export interface RetryOptions {
  /** Maximum number of attempts (default: 3) */
  attempts: number;

  /** Initial delay between retries in milliseconds (default: 1000) */
  delayMs: number;

  /** Backoff multiplier (default: 2) */
  backoffMultiplier: number;

  /** Maximum delay in milliseconds (default: 30000) */
  maxDelayMs: number;

  /** Jitter factor 0-1 (default: 0.1) */
  jitter?: number;
}

/**
 * Default retry options
 */
export const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  attempts: 3,
  delayMs: 1000,
  backoffMultiplier: 2,
  maxDelayMs: 30000,
  jitter: 0.1,
};

// =============================================================================
// FUNCTIONS
// =============================================================================

/**
 * Execute function with retry logic
 *
 * @param fn - Async function to execute
 * @param options - Retry configuration
 * @param shouldRetry - Predicate to determine if error is retryable
 * @returns Result of successful execution
 * @throws Last error if all retries exhausted
 *
 * @example
 * ```typescript
 * const result = await withRetry(
 *   () => vault.encrypt(data),
 *   { attempts: 3, delayMs: 1000, backoffMultiplier: 2, maxDelayMs: 30000 },
 *   (err) => err instanceof HSMError && err.isRetryable
 * );
 * ```
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {},
  shouldRetry?: (error: Error) => boolean,
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: Error | undefined;
  let currentDelay = opts.delayMs;

  for (let attempt = 1; attempt <= opts.attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      // Check if we should retry
      const canRetry = attempt < opts.attempts && (!shouldRetry || shouldRetry(lastError));

      if (!canRetry) {
        throw lastError;
      }

      // Calculate delay with jitter
      const jitter = opts.jitter ?? 0;
      const jitterFactor = 1 + (Math.random() * 2 - 1) * jitter;
      const delay = Math.min(currentDelay * jitterFactor, opts.maxDelayMs);

      // Wait before retry
      await sleep(delay);

      // Increase delay for next attempt
      currentDelay = Math.min(currentDelay * opts.backoffMultiplier, opts.maxDelayMs);
    }
  }

  throw lastError ?? new Error('Retry exhausted');
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Create a circuit breaker wrapper
 *
 * Prevents cascading failures by failing fast when error threshold is reached.
 */
export function createCircuitBreaker<T>(
  fn: () => Promise<T>,
  options: {
    /** Failure threshold before opening circuit */
    failureThreshold: number;
    /** Time to wait before attempting half-open state (ms) */
    resetTimeout: number;
    /** Success threshold in half-open state to close circuit */
    successThreshold: number;
  },
): () => Promise<T> {
  let failures = 0;
  let successes = 0;
  let state: 'closed' | 'open' | 'half-open' = 'closed';
  let lastFailureTime = 0;

  return async () => {
    // Check if circuit should transition from open to half-open
    if (state === 'open') {
      if (Date.now() - lastFailureTime >= options.resetTimeout) {
        state = 'half-open';
        successes = 0;
      } else {
        throw new Error('Circuit breaker is open');
      }
    }

    try {
      const result = await fn();

      // Success handling
      if (state === 'half-open') {
        successes++;
        if (successes >= options.successThreshold) {
          state = 'closed';
          failures = 0;
        }
      } else {
        failures = 0; // Reset failures on success in closed state
      }

      return result;
    } catch (err) {
      // Failure handling
      failures++;
      lastFailureTime = Date.now();

      if (state === 'half-open' || failures >= options.failureThreshold) {
        state = 'open';
      }

      throw err;
    }
  };
}
