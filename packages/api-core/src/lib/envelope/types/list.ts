/**
 * @gerts/api-types - Paginated List Response
 *
 * RFC-030: GertsListResponse<T> — paginated list response for collection endpoints.
 * Follows cursor-based pagination pattern for efficient large dataset handling.
 *
 * @see apps/pipeline/docs/RFC-030-UNIFIED-API-PROTOCOL.md
 * @packageDocumentation
 */
import typia, { tags } from 'typia';
import { generateId, type GertsObjectType, type UsageInfo } from './response';

// ============================================================================
// Pagination Types
// ============================================================================

/**
 * Pagination metadata for list responses.
 * Supports both offset-based and cursor-based pagination.
 */
export interface PaginationInfo {
  /**
   * Total number of items across all pages.
   */
  total: number & tags.Type<'uint32'> & tags.Minimum<0>;

  /**
   * Number of items in the current page.
   */
  count: number & tags.Type<'uint32'> & tags.Minimum<0>;

  /**
   * Maximum number of items per page (limit).
   */
  limit: number & tags.Type<'uint32'> & tags.Minimum<1> & tags.Maximum<1000>;

  /**
   * Current page offset (for offset-based pagination).
   */
  offset: number & tags.Type<'uint32'> & tags.Minimum<0>;

  /**
   * Whether there are more items after this page.
   */
  has_more: boolean;

  /**
   * Cursor for the next page (for cursor-based pagination).
   * Use this value in the `after` parameter to get the next page.
   */
  next_cursor?: string;

  /**
   * Cursor for the previous page (for cursor-based pagination).
   * Use this value in the `before` parameter to get the previous page.
   */
  prev_cursor?: string;
}

/**
 * Pagination request parameters.
 */
export interface PaginationParams {
  /**
   * Maximum number of items to return.
   * @default 20
   */
  limit?: number & tags.Type<'uint32'> & tags.Minimum<1> & tags.Maximum<1000>;

  /**
   * Number of items to skip (offset-based pagination).
   * @default 0
   */
  offset?: number & tags.Type<'uint32'> & tags.Minimum<0>;

  /**
   * Cursor to start after (cursor-based pagination).
   */
  after?: string;

  /**
   * Cursor to start before (cursor-based pagination).
   */
  before?: string;
}

/**
 * Sorting configuration.
 */
export interface SortConfig {
  /**
   * Field to sort by.
   */
  field: string;

  /**
   * Sort direction.
   * @default 'asc'
   */
  order: 'asc' | 'desc';
}

// ============================================================================
// GertsListResponse<T> — Paginated List Response
// ============================================================================

/**
 * Paginated list response for collection endpoints.
 *
 * Extends GertsResponse with pagination metadata for efficient
 * handling of large collections.
 *
 * @typeParam T - The type of items in the list
 *
 * @example
 * ```typescript
 * // List entities response
 * const response: GertsListResponse<Entity> = {
 *   id: 'lst_abc123def456',
 *   object: 'entity.list',
 *   created: 1704067200,
 *   success: true,
 *   data: [
 *     { id: 'ent_1', name: 'Entity 1', type: 'Person' },
 *     { id: 'ent_2', name: 'Entity 2', type: 'Organization' },
 *   ],
 *   pagination: {
 *     total: 150,
 *     count: 2,
 *     limit: 20,
 *     offset: 0,
 *     has_more: true,
 *     next_cursor: 'eyJpZCI6ImVudF8yIn0',
 *   },
 *   tenant_id: 'demo',
 * };
 * ```
 */
export interface GertsListResponse<T> {
  // === OpenAI-compatible fields ===

  /**
   * Unique response ID.
   * Format: `lst_{12+ alphanumeric chars}`
   */
  id: string & tags.Pattern<'^[a-z]{3}_[a-zA-Z0-9]{12,}$'>;

  /**
   * Object type identifier.
   * Always ends with `.list` for list responses.
   */
  object: GertsObjectType;

  /**
   * Unix timestamp of response creation.
   */
  created: number & tags.Type<'uint32'>;

  // === VoltAgent-style envelope ===

  /**
   * Success indicator. Always `true` for successful responses.
   */
  success: true;

  /**
   * Array of items in this page.
   */
  data: T[];

  // === Pagination metadata ===

  /**
   * Pagination information.
   */
  pagination: PaginationInfo;

  /**
   * Sorting configuration applied to results.
   */
  sort?: SortConfig;

  /**
   * Filters applied to the query.
   */
  filters?: Record<string, unknown>;

  // === Usage tracking ===

  /**
   * Usage information (if applicable).
   */
  usage?: UsageInfo;

  // === gerts.ai specific ===

  /**
   * Tenant identifier.
   */
  tenant_id: string & tags.MinLength<1>;

  /**
   * OpenTelemetry trace ID.
   */
  trace_id?: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Encode a cursor from an object.
 *
 * @param data - Data to encode into cursor
 * @returns Base64-encoded cursor string
 */
export function encodeCursor(data: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(data)).toString('base64url');
}

/**
 * Decode a cursor to an object.
 *
 * @param cursor - Base64-encoded cursor string
 * @returns Decoded cursor data or null if invalid
 */
