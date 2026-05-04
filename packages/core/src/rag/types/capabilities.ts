/**
 * @fileoverview RAG Capability Types (RFC-036)
 *
 * Capability-based composition for RAG responses.
 * Each capability is independent and can be opted-in via request.
 *
 * Capabilities:
 * - **grounding**: Citation positions, confidence scores
 * - **observability**: Timing, tracing, metadata
 * - **graph**: Entities, relationships, subgraph
 *
 * @module @gerts/core/rag
 */

import type { CitationId, SourceId, RAGResponseCore } from './response';

// ============================================
// Citation (Grounding)
// ============================================

/**
 * Citation linking a claim in the answer to a source.
 *
 * Based on Google Vertex AI grounding pattern.
 * Provides character-level positions for UI highlighting.
 */
export interface Citation {
  /** Unique citation identifier */
  readonly id: CitationId;

  /** Reference to the source this citation points to */
  readonly sourceId: SourceId;

  /** Start character position in the answer (0-indexed) */
  readonly startChar: number;

  /** End character position in the answer (exclusive) */
  readonly endChar: number;

  /** The cited text span from the answer */
  readonly text: string;

  /** The specific claim being supported (optional) */
  readonly claim?: string;

  /** Confidence score (0-1) that source supports this claim */
  readonly confidence: number;
}

// ============================================
// Grounding Capability
// ============================================

/**
 * Grounding capability for citation-level provenance.
 *
 * Provides detailed citation positions and confidence scores
 * for each claim in the answer, enabling fact verification UIs.
 */
export interface GroundingCapability {
  readonly grounding: {
    /** All citations in the answer */
    readonly citations: readonly Citation[];

    /** Overall grounding score (0-1), average of citation confidences */
    readonly groundingScore: number;

    /** Grounding mode used */
    readonly mode: 'accurate' | 'fast';

    /** Number of claims identified in the answer */
    readonly claimCount?: number;

    /** Number of claims with at least one citation */
    readonly groundedClaimCount?: number;
  };
}

// ============================================
// Observability Capability
// ============================================

/**
 * Retrieval phase metadata.
 */
export interface RetrievalMetadata {
  /** Retrieval strategy used */
  readonly strategy: 'vector' | 'hybrid' | 'graph' | 'bm25';

  /** Total candidates found before filtering */
  readonly candidateCount: number;

  /** Candidates used in final context */
  readonly usedCount: number;

  /** Whether re-ranking was applied */
  readonly rerankingApplied: boolean;

  /** Retrieval latency in milliseconds */
  readonly latencyMs: number;

  /** Embedding model used (if applicable) */
  readonly embeddingModel?: string;

  /** Re-ranker model used (if applicable) */
  readonly rerankerModel?: string;
}

/**
 * Generation phase metadata.
 */
export interface GenerationMetadata {
  /** LLM model identifier */
  readonly model: string;

  /** Temperature used for generation */
  readonly temperature: number;

  /** Maximum tokens allowed */
  readonly maxTokens: number;

  /** Reason generation stopped */
  readonly stopReason: 'end_turn' | 'max_tokens' | 'stop_sequence';

  /** Generation latency in milliseconds */
  readonly latencyMs: number;

  /** Number of retries (if any) */
  readonly retries?: number;
}

/**
 * Detailed latency breakdown by phase.
 */
export interface LatencyBreakdown {
  /** Total end-to-end latency in milliseconds */
  readonly totalMs: number;

  /** Retrieval phase latency */
  readonly retrievalMs: number;

  /** Generation phase latency */
  readonly generationMs: number;

  /** Grounding phase latency (if enabled) */
  readonly groundingMs?: number;

  /** Graph traversal latency (if enabled) */
  readonly graphMs?: number;

  /** Time spent in queue (if applicable) */
  readonly queueMs?: number;
}

/**
 * Observability capability for debugging and monitoring.
 *
 * Provides detailed metadata about each phase of the RAG pipeline,
 * including timing, model info, and tracing identifiers.
 */
export interface ObservabilityCapability {
  readonly observability: {
    /** Retrieval phase metadata */
    readonly retrieval: RetrievalMetadata;

    /** Generation phase metadata */
    readonly generation: GenerationMetadata;

    /** Trace ID for distributed tracing (OpenTelemetry compatible) */
    readonly traceId: string;

    /** Span ID for this specific operation */
    readonly spanId: string;

    /** Detailed latency breakdown */
    readonly latency: LatencyBreakdown;

    /** Parent span ID (if this is a child span) */
    readonly parentSpanId?: string;

    /** Request/response size in bytes */
    readonly sizes?: {
      readonly requestBytes: number;
      readonly responseBytes: number;
    };
  };
}

// ============================================
// Graph Capability
// ============================================

/**
 * Entity extracted from the knowledge graph.
 */
export interface Entity {
  /** Entity identifier in the graph */
  readonly id: string;

  /** Entity name (display label) */
  readonly name: string;

  /** Entity type/class (e.g., "Person", "Organization") */
  readonly type: string;

  /** Entity description (if available) */
  readonly description?: string;

