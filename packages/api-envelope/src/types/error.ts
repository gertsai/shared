/**
 * Unified Error Response
 *
 * RFC-030: GertsErrorResponse — unified error response for all gerts.ai API errors.
 * Combines RFC 9457 Problem Details + OpenAI error format + Agno retryable flag.
 *
 * @see apps/pipeline/docs/RFC-030-UNIFIED-API-PROTOCOL.md
 * @see https://www.rfc-editor.org/rfc/rfc9457.html
 * @packageDocumentation
 */
import typia, { tags } from 'typia';

// ============================================================================
// Error Types (OpenAI-compatible)
// ============================================================================

/**
 * Error type categories following OpenAI conventions.
 */
export type GertsErrorType =
  | 'validation_error'
  | 'authentication_error'
  | 'permission_error'
  | 'not_found_error'
  | 'conflict_error'
  | 'rate_limit_error'
  | 'server_error'
  | 'service_unavailable'
  | 'timeout_error'
  | 'bad_request_error';

/**
 * Specific error codes for programmatic handling.
 */
export type GertsErrorCode =
  // Authentication errors
  | 'INVALID_API_KEY'
  | 'EXPIRED_API_KEY'
  | 'MISSING_API_KEY'
  | 'INSUFFICIENT_SCOPE'
  // Tenant errors
  | 'TENANT_NOT_FOUND'
  | 'TENANT_DISABLED'
  | 'TENANT_QUOTA_EXCEEDED'
  // Resource errors
  | 'ENTITY_NOT_FOUND'
  | 'DOCUMENT_NOT_FOUND'
  | 'CHUNK_NOT_FOUND'
  | 'COMMUNITY_NOT_FOUND'
  | 'JOB_NOT_FOUND'
  | 'RELATIONSHIP_NOT_FOUND'
  // Validation errors
  | 'INVALID_QUERY'
  | 'INVALID_CYPHER'
  | 'INVALID_PARAMS'
  | 'MISSING_REQUIRED_FIELD'
  | 'INVALID_FORMAT'
  // Rate limiting
  | 'RATE_LIMIT_EXCEEDED'
  | 'TOKEN_LIMIT_EXCEEDED'
  | 'REQUEST_LIMIT_EXCEEDED'
  // Service errors
  | 'GRAPH_CONNECTION_ERROR'
  | 'VECTOR_CONNECTION_ERROR'
  | 'LLM_ERROR'
  | 'LLM_TIMEOUT'
  | 'LLM_RATE_LIMIT'
  | 'EMBEDDING_ERROR'
  // Operation errors
  | 'TIMEOUT_ERROR'
  | 'OPERATION_FAILED'
  | 'CONFLICT'
  | 'ONTOLOGY_NOT_LOADED'
  | 'EXTRACTION_FAILED'
  // Generic
  | 'VALIDATION_ERROR'
  | 'INTERNAL_ERROR'
  | 'SERVICE_UNAVAILABLE';

/**
 * Processing stage where error occurred (VoltAgent-style).
 * Helps identify which component failed.
 */
export type GertsProcessingStage =
  | 'routing'
  | 'retrieval'
  | 'generation'
  | 'tool_execution'
  | 'grounding'
  | 'extraction'
  | 'embedding'
  | 'graph_query'
  | 'vector_search'
  | 'community_detection'
  | 'summarization'
  | 'validation'
  | 'authentication'
  | 'rate_limiting';

// ============================================================================
// Error Detail Structure
// ============================================================================

/**
 * Detailed error information following RFC 9457 + OpenAI format.
 */
export interface GertsErrorDetail {
  /**
   * Human-readable error message.
   * Should be safe to display to end users.
   */
  message: string;

  /**
   * Error type category (OpenAI-compatible).
   */
  type: GertsErrorType;

  /**
   * Specific error code for programmatic handling.
   */
  code: GertsErrorCode;

