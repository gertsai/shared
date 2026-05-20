/**
 * Error envelope support types.
 *
 * Wave 14.6 (PRD-054 / EVID-057 §Error Envelope — FINAL):
 *
 * The RFC-030 hybrid `GertsErrorResponse` envelope, its `createGertsError`
 * factory, typia validators (`validateGertsError`, `validateGertsErrorEquals`,
 * `assertGertsError`, `isGertsError`), the migration helper
 * `toProblemDetails`, the local `ProblemDetailsLike` interface and the
 * convenience creators (`validationError`/`notFoundError`/`authError`/
 * `rateLimitError`/`internalError`) and `isErrorResponse` type guard
 * have all been REMOVED in this wave. The canonical error wire format is
 * now RFC 9457 `ProblemDetails` from `@gertsai/errors/http` per ADR-006
 * §A1.5. Outbound errors are built via `appErrorToHttpResponse(err)` (HTTP
 * helper that produces a `ProblemDetails` body + status from any `AppError`).
 *
 * What remains here:
 *
 *   - `GertsErrorType` / `GertsErrorCode` / `GertsProcessingStage` enums —
 *     still consumed by `response-wrapper.ts` (the Orchestra-response-code
 *     mapper) and by `@gertsai/api-core/lib/apiResponse/types.ts` (the
 *     Orchestra `ResponseCode` taxonomy mirrors `GertsProcessingStage`).
 *     These types describe a *taxonomy*, not a wire envelope, so they
 *     survive the wire-format removal.
 *
 *   - `ERROR_STATUS_CODES` / `RETRYABLE_ERROR_CODES` — small lookup tables
 *     consumed by `wrapErrorResponse` and by `getStatusCode` / `isRetryable`
 *     helpers.
 *
 *   - `getStatusCode(type)` / `isRetryable(code)` — taxonomy queries.
 *
 *   - `generateRequestId()` — small utility for `X-Request-ID` headers and
 *     `ProblemDetails.details.requestId`. Keeps `wrapErrorResponse`
 *     dependency-light (no need to pull `crypto.randomUUID` ergonomics
 *     into Tier-1 browser code).
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc9457}
 * @see `appErrorToHttpResponse` from `@gertsai/errors/http`
 * @packageDocumentation
 */

// ============================================================================
// Error Types (OpenAI-compatible)
// ============================================================================

/**
 * Error type categories following OpenAI conventions.
 *
 * Used internally by `wrapErrorResponse` to map Orchestra `ResponseCode`s to
 * a stable taxonomy that survives the wire shift to RFC 9457 ProblemDetails
 * (`ProblemDetails.details.type` holds this value).
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
 *
 * Lands on `ProblemDetails.details.code` (RFC 9457 ProblemDetails extension
 * member per ADR-006 §A1.5 — RFC permits arbitrary additional members).
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
 * Helps identify which component failed; lands on
 * `ProblemDetails.details.stage`.
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
// URN-prefix mapping for GertsErrorType → ADR-006 ProblemDetails bucket.
// Mirrors `PROBLEM_TYPE_BUCKETS` from `@gertsai/errors/http`. Used by
// `wrapErrorResponse` to produce canonical RFC 9457 `type` URNs.
// ============================================================================

export const GERTS_TYPE_TO_PROBLEM_URN: Readonly<Record<GertsErrorType, string>> = {
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
