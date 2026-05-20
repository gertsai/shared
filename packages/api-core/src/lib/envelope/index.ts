/**
 * RFC-030 Envelope Module — back-compat shim.
 *
 * Wave 15.A (PRD-050 / EVID-067 §15.A): the envelope cluster has been
 * extracted into the new Tier-1 package `@gertsai/api-envelope`. This file
 * is now a thin re-export shim that preserves the public surface previously
 * exposed at `@gertsai/api-core/lib/envelope/*`, including the deliberate
 * non-re-exports below.
 *
 * Wave 14.6 (PRD-054 / EVID-057 §Error Envelope — FINAL): the legacy
 * RFC-030 `GertsErrorResponse` envelope, `createGertsError`, the four
 * typia validators (`validateGertsError`, `validateGertsErrorEquals`,
 * `assertGertsError`, `isGertsError`), `toProblemDetails`, the local
 * `ProblemDetailsLike` interface, the convenience creators
 * (`validationError` etc.), and the `isErrorResponse` type guard have
 * been REMOVED. Canonical error wire format is now
 * `ProblemDetails` from `@gertsai/errors/http` (build via
 * `appErrorToHttpResponse(err)`).
 *
 * @see @gertsai/api-envelope
 *
 * NOTE: Some names are excluded to avoid collisions with api-core's own
 * exports:
 *   - GertsProcessingStage (already in ./apiResponse/types.ts)
 * These are still available via direct import from `@gertsai/api-envelope`.
 *
 * @packageDocumentation
 */

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
} from '@gertsai/api-envelope';

// --- Error taxonomy support (wire format is now `ProblemDetails`
//     from `@gertsai/errors/http`) ---
export {
  type GertsErrorType,
  type GertsErrorCode,
  // GertsProcessingStage excluded — already in apiResponse/types.ts
  ERROR_STATUS_CODES,
  RETRYABLE_ERROR_CODES,
  generateRequestId,
  getStatusCode,
  isRetryable,
} from '@gertsai/api-envelope';

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
} from '@gertsai/api-envelope';

// --- Combined types ---
export { type GertsAnyResponse, isAnySuccessResponse } from '@gertsai/api-envelope';

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
} from '@gertsai/api-envelope';

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
} from '@gertsai/api-envelope';
