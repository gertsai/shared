/**
 * @fileoverview RAG Error Types (RFC-036)
 *
 * Error handling following:
 * - RFC 9457 Problem Details for HTTP APIs
 * - OpenAI-compatible error format
 *
 * @module @gerts/core/rag
 */

import { createResponseId, type ResponseId } from './response';
import type { RAGCapabilities, RAGResponse } from './capabilities';

// ============================================
// Error Stages
// ============================================

/**
 * Stage in the RAG pipeline where error occurred.
 */
export type RAGErrorStage =
  | 'validation'   // Request validation failed
  | 'retrieval'    // Retrieval phase failed
  | 'generation'   // LLM generation failed
  | 'grounding'    // Grounding phase failed
  | 'graph'        // Graph traversal failed
  | 'streaming'    // Streaming failed
  | 'unknown';     // Unknown stage

// ============================================
// Error Codes
// ============================================

/**
 * Specific error codes for programmatic handling.
 */
export type RAGErrorCode =
  // === Validation (400) ===
  | 'INVALID_REQUEST'
  | 'INVALID_TENANT'
  | 'INVALID_CAPABILITIES'
  | 'QUESTION_TOO_LONG'
  | 'QUESTION_EMPTY'
  | 'INVALID_FILTER'

  // === Authentication (401) ===
  | 'AUTHENTICATION_REQUIRED'
  | 'INVALID_API_KEY'
  | 'API_KEY_EXPIRED'

  // === Authorization (403) ===
  | 'PERMISSION_DENIED'
  | 'TENANT_NOT_ALLOWED'
  | 'CAPABILITY_NOT_ALLOWED'

  // === Not Found (404) ===
  | 'TENANT_NOT_FOUND'
  | 'COLLECTION_NOT_FOUND'

  // === Rate Limiting (429) ===
  | 'RATE_LIMITED'
  | 'QUOTA_EXCEEDED'

  // === Retrieval (5xx) ===
  | 'RETRIEVAL_TIMEOUT'
  | 'RETRIEVAL_CONNECTION_FAILED'
  | 'NO_SOURCES_FOUND'
  | 'EMBEDDING_FAILED'

  // === Generation (5xx) ===
  | 'GENERATION_TIMEOUT'
  | 'GENERATION_RATE_LIMITED'
  | 'GENERATION_CONTENT_FILTER'
  | 'GENERATION_CONTEXT_TOO_LONG'
  | 'GENERATION_FAILED'

  // === Graph (5xx) ===
  | 'GRAPH_CONNECTION_FAILED'
  | 'GRAPH_QUERY_TIMEOUT'
  | 'GRAPH_QUERY_FAILED'

  // === Internal (500) ===
  | 'INTERNAL_ERROR'
  | 'SERVICE_UNAVAILABLE'
  | 'UNKNOWN_ERROR';

// ============================================
// Error Type Mapping
// ============================================

/**
 * Maps error codes to HTTP status codes.
 */
export const ERROR_STATUS_CODES: Record<RAGErrorCode, number> = {
  // Validation
  INVALID_REQUEST: 400,
  INVALID_TENANT: 400,
  INVALID_CAPABILITIES: 400,
  QUESTION_TOO_LONG: 400,
  QUESTION_EMPTY: 400,
  INVALID_FILTER: 400,

  // Authentication
  AUTHENTICATION_REQUIRED: 401,
  INVALID_API_KEY: 401,
  API_KEY_EXPIRED: 401,

  // Authorization
  PERMISSION_DENIED: 403,
  TENANT_NOT_ALLOWED: 403,
  CAPABILITY_NOT_ALLOWED: 403,

  // Not Found
  TENANT_NOT_FOUND: 404,
  COLLECTION_NOT_FOUND: 404,

  // Rate Limiting
  RATE_LIMITED: 429,
  QUOTA_EXCEEDED: 429,

  // Retrieval
  RETRIEVAL_TIMEOUT: 504,
  RETRIEVAL_CONNECTION_FAILED: 502,
  NO_SOURCES_FOUND: 200, // Not an error, but a valid response
  EMBEDDING_FAILED: 500,

  // Generation
  GENERATION_TIMEOUT: 504,
  GENERATION_RATE_LIMITED: 429,
  GENERATION_CONTENT_FILTER: 400,
  GENERATION_CONTEXT_TOO_LONG: 400,
  GENERATION_FAILED: 500,

  // Graph
  GRAPH_CONNECTION_FAILED: 502,
  GRAPH_QUERY_TIMEOUT: 504,
  GRAPH_QUERY_FAILED: 500,

  // Internal
  INTERNAL_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
  UNKNOWN_ERROR: 500,
};