  /**
   * Parameter that caused the error (for validation errors).
   *
   * @example 'tenantId', 'question', 'mode'
   */
  param?: string;

  /**
   * Processing stage where error occurred.
   * Helps identify which component failed.
   */
  stage?: GertsProcessingStage;

  /**
   * Whether this error is retryable (Agno pattern).
   * Critical for client-side retry logic!
   */
  retryable: boolean;

  /**
   * Seconds to wait before retrying (for rate limit errors).
   * Only present when retryable is true.
   */
  retry_after?: number & tags.Type<'uint32'> & tags.Minimum<0>;

  /**
   * Additional debug information.
   * Only included in non-production environments.
   */
  details?: Record<string, unknown>;
}

// ============================================================================
// GertsErrorResponse — Unified Error Envelope
// ============================================================================

/**
 * Unified error response for all gerts.ai API errors.
 *
 * Combines patterns from:
 * - **RFC 9457**: Problem Details for HTTP APIs
 * - **OpenAI**: `error.type`, `error.code`, `error.param`
 * - **VoltAgent**: `error.stage` for pipeline debugging
 * - **Agno**: `error.retryable` flag for retry logic
 *
 * @example
 * ```typescript
 * // Validation error
 * const error: GertsErrorResponse = {
 *   success: false,
 *   error: {
 *     message: 'Invalid query parameter',
 *     type: 'validation_error',
 *     code: 'INVALID_QUERY',
 *     param: 'question',
 *     retryable: false,
 *   },
 *   request_id: 'req_abc123def456',
 *   timestamp: '2025-01-05T12:00:00.000Z',
 * };
 *
 * // Rate limit error (retryable)
 * const rateLimitError: GertsErrorResponse = {
 *   success: false,
 *   error: {
 *     message: 'Rate limit exceeded. Please retry after 60 seconds.',
 *     type: 'rate_limit_error',
 *     code: 'RATE_LIMIT_EXCEEDED',
 *     retryable: true,
 *     retry_after: 60,
 *   },
 *   request_id: 'req_xyz789ghi012',
 *   timestamp: '2025-01-05T12:00:00.000Z',
 * };
 * ```
 */
/**
 * @deprecated Wave 14.4 (PRD-046 / EVID-057 §Error Envelope):
 * `GertsErrorResponse` (RFC-030 hybrid envelope) is being phased out in
 * favour of the canonical RFC 9457 `ProblemDetails` from `@gertsai/errors/http`
 * per ADR-006 §A1.5. Use `appErrorToHttpResponse(err)` to build a canonical
 * `ProblemDetails` body, or use `toProblemDetails(gertsError)` (in this file)
 * to migrate existing GertsErrorResponse instances.
 *
 * Removal: planned for `@gertsai/api-core@1.0.0` (next major).
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc9457}
 * @see `appErrorToHttpResponse` from `@gertsai/errors/http`
 * @see {@link toProblemDetails} for migration helper
 */
export interface GertsErrorResponse {
  /**
   * Success indicator. Always `false` for error responses.
   */
  success: false;

  /**
   * Error details.
   */
  error: GertsErrorDetail;

  /**
   * Unique request ID for support/debugging.
   * Format: `req_{random12chars}`
   */
  request_id: string;

  /**
   * ISO 8601 timestamp of when error occurred.
   */
  timestamp: string & tags.Format<'date-time'>;

  /**
   * URL to relevant documentation.
   * Helps developers understand and fix the error.
   */
  documentation_url?: string & tags.Format<'uri'>;

  /**
   * Tenant ID (if available).
   */
  tenant_id?: string;

  /**
   * OpenTelemetry trace ID for distributed tracing.
   */
  trace_id?: string;
}

// ============================================================================
// HTTP Status Code Mapping
// ============================================================================

/**
 * Map error types to HTTP status codes.
 */
