/**
 * @gerts/core - Unified Retry Logic
 *
 * Provides exponential backoff with jitter for reliable retry operations.
 * Consolidates retry patterns from @gerts/agent and @gerts/scheduler.
 *
 * @module @gerts/core/retry
 */
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
export declare const DEFAULT_RETRY_CONFIG: RetryConfig;
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
export declare class BackoffCalculator {
    private config;
    constructor(config: Pick<RetryConfig, 'baseDelay' | 'maxDelay' | 'backoffMultiplier' | 'jitter'>);
    /**
     * Calculate delay for a given attempt number.
     *
     * @param attempt - Zero-based attempt number
     * @returns Delay in milliseconds
     */
    calculateDelay(attempt: number): number;
    /**
     * Add random jitter (±10%) to delay.
     */
    private addJitter;
}
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
export declare function withRetry<T>(fn: () => Promise<T>, config?: Partial<RetryConfig>): Promise<RetryResult<T>>;
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
export declare function retryAsync<T>(fn: () => Promise<T>, config?: Partial<RetryConfig>): Promise<T>;
/**
 * Create a RetryConfig with custom overrides.
 */
export declare function createRetryConfig(overrides?: Partial<RetryConfig>): RetryConfig;
/**
 * Create a simple retry config with common defaults.
 */
export declare function createSimpleRetryConfig(maxAttempts: number, baseDelay?: number): RetryConfig;
/**
 * Sleep for a given number of milliseconds.
 */
export declare function sleep(ms: number): Promise<void>;
/**
 * Check if a delay is reasonable (not too long).
 */
export declare function isReasonableDelay(delay: number, maxMs?: number): boolean;