// ============================================
// RAG Error Interface
// ============================================

/**
 * RAG Error following RFC 9457 + OpenAI format.
 *
 * Combines:
 * - RFC 9457 Problem Details (`type`, `title`, `status`, `detail`, `instance`)
 * - OpenAI error format (`error.message`, `error.type`, `error.code`)
 * - RAG-specific fields (`stage`, `retryable`, `retryAfterMs`)
 *
 * @example
 * ```typescript
 * const error: RAGError = {
 *   type: 'https://api.gerts.ai/errors/validation',
 *   title: 'Validation Error',
 *   status: 400,
 *   detail: 'Question cannot be empty',
 *   error: {
 *     message: 'Question cannot be empty',
 *     type: 'validation_error',
 *     code: 'QUESTION_EMPTY',
 *     param: 'question',
 *   },
 *   stage: 'validation',
 *   retryable: false,
 *   requestId: 'rag_...',
 *   timestamp: '2025-01-03T...',
 * };
 * ```
 */
export interface RAGError {
  // === RFC 9457 Problem Details ===

  /** URI identifying the error type */
  readonly type: string;

  /** Human-readable error title */
  readonly title: string;

  /** HTTP status code */
  readonly status: number;

  /** Human-readable error detail */
  readonly detail: string;

  /** URI identifying the specific occurrence */
  readonly instance?: string;

  // === OpenAI-compatible error ===

  readonly error: {
    /** Human-readable message */
    readonly message: string;

    /** Error type category */
    readonly type: string;

    /** Specific error code */
    readonly code: RAGErrorCode;

    /** Parameter that caused the error (if applicable) */
    readonly param?: string;
  };

  // === RAG Extensions ===

  /** Stage where error occurred */
  readonly stage: RAGErrorStage;

  /** Whether request can be retried */
  readonly retryable: boolean;

  /** Suggested retry delay in milliseconds */
  readonly retryAfterMs?: number;

  // === Observability ===

  /** Request ID for support/debugging */
  readonly requestId: ResponseId;

  /** Trace ID for distributed tracing */
  readonly traceId?: string;

  /** ISO 8601 timestamp */
  readonly timestamp: string;
}

// ============================================
// Error Factory
// ============================================

/**
 * Factory functions for creating common RAG errors.
 *
 * @example
 * ```typescript
 * // Validation error
 * const error = RAGErrors.validation('Question cannot be empty', 'question');
 *
 * // Rate limit error
 * const error = RAGErrors.rateLimited(60000);
 *
 * // Internal error
 * const error = RAGErrors.internal(new Error('Database connection failed'));
 * ```
 */
