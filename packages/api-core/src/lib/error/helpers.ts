/**
 * RFC-053: Error Helper Factory Functions
 *
 * Provides convenient factory functions for creating APIError instances.
 * These helpers ensure consistent error messages and proper error codes.
 *
 * @module @gerts/api-core/error/helpers
 */

import { APIError } from './APIError.class';
import { ResponseCode } from '../apiResponse';

// =============================================================================
// Resource Errors (404, 409)
// =============================================================================

/**
 * Create a NOT_FOUND error for a missing resource.
 *
 * @param resource - Type of resource (e.g., 'User', 'Team', 'File')
 * @param id - Optional resource identifier
 * @returns APIError with NOT_FOUND code
 *
 * @example
 * ```typescript
 * throw notFoundError('User', userId);
 * // Message: "User 'abc123' not found"
 *
 * throw notFoundError('Team');
 * // Message: "Team not found"
 * ```
 */
export function notFoundError(resource: string, id?: string): APIError<ResponseCode.NOT_FOUND> {
  const msg = id ? `${resource} '${id}' not found` : `${resource} not found`;
  return new APIError(ResponseCode.NOT_FOUND, undefined, msg);
}

/**
 * Create a CONFLICT error for duplicate resources.
 *
 * @param resource - Type of resource
 * @param id - Optional resource identifier
 * @returns APIError with CONFLICT code
 *
 * @example
 * ```typescript
 * throw conflictError('User', email);
 * // Message: "User 'john@example.com' already exists"
 * ```
 */
export function conflictError(resource: string, id?: string): APIError<ResponseCode.CONFLICT> {
  const msg = id ? `${resource} '${id}' already exists` : `${resource} already exists`;
  return new APIError(ResponseCode.CONFLICT, undefined, msg);
}

// =============================================================================
// Authorization Errors (401, 403)
// =============================================================================

/**
 * Create a FORBIDDEN error for authorization failures.
 *
 * @param message - Optional custom message (default: 'Access denied')
 * @returns APIError with FORBIDDEN code
 *
 * @example
 * ```typescript
 * throw forbiddenError();
 * // Message: "Access denied"
 *
 * throw forbiddenError('Only admins can perform this action');
 * ```
 */
export function forbiddenError(message = 'Access denied'): APIError<ResponseCode.FORBIDDEN> {
  return new APIError(ResponseCode.FORBIDDEN, undefined, message);
}

/**
 * Create a NOT_AUTHORIZED error for authentication failures.
 *
 * @param message - Optional custom message (default: 'Authentication required')
 * @returns APIError with NOT_AUTHORIZED code
 *
 * @example
 * ```typescript
 * throw unauthorizedError();
 * // Message: "Authentication required"
 *
 * throw unauthorizedError('Invalid credentials');
 * ```
 */
export function unauthorizedError(message = 'Authentication required'): APIError<ResponseCode.NOT_AUTHORIZED> {
  return new APIError(ResponseCode.NOT_AUTHORIZED, undefined, message);
}

/**
 * Create a token invalid error.
 *
 * @param message - Optional custom message
 * @returns APIError with NOT_AUTHORIZED__TOKEN_INVALID code
 */
export function tokenInvalidError(
  message = 'Invalid token',
): APIError<ResponseCode.NOT_AUTHORIZED__TOKEN_INVALID> {
  return new APIError(ResponseCode.NOT_AUTHORIZED__TOKEN_INVALID, undefined, message);
}

/**
 * Create a token expired error.
 *
 * @param message - Optional custom message
 * @returns APIError with NOT_AUTHORIZED__TOKEN_EXPIRED code
 */
export function tokenExpiredError(
  message = 'Token has expired',
): APIError<ResponseCode.NOT_AUTHORIZED__TOKEN_EXPIRED> {
  return new APIError(ResponseCode.NOT_AUTHORIZED__TOKEN_EXPIRED, undefined, message);
}

// =============================================================================
// Validation Errors (400)
// =============================================================================

/**
 * Create a BAD_REQUEST error for validation failures.
 *
 * @param message - Validation error message
 * @param details - Optional validation details (e.g., field errors)
 * @returns APIError with BAD_REQUEST__INVALID_PARAMS code
 *
 * @example
 * ```typescript
 * throw validationError('Email is required');
 *
 * throw validationError('Validation failed', {
 *   fields: { email: ['required'], name: ['too_short'] }
 * });
 * ```
 */
export function validationError(
  message: string,
  details?: Record<string, unknown>,
): APIError<ResponseCode.BAD_REQUEST__INVALID_PARAMS> {
  return new APIError(ResponseCode.BAD_REQUEST__INVALID_PARAMS, details, message);
}

/**
 * Create a BAD_REQUEST error for generic client errors.
 *
 * @param message - Error message
 * @returns APIError with BAD_REQUEST code
 */
export function badRequestError(message: string): APIError<ResponseCode.BAD_REQUEST> {
  return new APIError(ResponseCode.BAD_REQUEST, undefined, message);
}

// =============================================================================
// Server Errors (500, 503)
// =============================================================================

