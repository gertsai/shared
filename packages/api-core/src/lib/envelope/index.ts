/**
 * RFC-030 Envelope Module
 *
 * Provides response and error wrapping for unified API format.
 *
 * @packageDocumentation
 */

// ============================================================================
// Envelope Type Definitions (source of truth)
//
// NOTE: Some names are excluded to avoid collisions with api-core's own exports:
//   - validationError, notFoundError, rateLimitError, internalError, authError
//     (api-core has its own versions in ./error/helpers.ts returning APIError)
//   - GertsProcessingStage (already in ./apiResponse/types.ts)
// These are still available via direct import from './types/error'
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

// --- Error types (excluding colliding convenience creators) ---
export {
  type GertsErrorType,
  type GertsErrorCode,
  // GertsProcessingStage excluded — already in apiResponse/types.ts
  type GertsErrorDetail,
  type GertsErrorResponse,
  ERROR_STATUS_CODES,
  RETRYABLE_ERROR_CODES,
  generateRequestId,
  createGertsError,
  getStatusCode,
  isRetryable,
  // Convenience creators excluded — collide with api-core error helpers:
  // validationError, notFoundError, authError, rateLimitError, internalError
  validateGertsError,
  validateGertsErrorEquals,
  assertGertsError,
  isGertsError,
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
// Response Wrapping (api-core specific)
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
