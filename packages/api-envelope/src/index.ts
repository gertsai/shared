/**
 * @gertsai/api-envelope — RFC-030 Envelope Shared Kernel
 *
 * Browser-safe Tier-1 package extracted from `@gertsai/api-core/lib/envelope/`
 * in Wave 15.A (PRD-050 / EVID-067 §15.A).
 *
 * Provides response and error wrapping for unified API format.
 *
 * @packageDocumentation
 */

// ============================================================================
// Envelope Type Definitions (source of truth)
// ============================================================================

// --- Response types ---
export {
  type UsageInfo,
  type GertsObjectType,
  type GertsResponse,
  type IdPrefix,
  ID_PREFIXES,
  generateId,
  createGertsResponse,
  validateUsageInfo,
  validateGertsResponse,
  validateGertsResponseEquals,
  assertGertsResponse,
  isGertsResponse,
  isSuccessResponse,
} from './types/response';

// --- Error types (full surface; api-core shim filters collisions) ---
export {
  type GertsErrorType,
  type GertsErrorCode,
  type GertsProcessingStage,
  type GertsErrorDetail,
  type GertsErrorResponse,
  type ProblemDetailsLike,
  ERROR_STATUS_CODES,
  RETRYABLE_ERROR_CODES,
  generateRequestId,
  createGertsError,
  getStatusCode,
  isRetryable,
  validationError,
  notFoundError,
  authError,
  rateLimitError,
  internalError,
  validateGertsError,
  validateGertsErrorEquals,
  assertGertsError,
  isGertsError,
  toProblemDetails,
  isErrorResponse,
} from './types/error';

// --- List types ---
export {
  type PaginationInfo,
  type PaginationParams,
  type SortConfig,
  type GertsListResponse,
  encodeCursor,
  decodeCursor,
  createGertsListResponse,
  createPaginationInfo,
  pageToOffset,
  offsetToPage,
  totalPages,
  validatePaginationInfo,
  validatePaginationParams,
  validateGertsListResponse,
  isGertsListResponse,
  isListResponse,
} from './types/list';

// --- Combined types ---
export { type GertsAnyResponse, isAnySuccessResponse } from './types';

// ============================================================================
// Response Wrapping
// ============================================================================
export {
  // Response wrapper
  wrapSuccessResponse,
  wrapErrorResponse,
  buildResponsePayload,
  wantsLegacyFormat,
  // Type detection
  detectObjectType,
  getIdPrefix,
  // Types
  type WrapResponseOptions,
  type WrapErrorOptions,
} from './response-wrapper';

export {
  // Type helpers
  toBaseResponse,
  // Type guards
  isOrchestraInfo,
  assertOrchestraInfo,
  getOrchestraInfo,
  isTenantContextMeta,
  extractTenantId,
  extractTraceId,
  extractRequestId,
  isUsageInfo,
  extractUsageInfo,
  extractPackageInfo,
  // SEC-002: Tenant validation
  validateTenantIdFormat,
  isTenantIdValid,
  TENANT_ID_REGEX,
  // Types
  type OrchestraInfo,
  type TenantContextMeta,
  type RequestLike,
  type PackageJsonLike,
} from './type-guards';

// ============================================================================
// Orchestra structural shims
// ============================================================================
//
// These are local structural counterparts of api-core's
// `OrchestraApiResponse<CODE>` and `ResponseCode`. Real api-core instances
// satisfy them via duck-typing. Exported for downstream packages that build
// adapters over the envelope without taking a hard dep on api-core.
//
// Wave 15.A (PRD-050 / EVID-067 §15.A).
export type { OrchestraApiResponseLike, ResponseCodeLike } from './orchestra-shim';
