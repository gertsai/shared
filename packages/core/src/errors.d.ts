export type ErrorSeverity = 'info' | 'warn' | 'error' | 'fatal';
/**
 * Interface for errors that support retry logic.
 */
export interface RetryableError extends Error {
    /**
     * Whether this error is retryable.
     * Transient errors (network, timeout, rate limit) should return true.
     * Permanent errors (auth, validation) should return false.
     */
    isRetryable(): boolean;
    /**
     * Suggested delay before retry (in ms).
     * Returns undefined if no specific delay is recommended.
     */
    getRetryDelay?(attempt: number): number | undefined;
}
export interface ErrorContext {
    code: string;
    cause?: unknown;
    severity?: ErrorSeverity;
    details?: Record<string, unknown>;
    /** Whether this error is retryable (default: false) */
    retryable?: boolean;
}
/**
 * Serialized error for logging/transport.
 */
export interface SerializedError {
    name: string;
    code: string;
    message: string;
    severity: ErrorSeverity;
    isRetryable: boolean;
    details?: Record<string, unknown>;
    stack?: string;
}
/**
 * Base error class for all gerts.ai errors.
 * Implements RetryableError interface for unified error handling.
 */
export declare class GertsError extends Error implements RetryableError {
    readonly code: string;
    readonly severity: ErrorSeverity;
    readonly details?: Record<string, unknown>;
    protected readonly _retryable: boolean;
    constructor(message: string, context: ErrorContext);
    /**
     * Whether this error is retryable.
     * Override in subclasses for context-dependent retry logic.
     */
    isRetryable(): boolean;
    /**
     * Suggested retry delay in ms.
     * Override in subclasses for custom backoff.
     */
    getRetryDelay?(attempt: number): number | undefined;
    /**
     * Serialize error for logging/transport.
     */
    toJSON(): SerializedError;
}
export declare class NotFoundError extends GertsError {
    constructor(message: string, details?: Record<string, unknown>);
}
export declare class ValidationError extends GertsError {
    constructor(message: string, details?: Record<string, unknown>);
}
/**
 * Timeout error - transient, retryable.
 * Use GertsTimeoutError when you need full GertsError interface.
 * Use TimeoutError from './timeout' for lightweight timeout utilities.
 */
export declare class GertsTimeoutError extends GertsError {
    readonly timeoutMs: number;
    constructor(message: string, timeoutMs: number, details?: Record<string, unknown>);
}
/**
 * @deprecated Use GertsTimeoutError for GertsError interface, or TimeoutError from './timeout'.
 */
export { GertsTimeoutError as TimeoutErrorGerts };
/**
 * Connection error - transient, retryable.
 */
export declare class ConnectionError extends GertsError {
    constructor(message: string, details?: Record<string, unknown>);
}
/**
 * Rate limit error - retryable with delay.
 */
export declare class RateLimitError extends GertsError {
    readonly retryAfterMs?: number;
    constructor(message: string, retryAfterMs?: number, details?: Record<string, unknown>);
    getRetryDelay(_attempt: number): number | undefined;
}
/**
 * Authentication error - permanent, not retryable.
 */
export declare class AuthenticationError extends GertsError {
    constructor(message: string, details?: Record<string, unknown>);
}
/**
 * Authorization error - permanent, not retryable.
 */
export declare class AuthorizationError extends GertsError {
    constructor(message: string, details?: Record<string, unknown>);
}
/**
 * Check if an error is a GertsError.
 */
export declare function isGertsError(error: unknown): error is GertsError;
/**
 * Check if an error is retryable.
 */
export declare function isRetryableError(error: unknown): boolean;
/**
 * Wrap an unknown error in a GertsError.
 */
export declare function wrapError(error: unknown, code?: string): GertsError;
