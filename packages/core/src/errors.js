/**
 * Base error class for all gerts.ai errors.
 * Implements RetryableError interface for unified error handling.
 */
export class GertsError extends Error {
    code;
    severity;
    details;
    _retryable;
    constructor(message, context) {
        super(message);
        this.name = 'GertsError';
        this.code = context.code;
        this.severity = context.severity ?? 'error';
        this.details = context.details;
        this._retryable = context.retryable ?? false;
        if (context.cause instanceof Error && context.cause.stack) {
            this.stack += `\nCaused by: ${context.cause.stack}`;
        }
    }
    /**
     * Whether this error is retryable.
     * Override in subclasses for context-dependent retry logic.
     */
    isRetryable() {
        return this._retryable;
    }
    /**
     * Suggested retry delay in ms.
     * Override in subclasses for custom backoff.
     */
    getRetryDelay(attempt) {
        if (!this._retryable)
            return undefined;
        // Default exponential backoff: 100ms, 200ms, 400ms, 800ms, ...
        return Math.min(100 * Math.pow(2, attempt), 10000);
    }
    /**
     * Serialize error for logging/transport.
     */
    toJSON() {
        return {
            name: this.name,
            code: this.code,
            message: this.message,
            severity: this.severity,
            isRetryable: this.isRetryable(),
            details: this.details,
            stack: this.stack,
        };
    }
}
export class NotFoundError extends GertsError {
    constructor(message, details) {
        super(message, { code: 'NOT_FOUND', details, retryable: false });
        this.name = 'NotFoundError';
    }
}
export class ValidationError extends GertsError {
    constructor(message, details) {
        super(message, { code: 'VALIDATION_FAILED', details, severity: 'warn', retryable: false });
        this.name = 'ValidationError';
    }
}
/**
 * Timeout error - transient, retryable.
 * Use GertsTimeoutError when you need full GertsError interface.
 * Use TimeoutError from './timeout' for lightweight timeout utilities.
 */
export class GertsTimeoutError extends GertsError {
    timeoutMs;
    constructor(message, timeoutMs, details) {
        super(message, { code: 'TIMEOUT', details: { ...details, timeoutMs }, retryable: true });
        this.name = 'GertsTimeoutError';
        this.timeoutMs = timeoutMs;
    }
}
/**
 * @deprecated Use GertsTimeoutError for GertsError interface, or TimeoutError from './timeout'.
 */
export { GertsTimeoutError as TimeoutErrorGerts };
/**
 * Connection error - transient, retryable.
 */
export class ConnectionError extends GertsError {
    constructor(message, details) {
        super(message, { code: 'CONNECTION_FAILED', details, retryable: true });
        this.name = 'ConnectionError';
    }
}
/**
 * Rate limit error - retryable with delay.
 */
export class RateLimitError extends GertsError {
    retryAfterMs;
    constructor(message, retryAfterMs, details) {
        super(message, {
            code: 'RATE_LIMITED',
            details: { ...details, retryAfterMs },
            retryable: true
        });
        this.name = 'RateLimitError';
        this.retryAfterMs = retryAfterMs;
    }
    getRetryDelay(_attempt) {
        return this.retryAfterMs ?? 1000;
    }
}
/**
 * Authentication error - permanent, not retryable.
 */
export class AuthenticationError extends GertsError {
    constructor(message, details) {
        super(message, { code: 'AUTHENTICATION_FAILED', details, retryable: false });
        this.name = 'AuthenticationError';
    }
}
/**
 * Authorization error - permanent, not retryable.
 */
export class AuthorizationError extends GertsError {
    constructor(message, details) {
        super(message, { code: 'AUTHORIZATION_FAILED', details, retryable: false });
        this.name = 'AuthorizationError';
    }
}
// =============================================================================
// Type Guards and Utilities
// =============================================================================
/**
 * Check if an error is a GertsError.
 */
export function isGertsError(error) {
    return error instanceof GertsError;
}
/**
 * Check if an error is retryable.
 */
export function isRetryableError(error) {
    if (error instanceof GertsError) {
        return error.isRetryable();
    }
    // Check for common transient error patterns
    if (error instanceof Error) {
        const message = error.message.toLowerCase();
        return (message.includes('timeout') ||
            message.includes('econnreset') ||
            message.includes('econnrefused') ||
            message.includes('etimedout') ||
            message.includes('rate limit') ||
            message.includes('429') ||
            message.includes('503') ||
            message.includes('504'));
    }
    return false;
}
/**
 * Wrap an unknown error in a GertsError.
 */
export function wrapError(error, code = 'UNKNOWN_ERROR') {
    if (error instanceof GertsError) {
        return error;
    }
    if (error instanceof Error) {
        return new GertsError(error.message, {
            code,
            cause: error,
            retryable: isRetryableError(error),
        });
    }
    return new GertsError(String(error), { code });
}
