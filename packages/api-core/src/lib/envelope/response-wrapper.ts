/**
 * RFC-030 Response Wrapper
 *
 * Transforms OrchestraApiResponse to GertsResponse format.
 * Provides unified response structure across all API endpoints.
 *
 * @packageDocumentation
 */

import type {
  GertsResponse,
  GertsErrorResponse,
  GertsObjectType,
  GertsErrorType,
  GertsErrorCode,
} from '@gerts/api-types';
import { generateId, generateRequestId, RETRYABLE_ERROR_CODES } from '@gerts/api-types';

import type { OrchestraApiResponse } from '../apiResponse/OrchestraApiResponse.class';
import type { ResponseCode } from '../apiResponse/types';
import {
  type OrchestraInfo,
  getOrchestraInfo,
  extractTenantId,
  extractTraceId,
  extractUsageInfo,
  extractPackageInfo,
  wantsLegacyFormat,
} from './type-guards';

// Re-export wantsLegacyFormat for backward compatibility
export { wantsLegacyFormat };

// ============================================================================
// Response Code Mapping
// ============================================================================

/**
 * Map ResponseCode to GertsErrorType
 */
const RESPONSE_CODE_TO_ERROR_TYPE: Record<string, GertsErrorType> = {
  // Validation errors (400)
  '400': 'bad_request_error',
  '400/bad_request': 'bad_request_error',
  '400/01/invalid_params': 'validation_error',
  '400/02/invalid_response': 'validation_error',
  // Auth errors (401)
  '401': 'authentication_error',
  '401/not_authorized': 'authentication_error',
  '401/01/token_invalid': 'authentication_error',
  '401/02/token_expired': 'authentication_error',
  // Permission errors (403)
  '403': 'permission_error',
  '403/forbidden': 'permission_error',
  '403/01/forbidden': 'permission_error',
  '403/insufficient_scope': 'permission_error',
  // Not found (404)
  '404': 'not_found_error',
  '404/not_found': 'not_found_error',
  '404/01/action_not_found': 'not_found_error',
  // Conflict (409)
  '409': 'conflict_error',
  '409/conflict': 'conflict_error',
  // Rate limit (429)
  '429': 'rate_limit_error',
  '429/too_many_requests': 'rate_limit_error',
  // Server errors (5xx)
  '500': 'server_error',
  '500/internal_error': 'server_error',
  '503': 'service_unavailable',
  '503/service_unavailable': 'service_unavailable',
  '504': 'timeout_error',
  '504/gateway_timeout': 'timeout_error',
};

/**
 * Map ResponseCode to GertsErrorCode
 */
const RESPONSE_CODE_TO_ERROR_CODE: Record<string, GertsErrorCode> = {
  // Validation
  '400/01/invalid_params': 'INVALID_PARAMS',
  '400/02/invalid_response': 'VALIDATION_ERROR',
  // Auth
  '401/01/token_invalid': 'INVALID_API_KEY',
  '401/02/token_expired': 'EXPIRED_API_KEY',
  '401/03/user_not_found': 'TENANT_NOT_FOUND',
  // Permission
  '403/insufficient_scope': 'INSUFFICIENT_SCOPE',
  // Not found
  '404/not_found': 'ENTITY_NOT_FOUND',
  '404/01/action_not_found': 'ENTITY_NOT_FOUND',
  // Rate limit
  '429/too_many_requests': 'RATE_LIMIT_EXCEEDED',
  // Server errors
  '500/internal_error': 'INTERNAL_ERROR',
  '503/service_unavailable': 'SERVICE_UNAVAILABLE',
  '504/gateway_timeout': 'TIMEOUT_ERROR',
};

// ============================================================================
// Object Type Detection
// ============================================================================

/**
 * Detect GertsObjectType from response data and endpoint path.
 */
