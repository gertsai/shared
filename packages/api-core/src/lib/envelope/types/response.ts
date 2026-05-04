/**
 * Unified Response Envelope
 *
 * RFC-030: GertsResponse<T> — unified response envelope for all gerts.ai API responses.
 * Combines VoltAgent envelope + OpenAI fields + CrewAI usage tracking.
 *
 * @see apps/pipeline/docs/RFC-030-UNIFIED-API-PROTOCOL.md
 * @packageDocumentation
 */
import typia, { tags } from 'typia';

// ============================================================================
// ID Prefixes for different response types
// ============================================================================

/**
 * ID prefix mapping for response types.
 * Format: `{prefix}_{random12chars}`
 *
 * @example
 * - Query result: `qry_abc123def456`
 * - Document: `doc_xyz789ghi012`
 * - Entity: `ent_jkl345mno678`
 */
export const ID_PREFIXES = {
  query: 'qry',
  document: 'doc',
  entity: 'ent',
  relationship: 'rel',
  community: 'com',
  chunk: 'chk',
  job: 'job',
  list: 'lst',
  key: 'key',
  event: 'evt',
} as const;

export type IdPrefix = (typeof ID_PREFIXES)[keyof typeof ID_PREFIXES];

// ============================================================================
// Usage Tracking (CrewAI-style)
// ============================================================================

/**
 * Token and resource usage tracking for billing and observability.
 * Follows CrewAI's usage tracking pattern with gerts-specific extensions.
 */
export interface UsageInfo {
  /** Number of tokens in the prompt/request */
  prompt_tokens: number & tags.Type<'uint32'> & tags.Minimum<0>;

  /** Number of tokens in the completion/response */
  completion_tokens: number & tags.Type<'uint32'> & tags.Minimum<0>;

  /** Total tokens used (prompt + completion) */
  total_tokens: number & tags.Type<'uint32'> & tags.Minimum<0>;

  // === gerts.ai specific usage ===

  /** Number of graph traversal operations performed */
  graph_traversals?: number & tags.Type<'uint32'> & tags.Minimum<0>;

  /** Number of vector similarity searches performed */
  vector_searches?: number & tags.Type<'uint32'> & tags.Minimum<0>;

  /** Number of entities found/processed */
  entities_found?: number & tags.Type<'uint32'> & tags.Minimum<0>;

  /** Number of chunks retrieved */
  chunks_retrieved?: number & tags.Type<'uint32'> & tags.Minimum<0>;

  /** Processing time in milliseconds */
  processing_time_ms?: number & tags.Type<'uint32'> & tags.Minimum<0>;
}

// ============================================================================
// Response Object Types
// ============================================================================

/**
 * Object type identifiers for API responses.
 * Format: `{domain}.{resource}` or `{domain}.{resource}.{action}`
 */
export type GertsObjectType =
  // Query results
  | 'query.result'
  | 'query.analysis'
  // Documents and chunks
  | 'document'
  | 'document.list'
  | 'chunk'
  | 'chunk.list'
  // Graph entities
  | 'entity'
  | 'entity.list'
  | 'relationship'
  | 'relationship.list'
  // Communities
  | 'community'
  | 'community.list'
  // Jobs and tasks
  | 'job'
  | 'job.list'
  | 'job.status'
  // Scheduler
  | 'scheduler.status'
  // Vector operations
  | 'vector.search'
  | 'vector.stats'
  // API keys
  | 'api_key'
  | 'api_key.list'
  // Generic list
  | 'list'
  // Health and system
  | 'health'
  | 'stats'
  // Graph export
  | 'graph.export';

// ============================================================================
// GertsResponse<T> — Unified Response Envelope
// ============================================================================

/**
 * Unified response envelope for all gerts.ai API responses.
 *
 * Combines patterns from:
 * - **OpenAI**: `id`, `object`, `created`, `model` fields
 * - **VoltAgent**: `success`, `data` envelope
 * - **CrewAI**: `usage` tracking
 * - **RFC 9457**: Problem Details for errors (see error.ts)
 *
 * @typeParam T - The response data type
 *
 * @example
 * ```typescript
 * // Query response
 * const response: GertsResponse<QueryData> = {
 *   id: 'qry_abc123def456',
 *   object: 'query.result',
 *   created: 1704067200,
 *   success: true,
 *   data: { answer: 'NeuraTech was founded by...', sources: [...] },
 *   usage: { prompt_tokens: 50, completion_tokens: 150, total_tokens: 200 },
 *   tenant_id: 'demo',
 *   trace_id: 'abc123',
 * };
 * ```
 */
export interface GertsResponse<T> {
  // === OpenAI-compatible fields ===

  /**
   * Unique request/response ID.
   * Format: `{prefix}_{12+ alphanumeric chars}`
   *
   * @example 'qry_abc123def456', 'doc_xyz789ghi012'
   */
  id: string & tags.Pattern<'^[a-z]{3}_[a-zA-Z0-9]{12,}$'>;

  /**
   * Object type identifier.
   * Describes what kind of resource this response contains.
   */
  object: GertsObjectType;

