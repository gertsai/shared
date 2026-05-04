/**
 * @fileoverview RAG Request Types (RFC-036)
 *
 * Request types for RAG API Standard.
 * Supports capability selection, retrieval configuration,
 * and generation options.
 *
 * @module @gertsai/core/rag
 */

import type { RAGCapabilities } from './capabilities';

// ============================================
// Metadata Filter
// ============================================

/**
 * Filter operators for metadata queries.
 */
export type FilterOperator =
  | 'eq'       // Equal
  | 'ne'       // Not equal
  | 'gt'       // Greater than
  | 'gte'      // Greater than or equal
  | 'lt'       // Less than
  | 'lte'      // Less than or equal
  | 'in'       // In array
  | 'nin'      // Not in array
  | 'contains' // Contains substring
  | 'startsWith' // Starts with
  | 'exists';  // Field exists

/**
 * Metadata filter for source filtering.
 *
 * @example
 * ```typescript
 * // Filter by document type
 * const filter: MetadataFilter = {
 *   field: 'type',
 *   operator: 'eq',
 *   value: 'technical',
 * };
 *
 * // Filter by date range
 * const dateFilter: MetadataFilter = {
 *   field: 'createdAt',
 *   operator: 'gte',
 *   value: '2024-01-01',
 * };
 * ```
 */
export interface MetadataFilter {
  /** Field name to filter on */
  readonly field: string;

  /** Comparison operator */
  readonly operator: FilterOperator;

  /** Value to compare against */
  readonly value: unknown;
}

/**
 * Composite filter with AND/OR logic.
 */
export interface CompositeFilter {
  /** Logical operator */
  readonly operator: 'and' | 'or';

  /** Child filters */
  readonly filters: readonly (MetadataFilter | CompositeFilter)[];
}

// ============================================
// Retrieval Configuration
// ============================================

/**
 * Retrieval strategy options.
 */
export type RetrievalStrategy =
  | 'vector'   // Pure vector similarity
  | 'hybrid'   // Vector + keyword (BM25)
  | 'graph'    // Graph-based retrieval
  | 'bm25'     // Pure keyword search
  | 'auto';    // Auto-select based on query

/**
 * Retrieval phase configuration.
 */
export interface RetrievalConfig {
  /** Retrieval strategy to use */
  readonly strategy?: RetrievalStrategy;

  /** Maximum number of sources to retrieve */
  readonly topK?: number;

  /** Minimum relevance score threshold (0-1) */
  readonly minScore?: number;

  /** Metadata filter for source selection */
  readonly filter?: MetadataFilter | CompositeFilter;

  /** Whether to apply re-ranking */
  readonly rerank?: boolean;

  /** Re-ranker model to use */
  readonly rerankerModel?: string;

  /** Maximum tokens for retrieved context */
  readonly maxContextTokens?: number;

  /** Collection/index name to search */
  readonly collection?: string;

  /** Namespaces to search within */
  readonly namespaces?: readonly string[];
}

// ============================================
// Generation Configuration
// ============================================

/**
 * Generation phase configuration.
 */
export interface GenerationConfig {
  /** LLM model identifier */
  readonly model?: string;

  /** Maximum tokens to generate */
  readonly maxTokens?: number;

  /** Temperature for sampling (0-2) */
  readonly temperature?: number;

  /** Custom system prompt */
  readonly systemPrompt?: string;

  /** Stop sequences */
  readonly stopSequences?: readonly string[];

  /** Frequency penalty (-2 to 2) */
  readonly frequencyPenalty?: number;

  /** Presence penalty (-2 to 2) */
  readonly presencePenalty?: number;

  /** Top-p nucleus sampling */
  readonly topP?: number;

  /** Response format */
  readonly responseFormat?: 'text' | 'json' | 'markdown';
}

// ============================================
// Grounding Configuration
// ============================================

/**
 * Grounding capability configuration.
 */
export interface GroundingConfig {
  /** Grounding mode */
  readonly mode?: 'accurate' | 'fast';

  /** Include text excerpts from sources */
  readonly includeExcerpts?: boolean;

  /** Minimum confidence for citations (0-1) */
  readonly minConfidence?: number;

  /** Maximum citations per claim */
  readonly maxCitationsPerClaim?: number;
}

// ============================================
// Graph Configuration
// ============================================

/**
 * Graph search mode options.
 */
