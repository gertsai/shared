/**
 * @gerts/core - Timeout Utilities
 *
 * Provides utilities for adding timeouts to promises and managing
 * AbortController-based timeout cancellation.
 *
 * @module @gerts/core/timeout
 */
/**
 * Lightweight TimeoutError for timeout utilities.
 * For GertsError-compatible TimeoutError, use import from './errors'.
 */
export declare class TimeoutError extends Error {
    readonly timeoutMs: number;
    constructor(message: string, timeoutMs: number);
    /**
     * Whether this error is retryable (always true for timeout).
     */
    isRetryable(): boolean;
}
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
export declare function withTimeout<T>(promise: Promise<T>, options: TimeoutOptions): Promise<T>;
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
export declare function createTimeoutController(ms: number): TimeoutController;
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
export declare function raceWithTimeout<T>(promises: Promise<T>[], timeoutMs: number): Promise<T>;
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
export declare function allWithTimeouts<T>(entries: Array<[Promise<T>, number]>): Promise<PromiseSettledResult<T>[]>;
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
export declare function deadline(ms: number, message?: string): Promise<never>;
/**
 * Check if an error is a TimeoutError.
 */
export declare function isTimeoutError(error: unknown): error is TimeoutError;
/**
 * Sleep for a given number of milliseconds.
 * Convenience re-export from retry module.
 */
export { sleep } from './retry';
//# sourceMappingURL=timeout.d.ts.map