  /**
   * Unix timestamp of response creation (seconds since epoch).
   */
  created: number & tags.Type<'uint32'>;

  /**
   * Model used for generation (if applicable).
   * Only present for LLM-generated responses.
   *
   * @example 'gpt-4o-mini', 'claude-sonnet-4-20250514', 'gerts-rag'
   */
  model?: string;

  // === VoltAgent-style envelope ===

  /**
   * Success indicator. Always `true` for successful responses.
   * For errors, use `GertsErrorResponse` instead.
   */
  success: true;

  /**
   * Response payload containing the actual data.
   */
  data: T;

  // === Usage tracking (CrewAI-style) ===

  /**
   * Token and resource usage information.
   * Present for operations that consume LLM tokens or perform searches.
   */
  usage?: UsageInfo;

  // === gerts.ai specific ===

  /**
   * Tenant identifier for multi-tenancy isolation.
   */
  tenant_id: string & tags.MinLength<1>;

  /**
   * OpenTelemetry trace ID for distributed tracing.
   */
  trace_id?: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate a unique ID with the specified prefix.
 *
 * @param prefix - ID prefix (e.g., 'qry', 'doc', 'ent')
 * @returns Unique ID in format `{prefix}_{random12chars}`
 *
 * @example
 * ```typescript
 * const id = generateId('qry'); // 'qry_abc123def456'
 * const docId = generateId('doc'); // 'doc_xyz789ghi012'
 * ```
 */
export function generateId(prefix: IdPrefix | string): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let random = '';
  for (let i = 0; i < 12; i++) {
    random += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `${prefix}_${random}`;
}

/**
 * Create a GertsResponse envelope.
 *
 * @param params - Response parameters
 * @returns Complete GertsResponse object
 *
 * @example
 * ```typescript
 * const response = createGertsResponse({
 *   object: 'query.result',
 *   data: { answer: 'The answer is...', sources: [] },
 *   tenant_id: 'demo',
 *   usage: { prompt_tokens: 50, completion_tokens: 150, total_tokens: 200 },
 * });
 * ```
 */
export function createGertsResponse<T>(params: {
  /** Object type (determines ID prefix) */
  object: GertsObjectType;
  /** Response data */
  data: T;
  /** Tenant ID */
  tenant_id: string;
  /** Optional model name */
  model?: string;
  /** Optional usage info */
  usage?: UsageInfo;
  /** Optional trace ID */
  trace_id?: string;
  /** Optional custom ID (auto-generated if not provided) */
  id?: string;
}): GertsResponse<T> {
  // Determine prefix from object type
  const prefixMap: Record<string, IdPrefix> = {
    'query.result': 'qry',
    'query.analysis': 'qry',
    document: 'doc',
    'document.list': 'lst',
    chunk: 'chk',
    'chunk.list': 'lst',
    entity: 'ent',
    'entity.list': 'lst',
    relationship: 'rel',
    'relationship.list': 'lst',
    community: 'com',
    'community.list': 'lst',
    job: 'job',
    'job.list': 'lst',
    'job.status': 'job',
    'scheduler.status': 'job',
    'vector.search': 'qry',
    'vector.stats': 'lst',
    api_key: 'key',
    'api_key.list': 'lst',
    list: 'lst',
    health: 'lst',
    stats: 'lst',
    'graph.export': 'lst',
  };

  const prefix = prefixMap[params.object] || 'lst';
  const id = params.id || generateId(prefix);

  return {
    id: id as string & tags.Pattern<'^[a-z]{3}_[a-zA-Z0-9]{12,}$'>,
    object: params.object,
    created: Math.floor(Date.now() / 1000) as number & tags.Type<'uint32'>,
    success: true,
    data: params.data,
    tenant_id: params.tenant_id as string & tags.MinLength<1>,
    ...(params.model && { model: params.model }),
    ...(params.usage && { usage: params.usage }),
    ...(params.trace_id && { trace_id: params.trace_id }),
  };
}

// ============================================================================
// Typia Validators (compile-time generated!)
// ============================================================================

/**
 * Validate UsageInfo structure.
 */
export const validateUsageInfo = typia.createValidate<UsageInfo>();

/**
 * Validate GertsResponse with unknown data.
 * Use this for generic response validation.
 */
export const validateGertsResponse = typia.createValidate<GertsResponse<unknown>>();

/**
 * Validate GertsResponse with strict equality check.
 */
export const validateGertsResponseEquals = typia.createValidate<GertsResponse<unknown>>();

/**
 * Assert GertsResponse is valid (throws on error).
 */
export const assertGertsResponse = typia.createAssert<GertsResponse<unknown>>();

/**
 * Check if value is a valid GertsResponse.
 */
export const isGertsResponse = typia.createIs<GertsResponse<unknown>>();

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard for successful GertsResponse.
 */
export function isSuccessResponse<T>(response: unknown): response is GertsResponse<T> {
  return (
    typeof response === 'object' &&
    response !== null &&
    'success' in response &&
    (response as { success: unknown }).success === true &&
    'data' in response
  );
}
