/**
 * @gertsai/core - Unified Retry Logic
 *
 * Provides exponential backoff with jitter for reliable retry operations.
 *
 * @module @gertsai/core/retry
 */

import type { GertsError } from './errors';

/**
 * Check if an error is retryable.
 * Duplicated from errors.ts to avoid circular imports.
 */
function isRetryableError(error: unknown): boolean {
  // Check GertsError
  if (error && typeof error === 'object' && 'isRetryable' in error && typeof (error as GertsError).isRetryable === 'function') {
    return (error as GertsError).isRetryable();
  }
  // Check for common transient error patterns
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('timeout') ||
      message.includes('econnreset') ||
      message.includes('econnrefused') ||
      message.includes('etimedout') ||
      message.includes('rate limit') ||
      message.includes('429') ||
      message.includes('503') ||
      message.includes('504')
    );
  }
  return false;
}

// =============================================================================
// Types
// =============================================================================

/**
 * Configuration for retry behavior.
 */
export interface RetryConfig {
  /** Maximum number of retry attempts (default: 3) */
  maxAttempts: number;
  /** Base delay in milliseconds (default: 100) */
  baseDelay: number;
  /** Maximum delay cap in milliseconds (default: 10000) */
  maxDelay: number;
  /** Multiplier for exponential backoff (default: 2) */
  backoffMultiplier: number;
  /** Add random jitter to delay (default: true) */
  jitter: boolean;
  /** Custom function to determine if error should be retried */
  shouldRetry?: (error: Error, attempt: number) => boolean;
  /** Callback called before each retry */
  onRetry?: (attempt: number, error: Error, delay: number) => void;
}

/**
 * Default retry configuration.
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelay: 100,
  maxDelay: 10000,
  backoffMultiplier: 2,
  jitter: true,
};

/**
 * Result of a retry operation.
 */
export interface RetryResult<T> {
  /** Whether the operation succeeded */
  success: boolean;
  /** Result value if successful */
  value?: T;
  /** Final error if all retries failed */
  error?: Error;
  /** Number of attempts made */
  attempts: number;
  /** Total time spent in ms */
  totalTimeMs: number;
}

// =============================================================================
// Backoff Calculator
// =============================================================================

/**
 * Calculate exponential backoff delay with optional jitter.
 *
 * Formula: min(baseDelay * (multiplier ^ attempt), maxDelay) ± jitter
 *
 * @example
 * ```typescript
 * const calculator = new BackoffCalculator({
 *   baseDelay: 100,
 *   maxDelay: 10000,
 *   backoffMultiplier: 2,
 *   jitter: true,
 * });
 *
 * // Returns ~100ms for attempt 0
 * // Returns ~200ms for attempt 1
 * // Returns ~400ms for attempt 2
 * const delay = calculator.calculateDelay(2);
 * ```
 */
export class BackoffCalculator {
  constructor(private config: Pick<RetryConfig, 'baseDelay' | 'maxDelay' | 'backoffMultiplier' | 'jitter'>) {
    if (config.baseDelay <= 0) throw new Error('baseDelay must be positive');
    if (config.maxDelay <= 0) throw new Error('maxDelay must be positive');
    if (config.backoffMultiplier < 1) throw new Error('backoffMultiplier must be >= 1');
  }

  /**
   * Calculate delay for a given attempt number.
   *
   * @param attempt - Zero-based attempt number
   * @returns Delay in milliseconds
   */
  calculateDelay(attempt: number): number {
    const exponentialDelay = this.config.baseDelay *
      Math.pow(this.config.backoffMultiplier, attempt);
    const cappedDelay = Math.min(exponentialDelay, this.config.maxDelay);
    return this.config.jitter ? this.addJitter(cappedDelay) : Math.floor(cappedDelay);
  }

  /**
   * Add random jitter (±10%) to delay.
   */
  private addJitter(delay: number): number {
    const jitterFactor = 0.9 + Math.random() * 0.2; // 0.9 to 1.1
    return Math.floor(delay * jitterFactor);
  }
}

// =============================================================================
// Retry Executor
// =============================================================================

/**
 * Execute an async function with retry logic.
 *
 * Uses exponential backoff with jitter to handle transient failures.
 *
 * @param fn - Async function to execute
 * @param config - Retry configuration (optional)
 * @returns RetryResult with success/failure info
 *
 * @example
 * ```typescript
 * const result = await withRetry(
 *   async () => {
 *     const response = await fetch('https://api.example.com/data');
 *     if (!response.ok) throw new Error(`HTTP ${response.status}`);
 *     return response.json();
 *   },
 *   {
 *     maxAttempts: 5,
 *     baseDelay: 200,
 *     onRetry: (attempt, error, delay) => {
 *       console.log(`Retry ${attempt} after ${delay}ms: ${error.message}`);
 *     },
 *   }
 * );
 *
 * if (result.success) {
 *   console.log('Data:', result.value);
 * } else {
 *   console.error('Failed after', result.attempts, 'attempts:', result.error);
 * }
 * ```
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<RetryResult<T>> {
  const fullConfig: RetryConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  const calculator = new BackoffCalculator(fullConfig);
  const startTime = Date.now();

  let lastError: Error | undefined;
  let attempt = 0;

  while (attempt < fullConfig.maxAttempts) {
    try {
      const value = await fn();
      return {
        success: true,
        value,
        attempts: attempt + 1,
        totalTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      attempt++;

      // Check if we should retry
      const shouldRetry = fullConfig.shouldRetry
        ? fullConfig.shouldRetry(lastError, attempt)
        : isRetryableError(lastError);

      if (!shouldRetry || attempt >= fullConfig.maxAttempts) {
        break;
      }

      // Calculate delay and wait
      const delay = calculator.calculateDelay(attempt - 1);
      fullConfig.onRetry?.(attempt, lastError, delay);
      await sleep(delay);
    }
  }

  return {
    success: false,
    error: lastError,
    attempts: attempt,
    totalTimeMs: Date.now() - startTime,
  };
}

/**
 * Execute an async function with retry, throwing on failure.
 *
 * @param fn - Async function to execute
 * @param config - Retry configuration (optional)
 * @returns Result value
 * @throws Last error if all retries fail
 *
 * @example
 * ```typescript
 * try {
 *   const data = await retryAsync(
 *     () => fetchData(),
 *     { maxAttempts: 3 }
 *   );
 *   console.log(data);
 * } catch (error) {
 *   console.error('All retries failed:', error);
 * }
 * ```
 */
export async function retryAsync<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const result = await withRetry(fn, config);
  if (result.success) {
    return result.value!;
  }
  throw result.error;
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Create a RetryConfig with custom overrides.
 */
export function createRetryConfig(overrides: Partial<RetryConfig> = {}): RetryConfig {
  return { ...DEFAULT_RETRY_CONFIG, ...overrides };
}

/**
 * Create a simple retry config with common defaults.
 */
export function createSimpleRetryConfig(
  maxAttempts: number,
  baseDelay = 100
): RetryConfig {
  return {
    ...DEFAULT_RETRY_CONFIG,
    maxAttempts,
    baseDelay,
  };
}

/**
 * Sleep for a given number of milliseconds.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if a delay is reasonable (not too long).
 */
export function isReasonableDelay(delay: number, maxMs = 60000): boolean {
  return delay >= 0 && delay <= maxMs;
}
