/**
 * RFC-030 Type Guards
 *
 * Runtime type guards for safe type narrowing without unsafe assertions.
 * These guards are used by response-wrapper.ts to validate data structures.
 *
 * @packageDocumentation
 */

import type { UsageInfo } from '@gerts/api-types';

import type { OrchestraApiResponse } from '../apiResponse/OrchestraApiResponse.class';
import type { ResponseCode } from '../apiResponse/types';

// ============================================================================
// Orchestra Response Type Helpers
// ============================================================================

/**
 * Convert a specific OrchestraApiResponse<CODE> to base OrchestraApiResponse<ResponseCode>.
 *
 * This is a safe cast because:
 * - `CODE extends ResponseCode` guarantees CODE is a valid ResponseCode
 * - At runtime, the object structure is identical
 * - TypeScript's structural typing doesn't allow direct assignment due to
 *   generic invariance, but the cast is semantically correct
 *
 * @param response - Orchestra response with specific response code
 * @returns Orchestra response typed with base ResponseCode
 *
 * @example
 * ```typescript
 * const specificResponse = new OrchestraApiResponse(ResponseCode.SUCCESS, data);
 * const baseResponse = toBaseResponse(specificResponse);
 * // baseResponse: OrchestraApiResponse<ResponseCode>
 * ```
 */
export function toBaseResponse<CODE extends ResponseCode>(
  response: OrchestraApiResponse<CODE>,
): OrchestraApiResponse<ResponseCode> {
  // Safe cast: CODE extends ResponseCode guarantees structural compatibility
  return response as unknown as OrchestraApiResponse<ResponseCode>;
}

// ============================================================================
// Orchestra Response Guards
// ============================================================================

/**
 * Orchestra info structure for response handling.
 */
export interface OrchestraInfo {
  success?: boolean;
  message?: string;
  code?: string;
  http_code?: number;
  data?: unknown;
  errors?: unknown[];
  raw?: boolean;
}

/**
 * Check if value has OrchestraInfo structure.
 *
 * @param value - Value to check
 * @returns True if value has OrchestraInfo shape
 *
 * @example
 * ```typescript
 * const info = orchResponse.info;
 * if (isOrchestraInfo(info)) {
 *   // info is safely typed as OrchestraInfo
 *   console.log(info.success, info.http_code);
 * }
 * ```
 */
export function isOrchestraInfo(value: unknown): value is OrchestraInfo {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const obj = value as Record<string, unknown>;

  // Check optional fields have correct types if present
  if ('success' in obj && typeof obj.success !== 'boolean' && obj.success !== undefined) {
    return false;
  }
  if ('message' in obj && typeof obj.message !== 'string' && obj.message !== undefined) {
    return false;
  }
  if ('code' in obj && typeof obj.code !== 'string' && obj.code !== undefined) {
    return false;
  }
  if ('http_code' in obj && typeof obj.http_code !== 'number' && obj.http_code !== undefined) {
    return false;
  }
  if ('raw' in obj && typeof obj.raw !== 'boolean' && obj.raw !== undefined) {
    return false;
  }

  return true;
}

/**
 * Assert value is OrchestraInfo. Throws if invalid.
 */
export function assertOrchestraInfo(value: unknown): asserts value is OrchestraInfo {
  if (!isOrchestraInfo(value)) {
    throw new Error('Invalid OrchestraInfo structure');
  }
}

/**
 * Safely get OrchestraInfo with fallback.
 */
export function getOrchestraInfo(value: unknown): OrchestraInfo {
  if (isOrchestraInfo(value)) {
    return value;
  }
  return {
    success: false,
    message: 'Unknown error',
    code: '500/internal_error',
    http_code: 500,
  };
}

// ============================================================================
// Moleculer Context Meta Guards
// ============================================================================

/**
 * Tenant context meta structure for RFC-030.
 * Different from auth ContextMeta in common/types.ts.
 */
export interface TenantContextMeta {
  tenantId?: string;
  requestId?: string;
  traceId?: string;
  [key: string]: unknown;
}

/**
 * Check if value has TenantContextMeta structure.
 */
export function isTenantContextMeta(value: unknown): value is TenantContextMeta {
  return typeof value === 'object' && value !== null;
}

/**
 * Extract tenant ID from context meta safely.
 *
 * @param meta - Moleculer context meta (ctx.meta)
 * @param fallback - Default value if tenantId not found
 * @returns Tenant ID string
 *
 * @example
 * ```typescript
 * const tenantId = extractTenantId(ctx.meta, 'default');
 * ```
 */
export function extractTenantId(meta: unknown, fallback = 'default'): string {
  if (!isTenantContextMeta(meta)) {
    return fallback;
  }

  const tenantId = meta.tenantId;
  if (typeof tenantId === 'string' && tenantId.length > 0) {
    return tenantId;
  }

  return fallback;
}