export function decodeCursor<T extends Record<string, unknown>>(cursor: string): T | null {
  try {
    return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf-8')) as T;
  } catch {
    return null;
  }
}

/**
 * Create a GertsListResponse envelope.
 *
 * @param params - List response parameters
 * @returns Complete GertsListResponse object
 *
 * @example
 * ```typescript
 * const response = createGertsListResponse({
 *   object: 'entity.list',
 *   data: entities,
 *   tenant_id: 'demo',
 *   total: 150,
 *   limit: 20,
 *   offset: 0,
 * });
 * ```
 */
export function createGertsListResponse<T>(params: {
  /** Object type (should end with .list) */
  object: GertsObjectType;
  /** Array of items */
  data: T[];
  /** Tenant ID */
  tenant_id: string;
  /** Total number of items */
  total: number;
  /** Items per page */
  limit?: number;
  /** Current offset */
  offset?: number;
  /** Next page cursor */
  next_cursor?: string;
  /** Previous page cursor */
  prev_cursor?: string;
  /** Sort configuration */
  sort?: SortConfig;
  /** Applied filters */
  filters?: Record<string, unknown>;
  /** Usage info */
  usage?: UsageInfo;
  /** Trace ID */
  trace_id?: string;
  /** Custom ID */
  id?: string;
}): GertsListResponse<T> {
  const limit = params.limit || 20;
  const offset = params.offset || 0;
  const count = params.data.length;
  const hasMore = offset + count < params.total;

  return {
    id: (params.id || generateId('lst')) as string & tags.Pattern<'^[a-z]{3}_[a-zA-Z0-9]{12,}$'>,
    object: params.object,
    created: Math.floor(Date.now() / 1000) as number & tags.Type<'uint32'>,
    success: true,
    data: params.data,
    pagination: {
      total: params.total as number & tags.Type<'uint32'> & tags.Minimum<0>,
      count: count as number & tags.Type<'uint32'> & tags.Minimum<0>,
      limit: limit as number & tags.Type<'uint32'> & tags.Minimum<1> & tags.Maximum<1000>,
      offset: offset as number & tags.Type<'uint32'> & tags.Minimum<0>,
      has_more: hasMore,
      ...(params.next_cursor && { next_cursor: params.next_cursor }),
      ...(params.prev_cursor && { prev_cursor: params.prev_cursor }),
    },
    tenant_id: params.tenant_id as string & tags.MinLength<1>,
    ...(params.sort && { sort: params.sort }),
    ...(params.filters && { filters: params.filters }),
    ...(params.usage && { usage: params.usage }),
    ...(params.trace_id && { trace_id: params.trace_id }),
  };
}

/**
 * Create pagination info from request params and total count.
 *
 * @param params - Pagination request parameters
 * @param total - Total number of items
 * @param pageSize - Number of items in current page
 * @returns PaginationInfo object
 */
export function createPaginationInfo(
  params: PaginationParams,
  total: number,
  pageSize: number,
): PaginationInfo {
  const limit = params.limit || 20;
  const offset = params.offset || 0;

  return {
    total: total as number & tags.Type<'uint32'> & tags.Minimum<0>,
    count: pageSize as number & tags.Type<'uint32'> & tags.Minimum<0>,
    limit: limit as number & tags.Type<'uint32'> & tags.Minimum<1> & tags.Maximum<1000>,
    offset: offset as number & tags.Type<'uint32'> & tags.Minimum<0>,
    has_more: offset + pageSize < total,
  };
}

/**
 * Calculate offset from page number.
 *
 * @param page - Page number (1-based)
 * @param limit - Items per page
 * @returns Offset value
 */
export function pageToOffset(page: number, limit: number): number {
  return Math.max(0, (page - 1) * limit);
}

/**
 * Calculate page number from offset.
 *
 * @param offset - Offset value
 * @param limit - Items per page
 * @returns Page number (1-based)
 */
export function offsetToPage(offset: number, limit: number): number {
  return Math.floor(offset / limit) + 1;
}

/**
 * Calculate total number of pages.
 *
 * @param total - Total number of items
 * @param limit - Items per page
 * @returns Total number of pages
 */
export function totalPages(total: number, limit: number): number {
  return Math.ceil(total / limit);
}

// ============================================================================
// Typia Validators (compile-time generated!)
// ============================================================================

/**
 * Validate PaginationInfo structure.
 */
export const validatePaginationInfo = typia.createValidate<PaginationInfo>();

/**
 * Validate PaginationParams structure.
 */
export const validatePaginationParams = typia.createValidate<PaginationParams>();

/**
 * Validate GertsListResponse with unknown data type.
 */
export const validateGertsListResponse = typia.createValidate<GertsListResponse<unknown>>();

/**
 * Check if value is a valid GertsListResponse.
 */
export const isGertsListResponse = typia.createIs<GertsListResponse<unknown>>();

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard for list responses.
 */
export function isListResponse<T>(response: unknown): response is GertsListResponse<T> {
  return (
    typeof response === 'object' &&
    response !== null &&
    'success' in response &&
    (response as { success: unknown }).success === true &&
    'data' in response &&
    Array.isArray((response as { data: unknown }).data) &&
    'pagination' in response
  );
}