  /** Additional properties from the graph */
  readonly properties?: Readonly<Record<string, unknown>>;

  /** Number of mentions in retrieved sources */
  readonly mentions?: number;

  /** Relevance score to the query (0-1) */
  readonly relevance?: number;
}

/**
 * Relationship between entities in the knowledge graph.
 */
export interface Relationship {
  /** Relationship identifier */
  readonly id: string;

  /** Source entity ID */
  readonly source: string;

  /** Target entity ID */
  readonly target: string;

  /** Relationship type (e.g., "works_at", "founded") */
  readonly type: string;

  /** Additional relationship properties */
  readonly properties?: Readonly<Record<string, unknown>>;

  /** Relationship weight/confidence (0-1) */
  readonly weight?: number;
}

/**
 * Node in the visualization subgraph.
 */
export interface SubgraphNode {
  /** Node identifier */
  readonly id: string;

  /** Display name */
  readonly name: string;

  /** Node type for styling */
  readonly type: string;

  /** Additional properties for rendering */
  readonly properties?: Readonly<Record<string, unknown>>;
}

/**
 * Edge in the visualization subgraph.
 */
export interface SubgraphEdge {
  /** Source node ID */
  readonly source: string;

  /** Target node ID */
  readonly target: string;

  /** Edge label */
  readonly label: string;

  /** Edge weight for thickness */
  readonly weight?: number;
}

/**
 * Community detected in the knowledge graph.
 */
export interface Community {
  /** Community identifier */
  readonly id: string;

  /** Community hierarchy level (0 = top level) */
  readonly level: number;

  /** Community title (generated or extracted) */
  readonly title: string;

  /** Community summary describing its main topics */
  readonly summary: string;

  /** IDs of entities belonging to this community */
  readonly entityIds: readonly string[];

  /** Community relevance score to the query (0-1) */
  readonly score: number;
}

/**
 * Graph capability for knowledge graph integration.
 *
 * Provides entities, relationships, and optional visualization
 * data for GraphRAG queries.
 */
export interface GraphCapability {
  readonly graph: {
    /** Graph search mode used */
    readonly mode: 'local' | 'global' | 'hybrid' | 'drift';

    /** Entities relevant to the query */
    readonly entities: readonly Entity[];

    /** Relationships between entities */
    readonly relationships: readonly Relationship[];

    /** Subgraph for visualization (optional) */
    readonly subgraph?: {
      readonly nodes: readonly SubgraphNode[];
      readonly edges: readonly SubgraphEdge[];
    };

    /** Communities used (for global/hybrid mode) */
    readonly communities?: readonly Community[];

    /** Graph traversal depth reached */
    readonly hops?: number;

    /** Total nodes traversed */
    readonly nodesTraversed?: number;
  };
}

// ============================================
// Capability Type Builder
// ============================================

/**
 * Capability selection flags.
 *
 * Use this type to specify which capabilities to include
 * in the response.
 *
 * @example
 * ```typescript
 * // Request grounding and graph capabilities
 * const caps: RAGCapabilities = {
 *   grounding: true,
 *   graph: true,
 * };
 * ```
 */
export type RAGCapabilities = {
  grounding?: boolean;
  observability?: boolean;
  graph?: boolean;
};

/**
 * RAG Response with capability-based composition.
 *
 * The response type dynamically includes additional fields
 * based on the requested capabilities.
 *
 * @typeParam C - Capability flags (e.g., `{ grounding: true; graph: true }`)
 *
 * @example
 * ```typescript
 * // Basic response (no capabilities)
 * const basic: RAGResponse<{}> = { ... };
 *
 * // With grounding
 * const grounded: RAGResponse<{ grounding: true }> = {
 *   ...coreFields,
 *   grounding: { citations: [], groundingScore: 0.95, mode: 'accurate' },
 * };
 *
 * // With all capabilities
 * const full: RAGResponse<{ grounding: true; observability: true; graph: true }> = {
 *   ...coreFields,
 *   grounding: { ... },
 *   observability: { ... },
 *   graph: { ... },
 * };
 * ```
 */
export type RAGResponse<C extends RAGCapabilities = {}> =
  RAGResponseCore &
  (C['grounding'] extends true ? GroundingCapability : {}) &
  (C['observability'] extends true ? ObservabilityCapability : {}) &
  (C['graph'] extends true ? GraphCapability : {});

/**
 * Type guard to check if response has grounding capability.
 */
export function hasGrounding<C extends RAGCapabilities>(
  response: RAGResponse<C>
): response is RAGResponse<C & { grounding: true }> {
  return 'grounding' in response;
}

/**
 * Type guard to check if response has observability capability.
 */
export function hasObservability<C extends RAGCapabilities>(
  response: RAGResponse<C>
): response is RAGResponse<C & { observability: true }> {
  return 'observability' in response;
}

/**
 * Type guard to check if response has graph capability.
 */
export function hasGraph<C extends RAGCapabilities>(
  response: RAGResponse<C>
): response is RAGResponse<C & { graph: true }> {
  return 'graph' in response;
}