export const ERROR_STATUS_CODES: Record<GertsErrorType, number> = {
  validation_error: 400,
  bad_request_error: 400,
  authentication_error: 401,
  permission_error: 403,
  not_found_error: 404,
  conflict_error: 409,
  rate_limit_error: 429,
  timeout_error: 504,
  server_error: 500,
  service_unavailable: 503,
} as const;

/**
 * Map error codes to retryable status.
 */
export const RETRYABLE_ERROR_CODES: Set<GertsErrorCode> = new Set([
  'RATE_LIMIT_EXCEEDED',
  'TOKEN_LIMIT_EXCEEDED',
  'REQUEST_LIMIT_EXCEEDED',
  'LLM_TIMEOUT',
  'LLM_RATE_LIMIT',
  'TIMEOUT_ERROR',
  'GRAPH_CONNECTION_ERROR',
  'VECTOR_CONNECTION_ERROR',
  'SERVICE_UNAVAILABLE',
]);

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate a unique request ID.
 *
 * @returns Request ID in format `req_{random12chars}`
 */
export function generateRequestId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let random = '';
  for (let i = 0; i < 12; i++) {
    random += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `req_${random}`;
}

/**
 * Create a GertsErrorResponse.
 *
 * @deprecated Wave 14.4 (PRD-046 / EVID-057): build a canonical RFC 9457
 *   `ProblemDetails` body via `appErrorToHttpResponse(err)` from
 *   `@gertsai/errors/http` instead. Removal in `@gertsai/api-core@1.0.0`.
 *
 * @see `appErrorToHttpResponse` from `@gertsai/errors/http`
 * @see {@link toProblemDetails} to migrate an existing GertsErrorResponse
 *
 * @param params - Error parameters
 * @returns Complete GertsErrorResponse object
 *
 * @example
 * ```typescript
 * const error = createGertsError({
 *   type: 'not_found_error',
 *   code: 'ENTITY_NOT_FOUND',
 *   message: 'Entity with ID "xyz" not found',
 *   param: 'entityId',
 *   stage: 'graph_query',
 * });
 * ```
 */
export function createGertsError(params: {
  /** Error type category */
  type: GertsErrorType;
  /** Specific error code */
  code: GertsErrorCode;
  /** Human-readable message */
  message: string;
  /** Parameter that caused error */
  param?: string;
  /** Processing stage */
  stage?: GertsProcessingStage;
  /** Override retryable status */
  retryable?: boolean;
  /** Seconds to retry after */
  retry_after?: number;
  /** Additional details */
  details?: Record<string, unknown>;
  /** Tenant ID */
  tenant_id?: string;
  /** Trace ID */
  trace_id?: string;
  /** Request ID (auto-generated if not provided) */
  request_id?: string;
  /** Documentation URL */
  documentation_url?: string;
}): GertsErrorResponse {
  const retryable = params.retryable ?? RETRYABLE_ERROR_CODES.has(params.code);

  return {
    success: false,
    error: {
      message: params.message,
      type: params.type,
      code: params.code,
      retryable,
      ...(params.param && { param: params.param }),
      ...(params.stage && { stage: params.stage }),
      ...(params.retry_after && {
        retry_after: params.retry_after as number & tags.Type<'uint32'> & tags.Minimum<0>,
      }),
      ...(params.details && { details: params.details }),
    },
    request_id: params.request_id || generateRequestId(),
    timestamp: new Date().toISOString() as string & tags.Format<'date-time'>,
    ...(params.tenant_id && { tenant_id: params.tenant_id }),
    ...(params.trace_id && { trace_id: params.trace_id }),
    ...(params.documentation_url && {
      documentation_url: params.documentation_url as string & tags.Format<'uri'>,
    }),
  };
}

/**
 * Get HTTP status code for error type.
 */
export function getStatusCode(errorType: GertsErrorType): number {
  return ERROR_STATUS_CODES[errorType] || 500;
}

/**
 * Check if an error code is retryable.
 */
export function isRetryable(code: GertsErrorCode): boolean {
  return RETRYABLE_ERROR_CODES.has(code);
}