export const RAGErrors = {
  /**
   * Creates a validation error (400).
   */
  validation: (message: string, param?: string): RAGError => ({
    type: 'https://api.gerts.ai/errors/validation',
    title: 'Validation Error',
    status: 400,
    detail: message,
    error: {
      message,
      type: 'validation_error',
      code: 'INVALID_REQUEST',
      param,
    },
    stage: 'validation',
    retryable: false,
    requestId: createResponseId(),
    timestamp: new Date().toISOString(),
  }),

  /**
   * Creates an invalid tenant error (400).
   */
  invalidTenant: (tenantId: string): RAGError => ({
    type: 'https://api.gerts.ai/errors/invalid-tenant',
    title: 'Invalid Tenant',
    status: 400,
    detail: `Tenant '${tenantId}' is not valid`,
    error: {
      message: `Tenant '${tenantId}' is not valid`,
      type: 'validation_error',
      code: 'INVALID_TENANT',
      param: 'tenantId',
    },
    stage: 'validation',
    retryable: false,
    requestId: createResponseId(),
    timestamp: new Date().toISOString(),
  }),

  /**
   * Creates a tenant not found error (404).
   */
  tenantNotFound: (tenantId: string): RAGError => ({
    type: 'https://api.gerts.ai/errors/tenant-not-found',
    title: 'Tenant Not Found',
    status: 404,
    detail: `Tenant '${tenantId}' does not exist`,
    error: {
      message: `Tenant '${tenantId}' does not exist`,
      type: 'not_found_error',
      code: 'TENANT_NOT_FOUND',
      param: 'tenantId',
    },
    stage: 'validation',
    retryable: false,
    requestId: createResponseId(),
    timestamp: new Date().toISOString(),
  }),

  /**
   * Creates a no sources found response (200).
   * Note: This is not really an error, but a valid response.
   */
  noSources: (): RAGError => ({
    type: 'https://api.gerts.ai/errors/no-sources',
    title: 'No Sources Found',
    status: 200,
    detail: 'No relevant sources found for the query',
    error: {
      message: 'No relevant sources found',
      type: 'retrieval_info',
      code: 'NO_SOURCES_FOUND',
    },
    stage: 'retrieval',
    retryable: false,
    requestId: createResponseId(),
    timestamp: new Date().toISOString(),
  }),

  /**
   * Creates a retrieval timeout error (504).
   */
  retrievalTimeout: (timeoutMs: number): RAGError => ({
    type: 'https://api.gerts.ai/errors/retrieval-timeout',
    title: 'Retrieval Timeout',
    status: 504,
    detail: `Retrieval timed out after ${timeoutMs}ms`,
    error: {
      message: `Retrieval timed out after ${timeoutMs}ms`,
      type: 'timeout_error',
      code: 'RETRIEVAL_TIMEOUT',
    },
    stage: 'retrieval',
    retryable: true,
    retryAfterMs: 1000,
    requestId: createResponseId(),
    timestamp: new Date().toISOString(),
  }),

  /**
   * Creates a retrieval connection error (502).
   */
  retrievalConnectionFailed: (cause?: string): RAGError => ({
    type: 'https://api.gerts.ai/errors/retrieval-connection',
    title: 'Retrieval Connection Failed',
    status: 502,
    detail: cause || 'Failed to connect to vector database',
    error: {
      message: cause || 'Failed to connect to vector database',
      type: 'connection_error',
      code: 'RETRIEVAL_CONNECTION_FAILED',
    },
    stage: 'retrieval',
    retryable: true,
    retryAfterMs: 5000,
    requestId: createResponseId(),
    timestamp: new Date().toISOString(),
  }),

  /**
   * Creates a generation timeout error (504).
   */
  generationTimeout: (timeoutMs: number): RAGError => ({
    type: 'https://api.gerts.ai/errors/generation-timeout',
    title: 'Generation Timeout',
    status: 504,
    detail: `LLM generation timed out after ${timeoutMs}ms`,
    error: {
      message: `LLM generation timed out after ${timeoutMs}ms`,
      type: 'timeout_error',
      code: 'GENERATION_TIMEOUT',
    },
    stage: 'generation',
    retryable: true,
    retryAfterMs: 1000,
    requestId: createResponseId(),
    timestamp: new Date().toISOString(),
  }),

  /**
   * Creates a rate limit error (429).
   */
  rateLimited: (retryAfterMs: number): RAGError => ({
    type: 'https://api.gerts.ai/errors/rate-limit',
    title: 'Rate Limit Exceeded',
    status: 429,
    detail: 'Too many requests, please retry later',
    error: {
      message: 'Rate limit exceeded',
      type: 'rate_limit_error',
      code: 'RATE_LIMITED',
    },
    stage: 'generation',
    retryable: true,
    retryAfterMs,
    requestId: createResponseId(),
    timestamp: new Date().toISOString(),
  }),

  /**
   * Creates a content filter error (400).
   */
  contentFiltered: (reason?: string): RAGError => ({
    type: 'https://api.gerts.ai/errors/content-filter',
    title: 'Content Filtered',
    status: 400,
    detail: reason || 'Content was filtered by safety systems',
    error: {
      message: reason || 'Content was filtered by safety systems',
      type: 'content_filter_error',
      code: 'GENERATION_CONTENT_FILTER',
    },
    stage: 'generation',
    retryable: false,
    requestId: createResponseId(),
    timestamp: new Date().toISOString(),
  }),

  /**
   * Creates a context too long error (400).
   */
  contextTooLong: (tokenCount: number, maxTokens: number): RAGError => ({
    type: 'https://api.gerts.ai/errors/context-too-long',
    title: 'Context Too Long',
    status: 400,
    detail: `Context has ${tokenCount} tokens, maximum is ${maxTokens}`,
    error: {
      message: `Context has ${tokenCount} tokens, maximum is ${maxTokens}`,
      type: 'validation_error',
      code: 'GENERATION_CONTEXT_TOO_LONG',
    },
    stage: 'generation',
    retryable: false,
    requestId: createResponseId(),
    timestamp: new Date().toISOString(),
  }),

  /**
   * Creates a graph connection error (502).
   */
  graphConnectionFailed: (cause?: string): RAGError => ({
    type: 'https://api.gerts.ai/errors/graph-connection',
    title: 'Graph Connection Failed',
    status: 502,
    detail: cause || 'Failed to connect to graph database',
    error: {
      message: cause || 'Failed to connect to graph database',
      type: 'connection_error',
      code: 'GRAPH_CONNECTION_FAILED',
    },
    stage: 'graph',
    retryable: true,
    retryAfterMs: 5000,
    requestId: createResponseId(),
    timestamp: new Date().toISOString(),
  }),

  /**
   * Creates an internal error (500).
   */
  internal: (cause: Error | string): RAGError => {
    const message = typeof cause === 'string' ? cause : cause.message;
    return {
      type: 'https://api.gerts.ai/errors/internal',
      title: 'Internal Error',
      status: 500,
      detail: message,
      error: {
        message,
        type: 'internal_error',
        code: 'INTERNAL_ERROR',
      },
      stage: 'unknown',
      retryable: false,
      requestId: createResponseId(),
      timestamp: new Date().toISOString(),
    };
  },

  /**
   * Creates a service unavailable error (503).
   */
  serviceUnavailable: (retryAfterMs?: number): RAGError => ({
    type: 'https://api.gerts.ai/errors/service-unavailable',
    title: 'Service Unavailable',
    status: 503,
    detail: 'Service is temporarily unavailable',
    error: {
      message: 'Service is temporarily unavailable',
      type: 'service_error',
      code: 'SERVICE_UNAVAILABLE',
    },
    stage: 'unknown',
    retryable: true,
    retryAfterMs: retryAfterMs ?? 30000,
    requestId: createResponseId(),
    timestamp: new Date().toISOString(),
  }),
} as const;