export type GraphMode =
  | 'local'   // Start from entities in query
  | 'global'  // Use community summaries
  | 'hybrid'  // Combine local and global
  | 'drift'   // DRIFT pattern (query expansion)
  | 'auto';   // Auto-select based on query

/**
 * Graph capability configuration.
 */
export interface GraphConfig {
  /** Graph search mode */
  readonly mode?: GraphMode;

  /** Maximum hops from seed entities */
  readonly maxHops?: number;

  /** Include community summaries */
  readonly includeCommunities?: boolean;

  /** Include subgraph for visualization */
  readonly includeSubgraph?: boolean;

  /** Maximum entities to return */
  readonly entityLimit?: number;

  /** Maximum relationships to return */
  readonly relationshipLimit?: number;

  /** Entity types to filter */
  readonly entityTypes?: readonly string[];

  /** Relationship types to filter */
  readonly relationshipTypes?: readonly string[];

  /** Minimum entity relevance score (0-1) */
  readonly minEntityScore?: number;
}

// ============================================
// RAG Request
// ============================================

/**
 * RAG API Request.
 *
 * Supports capability selection and detailed configuration
 * for each phase of the RAG pipeline.
 *
 * @typeParam C - Capability flags for type-safe configuration
 *
 * @example
 * ```typescript
 * // Minimal request
 * const minimal: RAGRequest = {
 *   question: 'What is GraphRAG?',
 *   tenantId: 'demo',
 * };
 *
 * // Full request with capabilities
 * const full: RAGRequest<{ grounding: true; graph: true }> = {
 *   question: 'Who founded NeuraTech?',
 *   tenantId: 'demo',
 *   capabilities: ['grounding', 'graph'],
 *   retrieval: { strategy: 'hybrid', topK: 10 },
 *   graph: { mode: 'local', maxHops: 2 },
 *   stream: true,
 * };
 * ```
 */
export interface RAGRequest<C extends RAGCapabilities = {}> {
  // ============== Required ==============

  /** The user's question */
  readonly question: string;

  /** Tenant identifier for multi-tenancy */
  readonly tenantId: string;

  // ============== Capability Selection ==============

  /**
   * Capabilities to enable for this request.
   *
   * Each capability adds additional fields to the response:
   * - `grounding`: citations, groundingScore
   * - `observability`: retrieval, generation, latency, traceId
   * - `graph`: entities, relationships, subgraph
   */
  readonly capabilities?: readonly (keyof RAGCapabilities)[];

  // ============== Phase Configuration ==============

  /** Retrieval phase configuration */
  readonly retrieval?: RetrievalConfig;

  /** Generation phase configuration */
  readonly generation?: GenerationConfig;

  /** Grounding configuration (when grounding capability enabled) */
  readonly grounding?: GroundingConfig;

  /** Graph configuration (when graph capability enabled) */
  readonly graph?: GraphConfig;

  // ============== Streaming ==============

  /** Enable streaming response (SSE) */
  readonly stream?: boolean;

  // ============== Tracing ==============

  /** Trace ID for distributed tracing (auto-generated if not provided) */
  readonly traceId?: string;

  /** Parent span ID for nested traces */
  readonly parentSpanId?: string;

  // ============== Request Metadata ==============

  /** Request timeout in milliseconds */
  readonly timeoutMs?: number;

  /** Idempotency key for safe retries */
  readonly idempotencyKey?: string;

  /** User identifier (for rate limiting, analytics) */
  readonly userId?: string;

  /** Session identifier (for conversation context) */
  readonly sessionId?: string;

  // ============== Extensibility ==============

  /** Custom extensions (forward compatibility) */
  readonly extensions?: Readonly<Record<string, unknown>>;
}

// ============================================
// Request Helpers
// ============================================

/**
 * Creates a minimal RAG request.
 *
 * @param question - The user's question
 * @param tenantId - Tenant identifier
 * @returns A minimal RAGRequest
 */
export function createRAGRequest(
  question: string,
  tenantId: string
): RAGRequest<{}> {
  return { question, tenantId };
}

/**
 * Checks if request has a specific capability enabled.
 *
 * @param request - The RAG request
 * @param capability - Capability to check
 * @returns True if capability is enabled
 */
export function hasCapability<C extends RAGCapabilities>(
  request: RAGRequest<C>,
  capability: keyof RAGCapabilities
): boolean {
  return request.capabilities?.includes(capability) ?? false;
}