// ============================================================================
// Convenience Error Creators
// ============================================================================

/**
 * Create a validation error response.
 */
export function validationError(
  message: string,
  param?: string,
  details?: Record<string, unknown>,
): GertsErrorResponse {
  return createGertsError({
    type: 'validation_error',
    code: 'VALIDATION_ERROR',
    message,
    stage: 'validation',
    ...(param !== undefined && { param }),
    ...(details !== undefined && { details }),
  });
}

/**
 * Create a not found error response.
 */
export function notFoundError(
  resource: string,
  id: string,
  code: GertsErrorCode = 'ENTITY_NOT_FOUND',
): GertsErrorResponse {
  return createGertsError({
    type: 'not_found_error',
    code,
    message: `${resource} with ID "${id}" not found`,
  });
}

/**
 * Create an authentication error response.
 */
export function authError(
  message: string = 'Invalid or missing API key',
  code: GertsErrorCode = 'INVALID_API_KEY',
): GertsErrorResponse {
  return createGertsError({
    type: 'authentication_error',
    code,
    message,
    stage: 'authentication',
  });
}

/**
 * Create a rate limit error response.
 */
export function rateLimitError(retryAfterSeconds: number, message?: string): GertsErrorResponse {
  return createGertsError({
    type: 'rate_limit_error',
    code: 'RATE_LIMIT_EXCEEDED',
    message: message || `Rate limit exceeded. Please retry after ${retryAfterSeconds} seconds.`,
    stage: 'rate_limiting',
    retryable: true,
    retry_after: retryAfterSeconds,
  });
}

/**
 * Create an internal server error response.
 */
export function internalError(
  message: string = 'An internal error occurred',
  details?: Record<string, unknown>,
): GertsErrorResponse {
  return createGertsError({
    type: 'server_error',
    code: 'INTERNAL_ERROR',
    message,
    ...(details !== undefined && { details }),
  });
}

// ============================================================================
// Typia Validators (compile-time generated!)
// ============================================================================

/**
 * Validate GertsErrorResponse structure.
 *
 * @deprecated Wave 14.4 (PRD-046 / EVID-057): use ProblemDetails from
 *   `@gertsai/errors/http` instead. Removal in `@gertsai/api-core@1.0.0`.
 */
export const validateGertsError = typia.createValidate<GertsErrorResponse>();

/**
 * Validate GertsErrorResponse with strict equality.
 *
 * @deprecated Wave 14.4 (PRD-046 / EVID-057): use ProblemDetails from
 *   `@gertsai/errors/http` instead. Removal in `@gertsai/api-core@1.0.0`.
 */
export const validateGertsErrorEquals = typia.createValidate<GertsErrorResponse>();

/**
 * Assert GertsErrorResponse is valid (throws on error).
 *
 * @deprecated Wave 14.4 (PRD-046 / EVID-057): use ProblemDetails from
 *   `@gertsai/errors/http` instead. Removal in `@gertsai/api-core@1.0.0`.
 */
export const assertGertsError = typia.createAssert<GertsErrorResponse>();

/**
 * Check if value is a valid GertsErrorResponse.
 *
 * @deprecated Wave 14.4 (PRD-046 / EVID-057): use ProblemDetails from
 *   `@gertsai/errors/http` instead. Removal in `@gertsai/api-core@1.0.0`.
 */
export const isGertsError = typia.createIs<GertsErrorResponse>();

// ============================================================================
// Wave 14.4 Migration Helper — GertsErrorResponse → RFC 9457 ProblemDetails
// ============================================================================

/**
 * RFC 9457 ProblemDetails shape (canonical per ADR-006 §A1.5).
 *
 * Mirrors `@gertsai/errors/http.ProblemDetails` field-for-field. Defined
 * locally here so this helper doesn't introduce a new dependency on
 * `@gertsai/errors` from `@gertsai/api-core`. Consumers building a real
 * HTTP response body should prefer the canonical type at runtime — the
 * shapes are structurally identical.
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc9457}
 * @see `appErrorToHttpResponse` from `@gertsai/errors/http`
 */