// ============================================
// Partial Success
// ============================================

/**
 * Represents a partially successful response.
 *
 * Used when some capabilities succeed but others fail.
 */
export interface RAGPartialResult<C extends RAGCapabilities> {
  /** Partial response data */
  readonly response: Partial<RAGResponse<C>>;

  /** Capabilities that completed successfully */
  readonly completedCapabilities: readonly (keyof RAGCapabilities)[];

  /** Capabilities that failed with their errors */
  readonly failedCapabilities: ReadonlyArray<{
    readonly capability: keyof RAGCapabilities;
    readonly error: RAGError;
  }>;
}

/**
 * Result type for RAG operations.
 *
 * Represents either:
 * - Full success with complete response
 * - Failure with error
 * - Partial success with partial response and failed capabilities
 *
 * @example
 * ```typescript
 * async function query(request: RAGRequest): Promise<RAGResult<{}>> {
 *   try {
 *     const response = await performQuery(request);
 *     return { success: true, data: response };
 *   } catch (e) {
 *     return { success: false, error: RAGErrors.internal(e) };
 *   }
 * }
 * ```
 */
export type RAGResult<C extends RAGCapabilities> =
  | { readonly success: true; readonly data: RAGResponse<C> }
  | { readonly success: false; readonly error: RAGError }
  | { readonly success: 'partial'; readonly data: RAGPartialResult<C> };

// ============================================
// Error Helpers
// ============================================

/**
 * Checks if an error is retryable.
 */
export function isRetryable(error: RAGError): boolean {
  return error.retryable;
}

/**
 * Gets the HTTP status code for an error code.
 */
export function getStatusCode(code: RAGErrorCode): number {
  return ERROR_STATUS_CODES[code];
}

/**
 * Checks if result is successful.
 */
export function isSuccess<C extends RAGCapabilities>(
  result: RAGResult<C>
): result is { success: true; data: RAGResponse<C> } {
  return result.success === true;
}

/**
 * Checks if result is a failure.
 */
export function isFailure<C extends RAGCapabilities>(
  result: RAGResult<C>
): result is { success: false; error: RAGError } {
  return result.success === false;
}

/**
 * Checks if result is partial success.
 */
export function isPartialSuccess<C extends RAGCapabilities>(
  result: RAGResult<C>
): result is { success: 'partial'; data: RAGPartialResult<C> } {
  return result.success === 'partial';
}
