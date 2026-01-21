/**
 * RFC-030 Envelope Module
 *
 * Provides response and error wrapping for unified API format.
 *
 * @packageDocumentation
 */

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