export function detectObjectType(data: unknown, path?: string): GertsObjectType {
  // Check if it's a list response
  if (Array.isArray(data)) {
    // Try to detect from path
    if (path?.includes('/entities')) return 'entity.list';
    if (path?.includes('/relationships')) return 'relationship.list';
    if (path?.includes('/communities')) return 'community.list';
    if (path?.includes('/chunks')) return 'chunk.list';
    if (path?.includes('/jobs')) return 'job.list';
    if (path?.includes('/documents')) return 'document.list';
    return 'list';
  }

  // Check data structure for specific types
  if (typeof data === 'object' && data !== null) {
    const obj = data as Record<string, unknown>;

    // Query result
    if ('answer' in obj && 'sources' in obj) return 'query.result';

    // Analysis result
    if ('category' in obj && 'recommendedMode' in obj) return 'query.analysis';

    // Entity
    if ('type' in obj && 'name' in obj && !('relationships' in obj)) return 'entity';

    // Relationship
    if ('sourceId' in obj && 'targetId' in obj) return 'relationship';

    // Community
    if ('memberCount' in obj && 'level' in obj) return 'community';

    // Job status
    if ('jobId' in obj && 'status' in obj) return 'job.status';

    // Stats
    if ('entities' in obj && 'relationships' in obj && typeof obj.entities === 'number') {
      return 'stats';
    }

    // Health check
    if ('status' in obj && ('uptime' in obj || 'healthy' in obj)) return 'health';

    // Graph export
    if ('format' in obj && 'stats' in obj) return 'graph.export';
  }

  // Default based on path
  if (path?.includes('/query')) return 'query.result';
  if (path?.includes('/ingest')) return 'job';
  if (path?.includes('/scheduler')) return 'scheduler.status';
  if (path?.includes('/vector')) return 'vector.search';

  return 'list';
}

/**
 * Determine ID prefix from object type.
 */
export function getIdPrefix(objectType: GertsObjectType): string {
  const prefixMap: Record<string, string> = {
    'query.result': 'qry',
    'query.analysis': 'qry',
    entity: 'ent',
    'entity.list': 'lst',
    relationship: 'rel',
    'relationship.list': 'lst',
    community: 'com',
    'community.list': 'lst',
    document: 'doc',
    'document.list': 'lst',
    chunk: 'chk',
    'chunk.list': 'lst',
    job: 'job',
    'job.list': 'lst',
    'job.status': 'job',
    'scheduler.status': 'job',
    'vector.search': 'qry',
    'vector.stats': 'lst',
    health: 'sys',
    stats: 'sys',
    'graph.export': 'exp',
    list: 'lst',
  };
  return prefixMap[objectType] || 'lst';
}

// ============================================================================
// Response Transformation
// ============================================================================

export interface WrapResponseOptions {
  /** Moleculer context - only used fields to avoid moleculer version conflicts */
  ctx: {
    id: string;
    nodeID: string | null;
    meta: Record<string, unknown>;
  };
  /** Original Orchestra response - accepts any ResponseCode subtype */
  orchResponse: OrchestraApiResponse<ResponseCode>;
  /** Request path for type detection */
  path?: string;
  /** Package info for app metadata */
  packageJson?: { name: string; version: string };
  /** Node name */
  nodeName?: string;
}

/**
 * Wrap Orchestra response in GertsResponse format.
 *
 * @param options - Wrap options including context and Orchestra response
 * @returns GertsResponse with legacy fields for backward compatibility
 */
export function wrapSuccessResponse<T>(
  options: WrapResponseOptions,
): GertsResponse<T> & { _legacy: Record<string, unknown> } {
  const { ctx, orchResponse, path, packageJson, nodeName } = options;

  // Extract info using type guard for safe access
  const info = getOrchestraInfo(orchResponse.info);
  const responseData = info.data ?? orchResponse.data;

  // Detect object type
  const objectType = detectObjectType(responseData, path);
  const prefix = getIdPrefix(objectType);

  // Extract tenant from meta using type guard (ctx may be undefined in early middleware errors)
  const tenantId = ctx ? extractTenantId(ctx.meta, 'default') : 'default';

  // Extract usage using type guard
  const usage = extractUsageInfo(responseData);

  // Extract trace ID using type guard
  const traceId = ctx ? extractTraceId(ctx.meta) : undefined;

  // Extract package info safely
  const pkgInfo = extractPackageInfo(packageJson);

  // Build GertsResponse
  const gertsResponse: GertsResponse<T> = {
    id: generateId(prefix) as GertsResponse<T>['id'],
    object: objectType,
    created: Math.floor(Date.now() / 1000) as GertsResponse<T>['created'],
    success: true,
    data: responseData as T,
    tenant_id: tenantId as GertsResponse<T>['tenant_id'],
    ...(usage !== undefined ? { usage } : {}),
    ...(traceId !== undefined ? { trace_id: traceId } : {}),
  };

  // Include legacy fields for backward compatibility (ctx may be undefined in early middleware errors)
  const legacy = {
    tracking_id: ctx?.id,
    app: {
      name: nodeName || 'gerts-api',
      node_id: ctx?.nodeID,
      package: pkgInfo.name,
      version: pkgInfo.version,
    },
    // Legacy Orchestra fields
    code: info.code,
    http_code: info.http_code,
    message: info.message,
  };

  return {
    ...gertsResponse,
    _legacy: legacy,
  };
}