/**
 * Create an INTERNAL_ERROR for unexpected server errors.
 * NOTE: Consider logging the cause before throwing.
 *
 * @param message - Error message
 * @param cause - Optional original error (stack will be appended)
 * @returns APIError with INTERNAL_ERROR code
 *
 * @example
 * ```typescript
 * try {
 *   await riskyOperation();
 * } catch (error) {
 *   logger.error('Unexpected error', error);
 *   throw internalError('Failed to process request', error as Error);
 * }
 * ```
 */
export function internalError(message: string, cause?: Error): APIError<ResponseCode.INTERNAL_ERROR> {
  const error = new APIError(ResponseCode.INTERNAL_ERROR, undefined, message);
  if (cause?.stack) {
    error.stack += `\nCaused by: ${cause.stack}`;
  }
  return error;
}

/**
 * Create a SERVICE_UNAVAILABLE error for temporary outages.
 *
 * @param message - Error message (default: 'Service temporarily unavailable')
 * @returns APIError with SERVICE_UNAVAILABLE code
 */
export function serviceUnavailableError(
  message = 'Service temporarily unavailable',
): APIError<ResponseCode.SERVICE_UNAVAILABLE> {
  return new APIError(ResponseCode.SERVICE_UNAVAILABLE, undefined, message);
}

// =============================================================================
// Rate Limiting (429)
// =============================================================================

/**
 * Create a TOO_MANY_REQUESTS error for rate limiting.
 *
 * @param retryAfter - Optional seconds until retry is allowed
 * @param message - Optional custom message
 * @returns APIError with TOO_MANY_REQUESTS code
 *
 * @example
 * ```typescript
 * throw rateLimitError(60); // Retry after 60 seconds
 * throw rateLimitError(30, 'API quota exceeded');
 * ```
 */
export function rateLimitError(
  retryAfter?: number,
  message?: string,
): APIError<ResponseCode.TOO_MANY_REQUESTS> {
  const msg = message ?? (retryAfter ? `Rate limited. Retry after ${retryAfter}s` : 'Too many requests');
  return new APIError(ResponseCode.TOO_MANY_REQUESTS, { retryAfter }, msg);
}

// =============================================================================
// Precondition Errors (412)
// =============================================================================

/**
 * Create a PRECONDITION_FAILED error.
 *
 * @param message - Error message describing failed precondition
 * @returns APIError with PRECONDITION_FAILED code
 *
 * @example
 * ```typescript
 * throw preconditionFailedError('Email must be verified before creating API keys');
 * ```
 */
export function preconditionFailedError(message: string): APIError<ResponseCode.PRECONDITION_FAILED> {
  return new APIError(ResponseCode.PRECONDITION_FAILED, undefined, message);
}

// =============================================================================
// Storage Errors (413, 507)
// =============================================================================

/**
 * Create a PAYLOAD_TOO_LARGE error.
 *
 * @param maxSize - Maximum allowed size in bytes
 * @param actualSize - Actual size in bytes (optional)
 * @returns APIError with PAYLOAD_TOO_LARGE code
 */
export function payloadTooLargeError(
  maxSize: number,
  actualSize?: number,
): APIError<ResponseCode.PAYLOAD_TOO_LARGE> {
  const maxMB = (maxSize / (1024 * 1024)).toFixed(1);
  const msg = actualSize
    ? `Payload too large: ${(actualSize / (1024 * 1024)).toFixed(1)}MB exceeds limit of ${maxMB}MB`
    : `Payload exceeds maximum size of ${maxMB}MB`;
  return new APIError(ResponseCode.PAYLOAD_TOO_LARGE, { maxSize, actualSize }, msg);
}

/**
 * Create an INSUFFICIENT_STORAGE error for quota exceeded.
 *
 * @param message - Error message
 * @returns APIError with INSUFFICIENT_STORAGE code
 */
export function insufficientStorageError(
  message = 'Storage quota exceeded',
): APIError<ResponseCode.INSUFFICIENT_STORAGE> {
  return new APIError(ResponseCode.INSUFFICIENT_STORAGE, undefined, message);
}

// =============================================================================
// Implementation Errors (501)
// =============================================================================

/**
 * Create a NOT_IMPLEMENTED error for unimplemented features.
 *
 * @param feature - Name of the unimplemented feature
 * @returns APIError with NOT_IMPLEMENTED code
 */
export function notImplementedError(feature: string): APIError<ResponseCode.NOT_IMPLEMENTED> {
  return new APIError(ResponseCode.NOT_IMPLEMENTED, undefined, `${feature} is not implemented`);
}

// =============================================================================
// Timeout Errors (408, 504)
// =============================================================================

/**
 * Create a REQUEST_TIMEOUT error.
 *
 * @param timeoutMs - Timeout duration in milliseconds
 * @returns APIError with REQUEST_TIMEOUT code
 */
export function requestTimeoutError(timeoutMs: number): APIError<ResponseCode.REQUEST_TIMEOUT> {
  return new APIError(ResponseCode.REQUEST_TIMEOUT, { timeoutMs }, `Request timed out after ${timeoutMs}ms`);
}

/**
 * Create a GATEWAY_TIMEOUT error.
 *
 * @param service - Name of the service that timed out
 * @returns APIError with GATEWAY_TIMEOUT code
 */
export function gatewayTimeoutError(service: string): APIError<ResponseCode.GATEWAY_TIMEOUT> {
  return new APIError(ResponseCode.GATEWAY_TIMEOUT, undefined, `${service} did not respond in time`);
}
