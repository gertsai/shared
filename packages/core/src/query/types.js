// ============================================================================
// Type Guards
// ============================================================================
/**
 * Type guard for successful query result
 */
export function isQuerySuccess(result) {
    return result.status === 'success';
}
/**
 * Type guard for failed query result
 */
export function isQueryFailure(result) {
    return result.status === 'error';
}
/**
 * Type guard for partial query result
 */
export function isQueryPartial(result) {
    return result.status === 'partial';
}
// ============================================================================
// Factory Functions
// ============================================================================
/**
 * Create a successful query result
 *
 * @example
 * ```typescript
 * const result = querySuccess(
 *   { answer: 'NeuraTech is an AI company' },
 *   [{ id: 'e1', type: 'entity', score: 0.95 }],
 *   150,
 *   { confidence: 0.9, cached: false }
 * );
 * ```
 */
export function querySuccess(data, sources, durationMs, options) {
    return {
        status: 'success',
        data,
        sources,
        metadata: {
            durationMs,
            cached: options?.cached ?? false,
            confidence: options?.confidence,
            custom: options?.custom,
        },
    };
}
/**
 * Create a failed query result
 *
 * @example
 * ```typescript
 * const result = queryFailure(
 *   'VALIDATION_FAILED',
 *   'Invalid query syntax',
 *   { retryable: false, details: { field: 'question' } }
 * );
 * ```
 */
export function queryFailure(code, message, options) {
    return {
        status: 'error',
        code,
        message,
        retryable: options?.retryable ?? false,
        details: options?.details,
    };
}
/**
 * Create a partial query result (for streaming)
 *
 * @example
 * ```typescript
 * const result = queryPartial(
 *   { chunk: 'Processing...' },
 *   0.5,
 *   [],
 *   100
 * );
 * ```
 */
export function queryPartial(data, progress, sources, durationMs, options) {
    return {
        status: 'partial',
        data,
        progress: Math.max(0, Math.min(1, progress)), // Clamp to 0-1
        sources,
        metadata: {
            durationMs,
            cached: options?.cached ?? false,
            confidence: options?.confidence,
            custom: options?.custom,
        },
    };
}
// ============================================================================
// Common Error Codes
// ============================================================================
/**
 * Standard query error codes.
 * Extensions can add custom codes.
 */
export const QUERY_ERROR_CODES = {
    // Validation errors
    VALIDATION_FAILED: 'VALIDATION_FAILED',
    INVALID_QUERY: 'INVALID_QUERY',
    INVALID_TENANT: 'INVALID_TENANT',
    // Execution errors
    EXECUTION_FAILED: 'EXECUTION_FAILED',
    TIMEOUT: 'TIMEOUT',
    CANCELLED: 'CANCELLED',
    // Resource errors
    NOT_FOUND: 'NOT_FOUND',
    NO_EXECUTOR: 'NO_EXECUTOR',
    EXECUTOR_NOT_FOUND: 'EXECUTOR_NOT_FOUND',
    // Security errors
    PERMISSION_DENIED: 'PERMISSION_DENIED',
    INJECTION_DETECTED: 'INJECTION_DETECTED',
    // Rate limiting
    RATE_LIMITED: 'RATE_LIMITED',
    QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',
    // Infrastructure
    SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
    INTERNAL_ERROR: 'INTERNAL_ERROR',
};
// ============================================================================
// Query Error Class
// ============================================================================
/**
 * Query error class for throwing.
 * Can be caught and converted to QueryFailure.
 */
export class QueryError extends Error {
    code;
    retryable;
    details;
    constructor(code, message, options) {
        super(message, { cause: options?.cause });
        this.name = 'QueryError';
        this.code = code;
        this.retryable = options?.retryable ?? false;
        this.details = options?.details;
        // Maintain proper stack trace in V8
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, QueryError);
        }
    }
    /**
     * Convert to QueryFailure
     */
    toFailure() {
        return queryFailure(this.code, this.message, {
            retryable: this.retryable,
            details: this.details,
        });
    }
    /**
     * Check if error is a specific code
     */
    is(code) {
        return this.code === code;
    }
}
/**
 * Type guard for QueryError
 */
export function isQueryError(error) {
    return error instanceof QueryError;
}