// ============================================================================
// Error Transformation
// ============================================================================

export interface WrapErrorOptions {
  /** Moleculer context - only used fields to avoid moleculer version conflicts */
  ctx: {
    id: string;
    nodeID: string | null;
    meta: Record<string, unknown>;
  };
  /** Original Orchestra response or error - accepts any ResponseCode subtype */
  orchResponse: OrchestraApiResponse<ResponseCode>;
  /** Original error (if available) */
  error?: Error;
  /** Request path */
  path?: string;
}

/**
 * Wrap Orchestra error in GertsErrorResponse format.
 *
 * @param options - Error wrap options
 * @returns GertsErrorResponse with legacy fields
 */
export function wrapErrorResponse(
  options: WrapErrorOptions,
): GertsErrorResponse & { _legacy: Record<string, unknown> } {
  const { ctx, orchResponse, error, path } = options;

  // Extract info using type guard for safe access
  const info = getOrchestraInfo(orchResponse.info);

  // Map response code to error type
  const codeStr = String(info.code || '500/internal_error');
  const errorType =
    RESPONSE_CODE_TO_ERROR_TYPE[codeStr] ||
    RESPONSE_CODE_TO_ERROR_TYPE[codeStr.split('/').slice(0, 2).join('/')] ||
    'server_error';

  // Map to error code
  const errorCode = RESPONSE_CODE_TO_ERROR_CODE[codeStr] || 'INTERNAL_ERROR';

  // Determine if retryable
  const retryable = RETRYABLE_ERROR_CODES.has(errorCode);

  // Extract tenant from meta using type guard (ctx may be undefined in early middleware errors)
  const tenantId = ctx ? extractTenantId(ctx.meta, '') : '';

  // Extract trace ID using type guard
  const traceId = ctx ? extractTraceId(ctx.meta) : undefined;

  // Detect stage
  const stage = detectStageFromPath(path);

  // Build GertsErrorResponse
  const gertsError: GertsErrorResponse = {
    success: false,
    error: {
      message: info.message || error?.message || 'An error occurred',
      type: errorType,
      code: errorCode,
      retryable,
      ...(errorCode === 'RATE_LIMIT_EXCEEDED'
        ? { retry_after: 60 as number & { readonly __type: 'uint32' } }
        : {}),
      ...(stage !== undefined ? { stage: stage as GertsErrorResponse['error']['stage'] } : {}),
    },
    request_id: generateRequestId(),
    timestamp: new Date().toISOString() as GertsErrorResponse['timestamp'],
    ...(tenantId.length > 0 ? { tenant_id: tenantId } : {}),
    ...(traceId !== undefined ? { trace_id: traceId } : {}),
  };

  // Legacy fields for backward compatibility (ctx may be undefined in early middleware errors)
  const legacy = {
    tracking_id: ctx?.id,
    code: info.code,
    http_code: info.http_code,
    errors: info.errors,
  };

  return {
    ...gertsError,
    _legacy: legacy,
  };
}

/**
 * Detect processing stage from request path.
 */
function detectStageFromPath(path?: string): string | undefined {
  if (!path) return undefined;
  if (path.includes('/query')) return 'retrieval';
  if (path.includes('/ingest')) return 'extraction';
  if (path.includes('/vector')) return 'vector_search';
  if (path.includes('/graph')) return 'graph_query';
  if (path.includes('/community')) return 'community_detection';
  if (path.includes('/auth') || path.includes('/keys')) return 'authentication';
  return undefined;
}

// ============================================================================
// Backward Compatibility Helpers
// ============================================================================

// Note: wantsLegacyFormat is now re-exported from ./type-guards

/**
 * Build final response payload.
 * Includes both GertsResponse and legacy fields for transition period.
 */
export function buildResponsePayload<T>(
  gertsResponse: GertsResponse<T> & { _legacy?: Record<string, unknown> },
  includeLegacy = true,
): Record<string, unknown> {
  const { _legacy, ...gerts } = gertsResponse;

  if (includeLegacy && _legacy) {
    // Merge legacy fields at root level for backward compatibility
    return {
      ...gerts,
      // Legacy fields (deprecated, will be removed in v2)
      tracking_id: _legacy.tracking_id,
      app: _legacy.app,
    };
  }

  return gerts;
}
