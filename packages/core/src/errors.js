"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthorizationError = exports.AuthenticationError = exports.RateLimitError = exports.ConnectionError = exports.TimeoutErrorGerts = exports.GertsTimeoutError = exports.ValidationError = exports.NotFoundError = exports.GertsError = void 0;
exports.isGertsError = isGertsError;
exports.isRetryableError = isRetryableError;
exports.wrapError = wrapError;
/**
 * Base error class for all gerts.ai errors.
 * Implements RetryableError interface for unified error handling.
 */
class GertsError extends Error {
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
exports.GertsError = GertsError;
class NotFoundError extends GertsError {
    constructor(message, details) {
        super(message, { code: 'NOT_FOUND', details, retryable: false });
        this.name = 'NotFoundError';
    }
}
exports.NotFoundError = NotFoundError;
class ValidationError extends GertsError {
    constructor(message, details) {
        super(message, { code: 'VALIDATION_FAILED', details, severity: 'warn', retryable: false });
        this.name = 'ValidationError';
    }
}
exports.ValidationError = ValidationError;
/**
 * Timeout error - transient, retryable.
 * Use GertsTimeoutError when you need full GertsError interface.
 * Use TimeoutError from './timeout' for lightweight timeout utilities.
 */
class GertsTimeoutError extends GertsError {
    timeoutMs;
    constructor(message, timeoutMs, details) {
        super(message, { code: 'TIMEOUT', details: { ...details, timeoutMs }, retryable: true });
        this.name = 'GertsTimeoutError';
        this.timeoutMs = timeoutMs;
    }
}
exports.GertsTimeoutError = GertsTimeoutError;
exports.TimeoutErrorGerts = GertsTimeoutError;
/**
 * Connection error - transient, retryable.
 */
class ConnectionError extends GertsError {
    constructor(message, details) {
        super(message, { code: 'CONNECTION_FAILED', details, retryable: true });
        this.name = 'ConnectionError';
    }
}
exports.ConnectionError = ConnectionError;
/**
 * Rate limit error - retryable with delay.
 */
class RateLimitError extends GertsError {
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
exports.RateLimitError = RateLimitError;
/**
 * Authentication error - permanent, not retryable.
 */
class AuthenticationError extends GertsError {
    constructor(message, details) {
        super(message, { code: 'AUTHENTICATION_FAILED', details, retryable: false });
        this.name = 'AuthenticationError';
    }
}
exports.AuthenticationError = AuthenticationError;
/**
 * Authorization error - permanent, not retryable.
 */
class AuthorizationError extends GertsError {
    constructor(message, details) {
        super(message, { code: 'AUTHORIZATION_FAILED', details, retryable: false });
        this.name = 'AuthorizationError';
    }
}
exports.AuthorizationError = AuthorizationError;
// =============================================================================
// Type Guards and Utilities
// =============================================================================
/**
 * Check if an error is a GertsError.
 */
function isGertsError(error) {
    return error instanceof GertsError;
}
/**
 * Check if an error is retryable.
 */
function isRetryableError(error) {
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
function wrapError(error, code = 'UNKNOWN_ERROR') {
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
//# sourceMappingURL=errors.js.map