/**
 * Extract trace ID from context meta safely.
 *
 * @param meta - Moleculer context meta
 * @returns Trace ID or undefined
 */
export function extractTraceId(meta: unknown): string | undefined {
  if (!isTenantContextMeta(meta)) {
    return undefined;
  }

  const traceId = meta.traceId;
  if (typeof traceId === 'string' && traceId.length > 0) {
    return traceId;
  }

  return undefined;
}

// ============================================================================
// Usage Info Guards
// ============================================================================

/**
 * Check if value has UsageInfo structure.
 *
 * @param value - Value to check
 * @returns True if value matches UsageInfo structure
 */
export function isUsageInfo(value: unknown): value is UsageInfo {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const obj = value as Record<string, unknown>;

  // Required fields
  if (typeof obj.prompt_tokens !== 'number' || obj.prompt_tokens < 0) {
    return false;
  }
  if (typeof obj.completion_tokens !== 'number' || obj.completion_tokens < 0) {
    return false;
  }
  if (typeof obj.total_tokens !== 'number' || obj.total_tokens < 0) {
    return false;
  }

  // Optional fields - check type if present
  if ('graph_traversals' in obj && obj.graph_traversals !== undefined) {
    if (typeof obj.graph_traversals !== 'number' || obj.graph_traversals < 0) {
      return false;
    }
  }
  if ('vector_searches' in obj && obj.vector_searches !== undefined) {
    if (typeof obj.vector_searches !== 'number' || obj.vector_searches < 0) {
      return false;
    }
  }
  if ('processing_time_ms' in obj && obj.processing_time_ms !== undefined) {
    if (typeof obj.processing_time_ms !== 'number' || obj.processing_time_ms < 0) {
      return false;
    }
  }

  return true;
}

/**
 * Extract usage info from data object if present.
 *
 * @param data - Response data object
 * @returns UsageInfo or undefined
 */
export function extractUsageInfo(data: unknown): UsageInfo | undefined {
  if (typeof data !== 'object' || data === null) {
    return undefined;
  }

  const obj = data as Record<string, unknown>;

  // Check direct usage field
  if ('usage' in obj && isUsageInfo(obj.usage)) {
    return obj.usage;
  }

  // Check _meta for usage (RFC-036 pattern)
  if ('_meta' in obj && typeof obj._meta === 'object' && obj._meta !== null) {
    const meta = obj._meta as Record<string, unknown>;
    if ('tokens' in meta || 'promptTokens' in meta || 'totalTokens' in meta) {
      const usage: UsageInfo = {
        prompt_tokens: (typeof meta.promptTokens === 'number'
          ? meta.promptTokens
          : 0) as UsageInfo['prompt_tokens'],
        completion_tokens: (typeof meta.completionTokens === 'number'
          ? meta.completionTokens
          : 0) as UsageInfo['completion_tokens'],
        total_tokens: (typeof meta.totalTokens === 'number'
          ? meta.totalTokens
          : 0) as UsageInfo['total_tokens'],
        ...(typeof meta.processingTime === 'number' && {
          processing_time_ms: meta.processingTime as UsageInfo['processing_time_ms'],
        }),
      };
      return usage;
    }
  }

  return undefined;
}

// ============================================================================
// HTTP Request Guards
// ============================================================================

/**
 * Request-like object for format detection.
 */
export interface RequestLike {
  headers?: Record<string, string | string[] | undefined>;
  query?: Record<string, string | string[] | undefined>;
}

/**
 * Check if request wants legacy Orchestra format.
 *
 * @param req - HTTP request-like object
 * @returns True if client prefers legacy format
 */
export function wantsLegacyFormat(req: RequestLike | undefined | null): boolean {
  if (!req) {
    return false;
  }

  // Check query param
  const format = req.query?.format;
  if (format === 'legacy' || (Array.isArray(format) && format.includes('legacy'))) {
    return true;
  }

  // Check Accept header
  const accept = req.headers?.accept;
  const acceptStr = Array.isArray(accept) ? accept.join(',') : accept || '';
  if (acceptStr.includes('application/vnd.orchestra+json')) {
    return true;
  }

  return false;
}

// ============================================================================
// Package JSON Guards
// ============================================================================

/**
 * Package.json-like structure.
 */
export interface PackageJsonLike {
  name?: string;
  version?: string;
  [key: string]: unknown;
}

/**
 * Safely extract package info.
 *
 * @param pkg - Package.json-like object
 * @returns Object with name and version strings
 */
export function extractPackageInfo(pkg: unknown): { name: string; version: string } {
  const defaults = { name: '@gerts/pipeline', version: '1.0.0' };

  if (typeof pkg !== 'object' || pkg === null) {
    return defaults;
  }

  const obj = pkg as Record<string, unknown>;
  return {
    name: typeof obj.name === 'string' ? obj.name : defaults.name,
    version: typeof obj.version === 'string' ? obj.version : defaults.version,
  };
}