export interface ProblemDetailsLike {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail?: string;
  readonly instance?: string;
  readonly details?: Readonly<Record<string, unknown>>;
  readonly correlationId?: string;
}

/**
 * URN-prefix mapping for GertsErrorType → ADR-006 ProblemDetails bucket.
 * Mirrors `PROBLEM_TYPE_BUCKETS` from `@gertsai/errors/http`.
 */
const GERTS_TYPE_TO_PROBLEM_URN: Readonly<Record<GertsErrorType, string>> = {
  validation_error: 'urn:gertsai:errors:validation',
  bad_request_error: 'urn:gertsai:errors:validation',
  authentication_error: 'urn:gertsai:errors:unauthenticated',
  permission_error: 'urn:gertsai:errors:permission',
  not_found_error: 'urn:gertsai:errors:not-found',
  conflict_error: 'urn:gertsai:errors:conflict',
  rate_limit_error: 'urn:gertsai:errors:rate-limit',
  timeout_error: 'urn:gertsai:errors:timeout',
  server_error: 'urn:gertsai:errors:server',
  service_unavailable: 'urn:gertsai:errors:server',
} as const;

/**
 * Map a `GertsErrorResponse` (RFC-030 envelope) → RFC 9457 ProblemDetails.
 *
 * Wave 14.4 (PRD-046 / EVID-057) migration helper. RFC-030-specific extras
 * (`request_id`, `retryable`, `retry_after`, `stage`, `tenant_id`, `param`,
 * `code`) land in `ProblemDetails.details`. `trace_id` maps to
 * `correlationId`. Use this to ease migration off `GertsErrorResponse`
 * ahead of its removal in `@gertsai/api-core@1.0.0`.
 *
 * @example
 * ```typescript
 * const gertsError = createGertsError({ type: 'not_found_error', code: 'X', message: 'not found' });
 * const problem = toProblemDetails(gertsError);
 * // problem === { type: 'urn:gertsai:errors:not-found', title: 'not found', status: 404,
 * //   detail: 'not found', details: { code: 'X', requestId: 'req_...', retryable: false } }
 * ```
 *
 * @param error - GertsErrorResponse to migrate
 * @returns Equivalent ProblemDetails body (status code lookup via {@link getStatusCode})
 */
// eslint-disable-next-line @typescript-eslint/no-deprecated
export function toProblemDetails(error: GertsErrorResponse): ProblemDetailsLike {
  const status = ERROR_STATUS_CODES[error.error.type] ?? 500;
  const details: Record<string, unknown> = {
    code: error.error.code,
    retryable: error.error.retryable,
    requestId: error.request_id,
    timestamp: error.timestamp,
  };
  if (error.error.param !== undefined) details.param = error.error.param;
  if (error.error.stage !== undefined) details.stage = error.error.stage;
  if (error.error.retry_after !== undefined) details.retryAfter = error.error.retry_after;
  if (error.error.details !== undefined) {
    Object.assign(details, error.error.details);
  }
  if (error.tenant_id !== undefined) details.tenantId = error.tenant_id;
  if (error.documentation_url !== undefined) details.documentationUrl = error.documentation_url;

  return {
    type: GERTS_TYPE_TO_PROBLEM_URN[error.error.type] ?? 'urn:gertsai:errors:server',
    title: error.error.message,
    status,
    detail: error.error.message,
    details,
    ...(error.trace_id !== undefined ? { correlationId: error.trace_id } : {}),
  };
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard for error responses.
 */
// eslint-disable-next-line @typescript-eslint/no-deprecated
export function isErrorResponse(response: unknown): response is GertsErrorResponse {
  return (
    typeof response === 'object' &&
    response !== null &&
    'success' in response &&
    (response as { success: unknown }).success === false &&
    'error' in response
  );
}
