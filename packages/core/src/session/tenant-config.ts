/**
 * TenantConfig types for GraphRAG Pipeline
 *
 * Two-layer configuration architecture:
 * - TenantConfig (persistent) - stored in PostgreSQL, cached in Redis
 * - SessionContext (request-scoped) - per-request, in-memory
 *
 * Uses Typia for compile-time validation (20,000x faster than Zod)
 * GraphRAGConfig uses Zod schema-first pattern for runtime validation.
 *
 * @example
 * ```typescript
 * const validation = validateTenantConfig(config);
 * if (validation.success) {
 *   const config = validation.data;
 * }
 * ```
 */

import { z } from 'zod';

// ============================================================================
// LLM Configuration
// ============================================================================

/**
 * Supported LLM providers for tenant config
 * Note: Prefixed with "Tenant" to avoid collision with @gertsai/core/llm
 */
export type TenantLLMProvider =
  | 'openai'
  | 'anthropic'
  | 'azure'
  | 'google'
  | 'ollama'
  | 'litellm'
  | 'custom';

/**
 * LLM configuration for the tenant
 * Note: Prefixed with "Tenant" to avoid collision with @gertsai/core/llm
 */
export interface TenantLLMConfig {
  /** LLM provider */
  provider: TenantLLMProvider;
  /** Model identifier (e.g., 'gpt-4', 'claude-sonnet-4-20250514') */
  model: string;
  /**
   * API key reference (stored in Vault, not plain text!)
   * Format: vault://secrets/tenants/{tenantId}/llm-api-key
   */
  apiKeyRef?: string;
  /** Base URL for custom/proxy providers */
  baseUrl?: string;
  /** Temperature for generation @default 0.7 */
  temperature?: number;
  /** Max tokens for generation @default 4096 */
  maxTokens?: number;
  /** Timeout in ms @default 60000 */
  timeout?: number;
  /** Model Registry: selected model configuration UUID (RFC-094) */
  registryModelId?: string;
  /** Model Registry: selected provider UUID (RFC-094) */
  registryProviderId?: string;
}

// ============================================================================
// Embedding Configuration
// ============================================================================

/**
 * Supported embedding providers
 */
export type EmbeddingProvider = 'openai' | 'azure' | 'infinity' | 'ollama' | 'litellm' | 'custom';

// ============================================================================
// Reranker Configuration
// ============================================================================

/**
 * Supported reranker providers
 */
export type RerankerProvider = 'infinity' | 'cohere' | 'litellm' | 'custom';

/**
 * Reranker configuration for the tenant
 */
export interface RerankerConfig {
  /** Whether reranking is enabled */
  enabled?: boolean;
  /** Reranker provider */
  provider?: RerankerProvider;
  /** Model identifier (e.g., 'BAAI/bge-reranker-v2-m3') */
  model?: string;
  /** Base URL for the reranker service */
  baseUrl?: string;
  /** API key reference (for cloud providers like Cohere) */
  apiKeyRef?: string;
  /** Model Registry: selected model UUID */
  registryModelId?: string;
  /** Model Registry: selected provider UUID */
  registryProviderId?: string;
  /** Max documents to rerank per query @default 20 */
  topN?: number;
  /** Minimum score threshold to keep @default 0.0 */
  scoreThreshold?: number;
}

/**
 * Embedding configuration for the tenant
 */
export interface EmbeddingConfig {
  /** Embedding provider */
  provider: EmbeddingProvider;
  /** Model identifier (e.g., 'text-embedding-3-small') */
  model: string;
  /** API key reference (Vault) */
  apiKeyRef?: string;
  /** Base URL for custom providers */
  baseUrl?: string;
  /** Embedding dimension @default 1536 */
  dimension?: number;
  /** Alias: embedding dimensions (frontend sends this) @default 768 */
  dimensions?: number;
  /** Batch size for embedding @default 100 */
  batchSize?: number;
  /** Model Registry: selected model configuration UUID (RFC-094) */
  registryModelId?: string;
  /** Model Registry: selected provider UUID (RFC-094) */
  registryProviderId?: string;
  /**
   * Enable sparse embeddings for hybrid search (RFC-098).
   * When true and the provider supports it (e.g., Infinity/BGE-M3),
   * sparse vectors are generated alongside dense and stored in Milvus.
   * @default true
   */
  sparseEmbeddingsEnabled?: boolean;
  /**
   * Enable hybrid search (dense + sparse vectors) for v1.vector.search (RFC-098).
   * When true and sparse embeddings are available, search uses Milvus native
   * hybrid search with RRF fusion instead of dense-only ANN.
   * @default true
   */
  hybridSearchEnabled?: boolean;
  /**
   * Enable reranker for search result quality improvement (RFC-098).
   * When true and a reranker is configured, search results are reranked
   * using cross-encoder scoring after retrieval.
   * @default false
   */
  rerankerEnabled?: boolean;
}

// ============================================================================
// Prompt Templates
// ============================================================================

/**
 * Prompt template configuration
 * Supports {{variable}} placeholders
 */
export interface PromptConfig {
  /** Entity extraction prompt */
  entityExtraction?: string;
  /** Relationship extraction prompt */
  relationshipExtraction?: string;
  /** Community summary prompt (level-based) */
  communitySummary?: string | Record<number, string>;
  /** Answer generation prompt */
  answerGeneration?: string;
  /** Question analysis prompt */
  questionAnalysis?: string;
  /** Global search map prompt */
  globalSearchMap?: string;
  /** Global search reduce prompt */
  globalSearchReduce?: string;
}

// ============================================================================
// Ontology Binding
// ============================================================================

/**
 * Ontology binding for composition
 *
 * Three-level hierarchy:
 * 1. Standard ontologies (Schema.org, FOAF, Dublin Core)
 * 2. Domain ontologies (legal, healthcare, manufacturing)
 * 3. Custom ontologies (tenant-specific extensions)
 */
export interface OntologyBinding {
  /** Ontology UUID */
  ontologyId: string;
  /** Ontology URI (e.g., 'gerts.ai/legal', 'schema.org') */
  uri: string;
  /** Semantic version (e.g., '2.1.0') */
  version: string;
  /** Priority for composition (higher = overrides) */
  priority: number;
  /** Binding configuration */
  config?: {
    /** Automatically resolve ontology dependencies */
    autoResolveDeps?: boolean;
    /** Classes to override from lower priority ontologies */
    overrideClasses?: string[];
    /** Properties to override from lower priority ontologies */
    overrideProperties?: string[];
  };
}

// ============================================================================
// GraphRAG Settings
// ============================================================================

/**
 * Search mode for GraphRAG queries
 */
export type GraphRAGMode = 'local' | 'global' | 'hybrid' | 'auto';

/**
 * GraphRAG configuration schema (Zod-first)
 *
 * All fields optional — merged with DEFAULT_TENANT_CONFIG at runtime.
 * UI settings (gleaning, dedup, extraction tuning) are persisted here
 * and read by extract.ts via `GraphRAGConfigSchema.safeParse()`.
 */
export const GraphRAGConfigSchema = z.object({
  // --- Search ---
  /** Default search mode @default 'auto' */
  mode: z.enum(['local', 'global', 'hybrid', 'auto']).optional(),
  /** Max hops for local search @default 2 */
  maxHops: z.number().int().nonnegative().optional(),
  /** Number of results @default 20 */
  topK: z.number().int().positive().optional(),

  // --- Schema / Ontology ---
  /** Use schema hints for extraction @default true */
  useSchemaHints: z.boolean().optional(),
  /** Enable ontology mode @default false */
  ontologyMode: z.boolean().optional(),
  /** Default ontology ID for OntologyRAG extraction */
  defaultOntologyId: z.string().uuid().optional(),

  // --- Community ---
  /** Community hierarchy level @default 0 */
  communityLevel: z.number().int().nonnegative().optional(),
  /** Include communities in results @default true */
  includeCommunities: z.boolean().optional(),
  /** Community detection algorithm @default 'louvain' */
  communityAlgorithm: z.enum(['louvain', 'leiden']).optional(),
  /** Resolution parameter for community detection @default 1.0 */
  communityResolution: z.number().min(0.1).max(10).optional(),
  /** Maximum cluster size before splitting @default 100 */
  maxClusterSize: z.number().int().positive().optional(),
  /** Maximum hierarchy levels @default 3 */
  communityMaxLevels: z.number().int().min(1).max(10).optional(),
  /** Include source chunk text excerpts in community summary prompts @default false */
  communityIncludeChunks: z.boolean().optional(),
  /** Maximum number of chunks to include in community summary prompt @default 5 */
  communityMaxChunksInPrompt: z.number().int().min(1).max(20).optional(),
  /** Percentage of token budget allocated to chunk text (0-100) @default 20 */
  communityChunkBudgetPercent: z.number().min(0).max(100).optional(),
  /** Cosine similarity threshold for community ANN pre-filter (0-1) @default 0.3 */
  communitySimilarityThreshold: z.number().min(0).max(1).optional(),
  /** Default topK for GET /v1/graph/communities/similar @default 10 */
  communitySearchTopK: z.number().int().min(1).max(100).optional(),
  /** Hard cap for topK in communities/similar endpoint (security) @default 100 */
  communityTopKCap: z.number().int().min(10).max(500).optional(),

  // --- DRIFT Iterative Search (H.28) ---
  /** Enable DRIFT multi-hop iterative community search @default true */
  driftEnabled: z.boolean().optional(),
  /** Maximum hops for DRIFT iterative traversal @default 3 */
  driftMaxHops: z.number().int().min(1).max(10).optional(),
  /** Number of seed communities for DRIFT search @default 5 */
  driftSeedTopK: z.number().int().min(1).max(20).optional(),
  /** Similarity threshold for DRIFT community expansion @default 0.3 */
  driftSimilarityThreshold: z.number().min(0).max(1).optional(),

  // --- RAPTOR Tree Summarization ---
  /** Enable RAPTOR recursive chunk tree summarization @default false */
  raptorEnabled: z.boolean().optional(),
  /** Maximum depth of RAPTOR summarization tree @default 3 */
  raptorMaxDepth: z.number().int().min(1).max(5).optional(),
  /** Target cluster size for RAPTOR grouping @default 10 */
  raptorClusterSize: z.number().int().min(2).max(50).optional(),
  /** Minimum cluster size for RAPTOR grouping @default 3 */
  raptorMinClusterSize: z.number().int().min(2).max(20).optional(),

  // --- Entity Resolution ---
  /** Enable automatic entity deduplication via semantic similarity @default false */
  entityResolutionEnabled: z.boolean().optional(),
  /** Enable entity normalization pre-pass (garbage filtering, type normalization) @default true */
  entityNormalizationEnabled: z.boolean().optional(),
  /** Similarity threshold for entity resolution @default 0.85 */
  entityResolutionThreshold: z.number().min(0).max(1).optional(),
  /** Entity resolution strategy @default 'conservative' */
  entityResolutionStrategy: z.enum(['auto', 'conservative']).optional(),
  /** EntityMatcher minimum similarity for fuzzy pre-pass @default 0.85 */
  entityMatcherMinSimilarity: z.number().min(0).max(1).optional(),
  /** EntityMatcher maximum candidates per entity @default 10 */
  entityMatcherMaxCandidates: z.number().int().min(1).max(100).optional(),

  // --- HippoRAG ---
  /** Enable HippoRAG (brain-inspired retrieval with PPR) @default false */
  hippoEnabled: z.boolean().optional(),
  /** Personalized PageRank damping factor @default 0.85 */
  hippoPPRDamping: z.number().min(0).max(1).optional(),
  /** Maximum nodes to return from PPR traversal @default 50 */
  hippoMaxNodes: z.number().int().min(5).max(200).optional(),

  // --- SubGraph RAG ---
  /** Enable subgraph extraction for context-aware retrieval @default false */
  subgraphEnabled: z.boolean().optional(),
  /** Maximum nodes in extracted subgraph @default 50 */
  subgraphMaxNodes: z.number().int().min(5).max(200).optional(),
  /** Maximum hops from seed entities @default 2 */
  subgraphMaxHops: z.number().int().min(1).max(5).optional(),

  // --- Temporal GraphRAG ---
  /**
   * Enable temporal decay scoring for time-aware retrieval.
   * When enabled, older entities/relationships receive lower scores via exp(-decayRate * ageDays).
   * @default false
   */
  temporalEnabled: z.boolean().optional(),
  /**
   * Exponential decay rate per day for temporal scoring.
   * Higher values = faster decay. score *= exp(-decayRate * ageDays).
   * @default 0.1
   */
  temporalDecayRate: z.number().min(0).max(1).optional(),
  /**
   * Time window in days for temporal filtering.
   * Only entities/relationships updated within this window are considered.
   * @default 30
   */
  temporalWindowDays: z.number().int().min(1).max(365).optional(),

  // --- ToG (Think-on-Graph) ---
  /**
   * Enable Think-on-Graph LLM-guided beam search through the knowledge graph.
   * Uses LLM to iteratively select which relations to traverse.
   * @default false
   */
  togEnabled: z.boolean().optional(),
  /** Beam width for ToG search (number of parallel paths). @default 3 */
  togBeamWidth: z.number().int().min(1).max(10).optional(),
  /** Maximum graph exploration depth (hops). @default 3 */
  togMaxDepth: z.number().int().min(1).max(5).optional(),
  /** Maximum relations shown to LLM per hop for edge selection. @default 20 */
  togMaxRelations: z.number().int().min(5).max(50).optional(),
  /** Confidence decay for branched beams (same-type relation forks). @default 0.4 */
  togBranchDecay: z.number().min(0.1).max(1.0).optional(),

  // --- IRCoT (Interleaving Retrieval with Chain-of-Thought) ---
  /**
   * Enable IRCoT multi-step retrieval with chain-of-thought reasoning.
   * Iteratively retrieves evidence and reasons until answer is found.
   * @default false
   */
  ircotEnabled: z.boolean().optional(),
  /** Maximum retrieval-reasoning iterations for IRCoT. @default 5 */
  ircotMaxSteps: z.number().int().min(1).max(10).optional(),

  /**
   * Route aggregate queries (e.g. "list all organizations") through NL→Cypher
   * for exact recall, then merge results into the GraphRAG response.
   * Requires nlQuery.enabled in pipeline settings.
   * @default true
   */
  useNlCypherForAggregate: z.boolean().optional(),

  // --- Query Defaults ---
  /** Max graph traversal depth for local search @default 2 */
  maxDepth: z.number().int().min(1).max(10).optional(),
  /** Max relationships to include in context @default 30 */
  maxRelationships: z.number().int().positive().optional(),
  /** Max text units (chunks) to include in context @default 15 */
  maxTextUnits: z.number().int().positive().optional(),
  /** LLM temperature for answer generation @default 0.0 */
  temperature: z.number().min(0).max(2).optional(),
  /** Enable chunk expansion (query-time similar chunk retrieval) @default true */
  chunkExpansionEnabled: z.boolean().optional(),
  /** Max similar chunks per source chunk @default 2 */
  chunkExpansionLimit: z.number().int().min(0).max(10).optional(),
  /** Min similarity score for chunk expansion @default 0.7 */
  chunkExpansionMinScore: z.number().min(0).max(1).optional(),
  /** Concurrency for chunk expansion queries @default 5 */
  chunkExpansionConcurrency: z.number().int().min(1).max(20).optional(),

  // --- Results ---
  /** Include entities in results @default true */
  includeEntities: z.boolean().optional(),
  /** Include relationships in results @default true */
  includeRelationships: z.boolean().optional(),
  /** Include source chunks in results @default true */
  includeSources: z.boolean().optional(),
  /** Max tokens for response @default 4096 */
  maxTokens: z.number().int().positive().optional(),

  // --- Streaming ---
  /** Enable streaming @default false */
  streaming: z.boolean().optional(),
  /** Chunk size for streaming @default 100 */
  streamChunkSize: z.number().int().positive().optional(),

  // --- Extraction Types ---
  /** Entity types to extract (from ontology) */
  entityTypes: z.array(z.string()).optional(),
  /** @experimental Not yet wired — ontology-driven extraction supersedes this. Relationship types to extract (from ontology) */
  relationshipTypes: z.array(z.string()).optional(),

  // --- Gleaning (LLM re-extraction) ---
  /** Enable gleaning (multi-pass extraction) @default false */
  useGleaning: z.boolean().optional(),
  /** Max gleaning iterations @default 3 */
  maxGleaningIterations: z.number().int().min(1).max(10).optional(),

  // --- Deduplication ---
  /** Enable entity deduplication @default true */
  dedupEnabled: z.boolean().optional(),
  /** Minimum similarity for dedup match @default 0.85 */
  dedupMinSimilarity: z.number().min(0).max(1).optional(),
  /** Max dedup candidates per entity @default 50 */
  dedupMaxCandidates: z.number().int().positive().optional(),
  /** Enable alias detection during dedup @default true */
  dedupEnableAliases: z.boolean().optional(),

  // --- Extraction Tuning ---
  /** Enable numeric property extraction @default true */
  numericProperties: z.boolean().optional(),
  /** Batch size for extraction @default 10 */
  extractionBatchSize: z.number().int().positive().optional(),
  /** Concurrency for extraction @default 3 */
  extractionConcurrency: z.number().int().min(1).max(10).optional(),
  /** Max triples per chunk @default 50 */
  maxTriplesPerChunk: z.number().int().positive().optional(),
  /** Max entities per chunk @default 30 */
  maxEntitiesPerChunk: z.number().int().positive().optional(),

  // --- Per-Use-Case Model Override ---
  /** LLM model for entity/relationship extraction. Falls back to llm.model if unset. */
  extractionModel: z.string().optional(),
  /** LLM model for community summarization. Falls back to llm.model if unset. */
  communityModel: z.string().optional(),
  /** LLM model for RAG answer generation & global search. Falls back to llm.model if unset. */
  queryModel: z.string().optional(),
  /** LLM model for ontology induction. Falls back to llm.model if unset. */
  ontologyModel: z.string().optional(),

  // --- Per-Use-Case Max Tokens Override ---
  /** Max output tokens for extraction LLM call. Thinking models need higher values. @default 65536 */
  extractionMaxTokens: z.number().int().min(256).max(1_000_000).optional(),
  /** Max output tokens for community summarization LLM call. @default 16384 */
  communityMaxTokens: z.number().int().min(256).max(1_000_000).optional(),
  /** Max output tokens for query/answer generation LLM call. @default 16384 */
  queryMaxTokens: z.number().int().min(256).max(1_000_000).optional(),

  // --- Ontology Hints ---
  /** Top-K ontology classes for hints @default 10 */
  ontologyTopKClasses: z.number().int().positive().optional(),
  /** Top-K ontology properties for hints @default 20 */
  ontologyTopKProperties: z.number().int().positive().optional(),
  /** Min score for ontology hint inclusion @default 0.5 */
  ontologyMinScore: z.number().min(0).max(1).optional(),

  // --- OWL Inference ---
  /** Enable OWL inference (inverse/symmetric/transitive) on extracted triples @default true */
  owlInference: z.boolean().optional(),

  // --- Ontology Embedding ---
  /** Batch size for ontology vector embedding @default 30 */
  ontologyEmbedBatchSize: z.number().int().min(1).max(200).optional(),
  /** Max parallel embedding requests (match round-robin instance count) @default 5 */
  ontologyEmbedConcurrency: z.number().int().min(1).max(20).optional(),

  // --- Hybrid Search Fusion (HybridSearcher) ---
  /** RRF fusion weight for vector search results (0-1) @default 0.4 */
  fusionWeightVector: z.number().min(0).max(1).optional(),
  /** RRF fusion weight for BM25 keyword search results (0-1) @default 0.3 */
  fusionWeightBm25: z.number().min(0).max(1).optional(),
  /** RRF fusion weight for graph/PageRank search results (0-1) @default 0.3 */
  fusionWeightGraph: z.number().min(0).max(1).optional(),
  /** RRF k constant — higher = more equal weight to all ranks @default 60 */
  rrfK: z.number().int().min(1).max(200).optional(),
  /** BM25 term-frequency saturation parameter @default 1.5 */
  bm25K1: z.number().min(0).max(3).optional(),
  /** BM25 document-length normalization (0=no norm, 1=full norm) @default 0.75 */
  bm25B: z.number().min(0).max(1).optional(),
  /** Personalized PageRank damping factor @default 0.85 */
  pprDamping: z.number().min(0).max(1).optional(),
  /** Personalized PageRank max iterations @default 100 */
  pprIterations: z.number().int().min(25).max(500).optional(),
  /** Subgraph search decay factor per hop (score *= decayFactor) @default 0.5 */
  subgraphDecayFactor: z.number().min(0).max(1).optional(),

  // --- Entity Reranking (post-expandSubgraph) ---
  /** Enable question-aware entity reranking after subgraph expansion @default true */
  entityRerankEnabled: z.boolean().optional(),
  /** Max entities to keep after question-aware reranking of expanded subgraph @default 15 */
  maxExpandedEntities: z.number().int().min(1).max(200).optional(),
  /** BFS decay factor for entity reranking (seeds=1.0, hop1=decay, hop2=decay^2) @default 0.5 */
  entityRerankDecayFactor: z.number().min(0).max(1).optional(),
  /** Always run reranking even on small graphs (entity count ≤ limit). Ensures noise filtering. @default true */
  alwaysRerank: z.boolean().optional(),
  /** Minimum relevance score for entities/triples in context builder (0-1). Items below threshold are filtered out. @default 0.3 */
  minContextRelevance: z.number().min(0).max(1).optional(),

  // --- Query Classification & Entry Point Fallback ---
  /** Enable auto-detection of aggregate/thematic queries for routing to global search @default true */
  aggregateQueryDetection: z.boolean().optional(),
  /** Enable fallback to graph store entities when embedding search returns 0 entry points @default true */
  entryPointFallback: z.boolean().optional(),

  // --- Confidence Calibration ---
  /** Minimum avg relevance score to attempt LLM answer generation. Below threshold returns "insufficient info". @default 0.2 */
  confidenceThreshold: z.number().min(0).max(1).optional(),

  // --- Query Decomposition ---
  /** Enable decomposition of complex multi-aspect questions into sub-queries @default true */
  queryDecomposition: z.boolean().optional(),

  // --- Pipeline (RFC-123) ---
  /** Use new IRetriever-based pipeline instead of legacy GraphRAGOrchestrator. @default false */
  usePipeline: z.boolean().optional(),

  /** Enable intelligent auto-routing via QuestionAnalyzer. @default true */
  autoRoutingEnabled: z.boolean().optional(),

  /** Retriever for aggregation queries (e.g., "how many..."). @default 'global' */
  routeAggregate: z.string().optional(),

  /** Retriever for thematic queries (e.g., "what are the main themes..."). @default 'raptor' */
  routeThematic: z.string().optional(),

  /** Retriever for specific/factual queries (e.g., "who is..."). @default 'local' */
  routeSpecific: z.string().optional(),

  /** Retriever for multi-hop/relationship queries (e.g., "how is X connected to Y"). @default 'local' */
  routeMultiHop: z.string().optional(),

  /** Ordered fallback chain — try retrievers until one has results. @default ['local'] */
  fallbackChain: z.array(z.string()).optional(),

  /** Enable entity name boosting (entities mentioned in question get score boost). @default false */
  nameBoostEnabled: z.boolean().optional(),

  /** Per-tenant system prompt override for GraphRAG answer generation. @default undefined (uses built-in) */
  querySystemPrompt: z.string().optional(),
});

/** GraphRAG configuration for the tenant (inferred from Zod schema) */
export type GraphRAGConfig = z.infer<typeof GraphRAGConfigSchema>;

// ============================================================================
// Entity Resolution Configuration (RFC-096)
// ============================================================================

/**
 * Entity resolution strategy
 *
 * - `conservative`: Embedding-only, high thresholds (legacy behavior)
 * - `hybrid`: 3-pass waterfall — name → embedding → LLM fallback
 * - `llm-assisted`: Always use LLM for review-band pairs
 */
export type EntityResolutionStrategy = 'conservative' | 'hybrid' | 'llm-assisted';

/**
 * Entity resolution configuration (RFC-096)
 *
 * Controls the hybrid entity resolution pipeline:
 * garbage filter → blocking → 3-band scoring → optional LLM fallback.
 *
 * @see RFC-096 Hybrid Entity Resolution
 */
export const EntityResolutionConfigSchema = z.object({
  /** Enable entity resolution @default true */
  enabled: z.boolean().optional(),
  /** Resolution strategy @default 'hybrid' */
  strategy: z.enum(['conservative', 'hybrid', 'llm-assisted']).optional(),
  /** 3-band similarity thresholds */
  thresholds: z
    .object({
      /** Auto-merge threshold (score >= autoMerge → merge without review) @default 0.75 */
      autoMerge: z.number().min(0).max(1).optional(),
      /** Review threshold (review <= score < autoMerge → needs review or LLM) @default 0.65 */
      review: z.number().min(0).max(1).optional(),
      /** Reject threshold (score < reject → no match) @default 0.45 */
      reject: z.number().min(0).max(1).optional(),
    })
    .refine(
      (t) => {
        if (t.reject == null || t.review == null || t.autoMerge == null) return true;
        return t.reject < t.review && t.review < t.autoMerge;
      },
      { message: 'Thresholds must satisfy: reject < review < autoMerge' },
    )
    .optional(),
  /** Enable cross-lingual entity matching @default false */
  crossLingual: z.boolean().optional(),
  /** Enable LLM fallback for review-band pairs @default false */
  llmFallback: z.boolean().optional(),
  /** Enable garbage entity filtering (pronouns, articles, low-entropy names) @default true */
  garbageFilter: z.boolean().optional(),
  /** Max LLM calls per entity resolution batch (rate limiter) @default 10 */
  maxLlmCallsPerBatch: z.number().int().min(1).max(50).optional(),
  /** LLM confidence threshold — reject LLM decisions below this value @default 0.7 */
  llmConfidenceThreshold: z.number().min(0.1).max(1).optional(),
  /** Shannon entropy threshold — skip LLM for low-entropy entity names @default 1.5 */
  entropyThreshold: z.number().min(0.5).max(3).optional(),
});

/** Entity resolution configuration type (RFC-096) */
export type EntityResolutionConfig = z.infer<typeof EntityResolutionConfigSchema>;

// ============================================================================
// Multilingual Configuration (RFC-097)
// ============================================================================

/**
 * Multilingual configuration (RFC-097)
 *
 * Controls cross-lingual ontology, entity extraction, and alias resolution.
 *
 * @see RFC-097 Multilingual Ontology
 */
export const MultilingualConfigSchema = z.object({
  /** Enable multilingual support @default false */
  enabled: z.boolean().optional(),
  /** Default language (BCP 47) @default 'en' */
  defaultLanguage: z.string().optional(),
  /** Supported languages (BCP 47 codes) @default ['en'] */
  supportedLanguages: z.array(z.string()).optional(),
});

/** Multilingual configuration type (RFC-097) */
export type MultilingualConfig = z.infer<typeof MultilingualConfigSchema>;

// ============================================================================
// Vector Search Configuration (RFC-098)
// ============================================================================

/**
 * Vector search mode
 *
 * - `dense`: Standard ANN with dense embeddings only
 * - `sparse`: BM25-like sparse vector search only
 * - `hybrid`: Combined dense + sparse with RRF fusion
 */
export type VectorSearchMode = 'dense' | 'sparse' | 'hybrid';

/**
 * Vector search configuration (RFC-098)
 *
 * Controls search mode (dense/sparse/hybrid), weight distribution,
 * and reranking for improved retrieval quality.
 *
 * @see RFC-098 BGE-M3 Hybrid Search
 */
export const VectorSearchConfigSchema = z.object({
  /** Search mode @default 'dense' */
  mode: z.enum(['dense', 'sparse', 'hybrid']).optional(),
  /** Weight for sparse vectors in hybrid mode (0-1) @default 0.3 */
  sparseWeight: z.number().min(0).max(1).optional(),
  /** Weight for dense vectors in hybrid mode (0-1) @default 0.7 */
  denseWeight: z.number().min(0).max(1).optional(),
  /** Enable cross-encoder reranking after retrieval @default false */
  rerankEnabled: z.boolean().optional(),
  /** Top-K candidates to rerank @default 20 */
  rerankTopK: z.number().int().min(1).max(100).optional(),
  /** Weight for entity results in 3-way hybrid fusion (0-1, default: 0.3) */
  entityWeight: z.number().min(0).max(1).optional(),
  /** Enable BM25 full-text search on Milvus collections @default false */
  bm25Enabled: z.boolean().optional(),
  /** BM25 drop ratio — fraction of low-frequency terms to drop @default 0.05 */
  bm25DropRatio: z.number().min(0).max(1).optional(),
  /** BM25 analyzer language @default 'standard' */
  analyzerLanguage: z.string().optional(),
  /** BM25 weight for hybrid fusion @default 0.3 */
  bm25Weight: z.number().min(0).max(1).optional(),
});

/** Vector search configuration type (RFC-098) */
export type VectorSearchConfig = z.infer<typeof VectorSearchConfigSchema>;

// ============================================================================
// Quality Monitoring Configuration (RFC-118)
// ============================================================================

/**
 * Quality monitoring configuration (RFC-118)
 *
 * Controls production sampling, drift detection, and quality alerting.
 * ProductionSampler runs on the configured cron schedule and uses EWMA
 * to detect quality degradation across eval metrics.
 *
 * @see RFC-118 Quality Lifecycle Management
 */
export const QualityMonitoringConfigSchema = z.object({
  /** Enable quality monitoring (production sampling + drift detection) @default false */
  enabled: z.boolean().default(false),
  /** Cron expression for production sampler schedule @default "0 2 * * *" (daily 2am) */
  samplerCron: z.string().default('0 2 * * *'),
  /** EWMA smoothing factor for drift detection (0-1) @default 0.3 */
  driftAlpha: z.number().min(0).max(1).default(0.3),
  /** Delta threshold for warning-level drift alerts @default 0.05 */
  driftWarningThreshold: z.number().min(0).max(1).default(0.05),
  /** Delta threshold for critical-level drift alerts @default 0.10 */
  driftCriticalThreshold: z.number().min(0).max(1).default(0.1),
});

/** Quality monitoring configuration type (RFC-118) */
export type QualityMonitoringConfig = z.infer<typeof QualityMonitoringConfigSchema>;

// ============================================================================
// Eval Judge Configuration
// ============================================================================

/**
 * Eval judge configuration — controls LLM-as-a-judge scoring.
 * Per-tenant overrides for judge model, thresholds, and fallback behavior.
 * All fields optional — merged with DEFAULT_TENANT_CONFIG.eval at runtime.
 */
export const EvalConfigSchema = z.object({
  /** LLM model for eval judge (e.g., 'gpt-4', 'gemini-2.0-flash') */
  judgeModel: z.string().optional(),
  /** Custom system prompt for the judge LLM */
  judgeSystemPrompt: z.string().optional(),
  /** Enable LLM judge (default: true when model available) */
  judgeEnabled: z.boolean().optional(),
  /** Fall back to heuristic scoring if LLM fails (default: true) */
  heuristicFallback: z.boolean().optional(),
  /** Default pass/fail thresholds */
  thresholds: z
    .object({
      faithfulness: z.number().min(0).max(1).optional(),
      contextRelevance: z.number().min(0).max(1).optional(),
      answerRelevance: z.number().min(0).max(1).optional(),
      hallucination: z.number().min(0).max(1).optional(),
    })
    .optional(),
  /** Per-metric custom prompt overrides (placeholders: {context}, {answer}, {query}) */
  metricPrompts: z
    .object({
      faithfulness: z.string().optional(),
      contextRelevance: z.string().optional(),
      answerRelevance: z.string().optional(),
      hallucination: z.string().optional(),
    })
    .optional(),
  /** Default dataset ID for quality checks and scheduled evals */
  defaultDatasetId: z.string().optional(),
  /** Max items per dataset import (overrides project.config) */
  datasetMaxItems: z.number().int().min(1).max(10_000).optional(),
  /** Max chars per question or expectedAnswer */
  datasetMaxStringLength: z.number().int().min(100).max(100_000).optional(),
  /** Max chars for serialized metadata per item */
  datasetMaxMetadataLength: z.number().int().min(100).max(100_000).optional(),
});

/** Eval judge configuration type */
export type EvalConfig = z.infer<typeof EvalConfigSchema>;

// ============================================================================
// Agent Reasoning (RFC-128)
// ============================================================================

/**
 * Agent reasoning configuration — controls goal decomposition, tool ranking,
 * confidence estimation, and ReAct loop budgets.
 * Per-tenant overrides; all fields have defaults via Zod.
 */
export const AgentReasoningConfigSchema = z.object({
  /** Enable agent reasoning engine @default false */
  enabled: z.boolean().default(false),
  /** Confidence threshold to answer directly (0-1) @default 0.85 */
  confidenceThresholdAnswer: z.number().min(0).max(1).default(0.85),
  /** Confidence threshold to escalate to human (0-1) @default 0.50 */
  confidenceThresholdEscalate: z.number().min(0).max(1).default(0.5),
  /** Maximum subtasks from goal decomposition @default 5 */
  maxSubtasks: z.number().int().min(1).max(10).default(5),
  /** Maximum ReAct loop iterations @default 5 */
  maxReactIterations: z.number().int().min(1).max(20).default(5),
  /** Tool ranker weight distribution */
  toolRankerWeights: z
    .object({
      relevance: z.number().min(0).max(1).default(0.5),
      historicalSuccess: z.number().min(0).max(1).default(0.3),
      latency: z.number().min(0).max(1).default(0.1),
      freshness: z.number().min(0).max(1).default(0.1),
    })
    .default({}),
  /** Default budget constraints for reasoning loops */
  defaultBudget: z
    .object({
      maxSteps: z.number().int().min(1).max(50).default(10),
      maxTokens: z.number().int().min(1000).max(100000).default(8000),
      maxTimeMs: z.number().int().min(5000).max(300000).default(30000),
      maxRetries: z.number().int().min(0).max(10).default(2),
    })
    .default({}),
});

/** Agent reasoning configuration type */
export type AgentReasoningConfig = z.infer<typeof AgentReasoningConfigSchema>;

// ============================================================================
// Locale Settings
// ============================================================================

/**
 * Locale configuration for the tenant
 */
export interface LocaleConfig {
  /** Language code (ISO 639-1) @default 'en' */
  language?: string;
  /** Timezone (IANA) @default 'UTC' */
  timezone?: string;
  /** Date format @default 'YYYY-MM-DD' */
  dateFormat?: string;
  /** Number format locale @default 'en-US' */
  numberFormat?: string;
}

// ============================================================================
// Rate Limiting
// ============================================================================

/**
 * Rate limit configuration
 */
export interface RateLimitConfig {
  /** Requests per minute @default 60 */
  requestsPerMinute?: number;
  /** Requests per hour @default 1000 */
  requestsPerHour?: number;
  /** Requests per day @default 10000 */
  requestsPerDay?: number;
  /** Max concurrent requests @default 10 */
  maxConcurrent?: number;
  /** Token limit per minute (for LLM) @default 100000 */
  tokensPerMinute?: number;
}

// ============================================================================
// Feature Flags
// ============================================================================

/**
 * Feature flags for the tenant
 */
export interface FeatureFlags {
  /** Enable community detection @default true */
  communityDetection?: boolean;
  /** Enable entity deduplication @default true */
  entityDeduplication?: boolean;
  /** Enable ontology RAG @default false */
  ontologyRag?: boolean;
  /** Enable SHACL validation @default false */
  shaclValidation?: boolean;
  /** SHACL mode: 'warning' logs only, 'strict' blocks @default 'warning' */
  shaclMode?: 'warning' | 'strict';
  /** Enable numeric property extraction @default true */
  numericProperties?: boolean;
  /** Enable audit logging @default true */
  auditLogging?: boolean;
  /** Enable real-time events (WebSocket) @default false */
  realTimeEvents?: boolean;
}

// ============================================================================
// Fact Type Configuration (RFC-132 — custom fact types for agents)
// ============================================================================

/**
 * Per-agent/per-tenant fact type configuration.
 *
 * Controls which fact types are extracted, their confidence caps,
 * and extraction priority ordering. Stored in AgentDefinition.config.factTypes
 * and threaded through the memory pipeline to buildFactExtractionPrompt().
 */
export interface FactTypeConfig {
  /** Unique identifier for this fact type (e.g. 'world', 'preference') */
  id: string;
  /** Human-readable label */
  label: string;
  /** Description used in the LLM extraction prompt */
  description: string;
  /** Whether this fact type is active for extraction @default true */
  enabled: boolean;
  /** Maximum confidence score for facts of this type (0-1) @default 1.0 */
  confidenceCap: number;
  /** Extraction priority — lower numbers are listed first in the prompt @default 1 */
  extractionPriority: number;
}

/** Default fact types matching the hardcoded prompt in extract-facts.ts */
export const DEFAULT_FACT_TYPES: readonly FactTypeConfig[] = [
  {
    id: 'world',
    label: 'World Fact',
    description: 'Objectively verifiable fact about the world',
    enabled: true,
    confidenceCap: 1.0,
    extractionPriority: 1,
  },
  {
    id: 'experience',
    label: 'Personal Experience',
    description: 'Something the user has done or worked with',
    enabled: true,
    confidenceCap: 1.0,
    extractionPriority: 2,
  },
  {
    id: 'preference',
    label: 'User Preference',
    description: 'User stated preference or choice',
    enabled: true,
    confidenceCap: 0.9,
    extractionPriority: 3,
  },
  {
    id: 'opinion',
    label: 'Opinion',
    description: 'Subjective belief or assessment',
    enabled: true,
    confidenceCap: 0.69,
    extractionPriority: 4,
  },
  {
    id: 'decision',
    label: 'Decision',
    description: 'A decision made or action taken',
    enabled: true,
    confidenceCap: 1.0,
    extractionPriority: 5,
  },
  {
    id: 'pattern',
    label: 'Recurring Pattern',
    description: 'Something observed repeatedly',
    enabled: true,
    confidenceCap: 0.8,
    extractionPriority: 6,
  },
  {
    id: 'temporal',
    label: 'Time-Bound Fact',
    description: 'Fact that may become stale',
    enabled: true,
    confidenceCap: 0.9,
    extractionPriority: 7,
  },
];

// ============================================================================
// Memory Settings (RFC-080)
// ============================================================================

/**
 * Memory layer identifiers
 */
export type MemoryLayer = 'session' | 'working' | 'longterm' | 'entity';

/**
 * Memory access policy
 *
 * - `open`: everyone sees everything within tenant
 * - `scoped`: users see own + chat scope; agents see own + project scope
 * - `strict`: users see only own; agents see only assigned scope
 */
export type MemoryAccessPolicy = 'open' | 'scoped' | 'strict';

/**
 * Memory configuration for the tenant
 *
 * Controls entity fact injection, token budgets, extraction behavior,
 * access policies, and layer toggles.
 * Used by chat completions memory bridge for per-tenant memory settings.
 *
 * @see RFC-080 Chat Agent Platform
 */
export interface MemoryConfig {
  /** Enable memory context injection into chat prompts @default true */
  enabled?: boolean;
  /** Maximum entity facts to inject into prompt (list-all fallback mode) @default 50 */
  maxFactsInContext?: number;
  /** Maximum tokens for memory context @default 1024 */
  maxContextTokens?: number;
  /** Enable async fact extraction from conversations @default true */
  factExtractionEnabled?: boolean;
  /** Auto-extract facts from conversations (alias for factExtractionEnabled) @default true */
  extractFacts?: boolean;
  /** Max output tokens for fact extraction LLM call. Thinking models need higher values. @default 8000 */
  factExtractionMaxTokens?: number;
  /** Force JSON output from LLM for fact extraction (prevents markdown fences). @default true */
  factExtractionJsonMode?: boolean;
  /** Working memory TTL in hours @default 24 */
  ttlHours?: number;
  /** Maximum memory items per scope level @default 1000 */
  maxItemsPerScope?: number;
  /** Memory access policy controlling who can see what @default 'open' */
  accessPolicy?: MemoryAccessPolicy;
  /** Which memory layers are active for this tenant @default ['session','working','longterm','entity'] */
  enabledLayers?: MemoryLayer[];

  // --- RFC-126 Multi-Layer Graph Memory extensions ---

  /** Enable memory retention from conversations @default true */
  retainEnabled?: boolean;
  /** Minimum quality score for auto-promotion to knowledge layer (0..1) @default 0.7 */
  promotionThreshold?: number;
  /** Reflection interval in minutes @default 60 */
  reflectionIntervalMinutes?: number;
  /** Enable periodic reflection @default true */
  reflectEnabled?: boolean;
  /** Minimum total facts in store to trigger reflection @default 20 */
  reflectMinTotalFacts?: number;
  /** Minimum new facts since last reflection to trigger @default 5 */
  reflectMinNewFacts?: number;
  /** Use cross-encoder reranking for entity XRef matching @default false */
  entityXRefRerank?: boolean;
  /** Minimum cosine similarity for reinforcement dedup (lower = more aggressive dedup) @default 0.85 */
  reinforcementMinScore?: number;
  /** Enable cross-encoder reranking in reflector for better fact ordering @default false */
  reflectorRerank?: boolean;

  /**
   * Disposition traits for agent personality (RFC-126 Phase 5).
   * 3-axis model: skepticism, literalism, empathy (each 1-5).
   * @default { skepticism: 3, literalism: 3, empathy: 3 }
   */
  disposition?: {
    /** How critical vs trusting (1=trusting, 5=skeptical) @default 3 */
    skepticism?: number;
    /** How literal vs interpretive (1=reads between lines, 5=literal) @default 3 */
    literalism?: number;
    /** How emotion-focused vs fact-focused (1=facts only, 5=emotions matter) @default 3 */
    empathy?: number;
  };

  /**
   * Decay profile for memory forgetting curves (RFC-126 Phase 12.6).
   * Presets: aggressive (30d), balanced (90d, default), conservative (365d), custom.
   * @default 'balanced'
   */
  decayProfile?: 'aggressive' | 'balanced' | 'conservative' | 'custom';

  /**
   * Half-life in days for memory decay (used when decayProfile is 'custom').
   * After this many days the time-decay factor reaches 0.5.
   * @default 90
   */
  decayHalfLifeDays?: number;

  /**
   * Minimum score floor for memory decay — prevents total forgetting (0-1).
   * @default 0.05
   */
  decayFloor?: number;

  /**
   * Decay function mode: logarithmic (slow graceful), exponential (fast drop), linear.
   * @default 'logarithmic'
   */
  decayMode?: 'logarithmic' | 'exponential' | 'linear';

  /**
   * Frequency boost weight (0-1) — how much access count influences the final score.
   * @default 0.15
   */
  decayFrequencyBoost?: number;

  // --- Fact Cleanup settings (RFC-130 Phase 3) ---

  /** Enable automatic fact cleanup for this tenant @default true */
  factCleanupEnabled?: boolean;
  /** Max facts to analyze per cleanup run @default 500 */
  factCleanupLimit?: number;
  /** Cron expression for fact cleanup schedule (global, not per-tenant) @default '0 4 * * *' */
  factCleanupCron?: string;
  /** Drift alert threshold — alert if any fact type exceeds this fraction (0.1-1.0) @default 0.4 */
  driftAlertThreshold?: number;

  /**
   * LLM settings for memory operations (extraction, reflection).
   * Overrides project.config defaults per-tenant.
   */
  llm?: {
    /** Temperature for fact extraction @default 0 */
    extractionTemperature?: number;
    /** Max tokens for fact extraction @default 2000 */
    extractionMaxTokens?: number;
    /** Temperature for reflection @default 0.3 */
    reflectionTemperature?: number;
    /** Max tokens for reflection @default 3000 */
    reflectionMaxTokens?: number;
  };
}

// ============================================================================
// LLM Observability Settings (RFC-062)
// ============================================================================

/**
 * Observability configuration for the tenant
 *
 * Controls LLM tracing, metrics collection, and data retention.
 *
 * @see RFC-062 LLM Observability Platform
 */
export interface ObserveConfig {
  /** Enable observability for this tenant @default true */
  enabled?: boolean;

  /**
   * Sampling rate for traces (0.0 - 1.0)
   * - 1.0 = capture all traces (default)
   * - 0.5 = capture 50% of traces
   * - 0.0 = disable tracing
   * @default 1.0
   */
  sampleRate?: number;

  /** Trace retention in days (ClickHouse TTL) @default 30 */
  traceRetentionDays?: number;

  /** Generation data retention in days @default 90 */
  generationRetentionDays?: number;

  /**
   * Maximum payload size to store (KB)
   * Larger payloads are truncated to save storage
   * @default 100
   */
  maxPayloadSizeKb?: number;

  /**
   * Enable detailed input/output logging
   * When false, only metadata is stored (tokens, cost, latency)
   * @default true
   */
  logPayloads?: boolean;

  /**
   * Enable cost tracking
   * @default true
   */
  trackCost?: boolean;

  /**
   * Custom tags to add to all traces for this tenant
   */
  defaultTags?: string[];
}

// ============================================================================
// Tracing Configuration (RFC-115)
// ============================================================================

/**
 * OpenTelemetry tracing configuration for the tenant.
 *
 * Controls head-based sampling rate for distributed traces.
 * Separate from ObserveConfig which handles LLM-specific observability.
 *
 * @see RFC-115 Observability & Distributed Tracing
 */
export interface TracingConfig {
  /** Enable OTel tracing for this tenant @default true */
  enabled?: boolean;

  /**
   * Head-based sampling rate as percentage (0-100).
   * - 100 = capture all traces
   * - 5 = capture 5% of traces (default for standard tier)
   * - 0 = disable tracing
   *
   * Suggested rates by tier: free=1, standard=5, pro=10, enterprise=25
   * @default undefined (falls back to global OTEL_SAMPLING_RATE)
   */
  samplingRate?: number;
}

// ============================================================================
// Fallback Configuration (RFC-094)
// ============================================================================

/**
 * Configuration for automatic model fallback chains
 *
 * Maps model IDs to ordered lists of fallback model IDs.
 * When a primary model fails, the system tries each fallback in order.
 *
 * @see RFC-094 AI Model Management & Provider Gateway
 */
export interface FallbackConfig {
  /** Fallback on any error after retries exhausted */
  regular: Record<string, string[]>;
  /** Fallback when context window / token limit exceeded */
  contextWindow: Record<string, string[]>;
  /** Fallback when embedding dimensions don't match */
  dimensionMismatch: Record<string, string[]>;
}

/**
 * Get fallback chain for a model based on error type.
 * Returns ordered list of fallback model IDs, empty array if none configured.
 *
 * @param config - FallbackConfig from tenant configuration (may be undefined)
 * @param model - Primary model ID that failed
 * @param type - Type of failure that triggered fallback
 * @returns Ordered list of fallback model IDs
 */
export function getFallbackChain(
  config: FallbackConfig | undefined,
  model: string,
  type: 'regular' | 'contextWindow' | 'dimensionMismatch',
): string[] {
  if (!config) return [];
  return config[type]?.[model] ?? [];
}

// ============================================================================
// ACL Sync Settings (RFC-042)
// ============================================================================

/**
 * Identity resolution strategy for ACL sync
 *
 * - `strict`: Only sync permissions for users with explicit identity links.
 *   Best for enterprise deployments with strict access control.
 *
 * - `pending-grants`: Create pending grants for unknown emails,
 *   auto-apply when user signs up. Best for OSS/B2C deployments.
 *
 * @see RFC-042 Appendix I
 */
export type IdentityStrategy = 'strict' | 'pending-grants';

/**
 * OpenFGA tenancy mode
 *
 * - `shared`: Single OpenFGA store with tenant prefix in object IDs.
 *   Simpler, good for OSS/small deployments. REQUIRES SEC-001 fix.
 *
 * - `per-tenant`: Separate OpenFGA store per tenant.
 *   Stronger isolation, good for enterprise/compliance.
 *
 * @see RFC-042 Appendix I.7
 */
export type OpenFgaTenancyMode = 'shared' | 'per-tenant';

/**
 * Public document security settings
 */
export interface PublicDocsConfig {
  /**
   * Require admin approval before documents are marked public
   * Recommended for enterprise/compliance use cases
   * @default false
   */
  requireApproval?: boolean;

  /**
   * Maximum public documents per hour (rate limiting)
   * Prevents accidental mass exposure
   * @default 1000
   */
  rateLimitPerHour?: number;
}

/**
 * ACL Sync configuration for the tenant (RFC-042)
 *
 * Controls how access control lists are synchronized from
 * external sources (Google Drive, Slack, Confluence, etc.)
 * to OpenFGA for query-time enforcement.
 *
 * @see RFC-042 Data Connectors with Mirrored ACL
 * @see RFC-042 Appendix I: Architecture Decisions
 */
export interface AclSyncConfig {
  /**
   * Enable ACL sync for this tenant
   * When disabled, all documents are accessible to all tenant users
   * @default true
   */
  enabled?: boolean;

  /**
   * Maximum acceptable revocation lag in seconds
   *
   * Time between permission revocation in source (e.g., Google Drive)
   * and enforcement in OpenFGA queries.
   *
   * Lower values = more frequent polling = higher API costs
   * - Enterprise: 15 (critical for security)
   * - OSS/B2C: 300 (5 minutes, acceptable for most cases)
   *
   * @default 300
   */
  maxRevocationLagSeconds?: number;

  /**
   * Identity resolution strategy
   *
   * - `strict`: Only users with explicit identity links get access
   * - `pending-grants`: Unknown emails get pending grants, applied on signup
   *
   * @default 'pending-grants'
   */
  identityStrategy?: IdentityStrategy;

  /**
   * TTL for pending grants in days
   * Grants expire after this period if user doesn't sign up
   * @default 90
   */
  pendingGrantTtlDays?: number;

  /**
   * Trusted email domains for automatic guest user provisioning
   *
   * Users from these domains get guest accounts automatically
   * when their email appears in ACL sync (without explicit signup).
   *
   * Example: ['company.com', 'partner.org']
   *
   * @security SAML/LDAP may auto-populate this from IdP metadata
   */
  trustedDomains?: string[];

  /**
   * Public document security settings
   */
  publicDocs?: PublicDocsConfig;

  /**
   * OpenFGA tenancy mode
   *
   * - `shared`: Single store with tenant prefix (simpler)
   * - `per-tenant`: Dedicated store per tenant (stronger isolation)
   *
   * @default 'shared'
   */
  openFgaTenancyMode?: OpenFgaTenancyMode;

  /**
   * OpenFGA store ID (only for `per-tenant` mode)
   * Auto-generated if not provided
   */
  openFgaStoreId?: string;
}

// ============================================================================
// Deny Ledger Settings (RFC-042)
// ============================================================================

/**
 * Deny Ledger provider mode
 *
 * - `memory`: In-memory LRU cache + PostgreSQL backup (OSS default)
 * - `redis`: Redis primary + PostgreSQL backup (Enterprise)
 * - `postgres-only`: PostgreSQL only, no cache (max durability)
 */
export type DenyLedgerMode = 'memory' | 'redis' | 'postgres-only';

/**
 * Deny Ledger configuration for the tenant (RFC-042)
 *
 * Controls persistent storage for access denials.
 * Ensures security state survives service restarts.
 *
 * @see RFC-042 Appendix I.5 - Deny Ledger Architecture
 */
export interface DenyLedgerConfig {
  /**
   * Provider mode
   * @default 'memory'
   */
  mode?: DenyLedgerMode;

  /**
   * Cache TTL for deny entries (seconds)
   * Entries are refreshed from PostgreSQL after this time
   * @default 3600 (1 hour)
   */
  cacheTtlSeconds?: number;

  /**
   * Default TTL for brute-force lockouts (seconds)
   * @default 900 (15 minutes)
   */
  bruteForceExpireSeconds?: number;

  /**
   * Max entries in memory cache (LRU eviction)
   * @default 10000
   */
  maxCacheSize?: number;

  /**
   * Enable NATS pub/sub for multi-node sync
   * @default false
   */
  enableNatsSync?: boolean;
}

// ============================================================================
// Ingestion Settings
// ============================================================================

/**
 * Chunking strategy for document ingestion (RFC-105)
 */
export type ChunkingStrategy =
  | 'sentence-splitter'
  | 'semantic'
  | 'semantic-overlap'
  | 'hierarchical';

/**
 * Breakpoint detection method for semantic chunking (RFC-105)
 */
export type BreakpointMethod = 'percentile' | 'standard_deviation' | 'interquartile' | 'gradient';

/**
 * Content type hint for chunking optimization (RFC-105)
 */
export type ChunkingContentType = 'auto' | 'prose' | 'code' | 'mixed' | 'legal' | 'medical';

/**
 * Ingestion configuration for the tenant
 */
export interface IngestionConfig {
  /** Chunk size in characters @default 1000 */
  chunkSize?: number;
  /** Chunk overlap in characters @default 200 */
  chunkOverlap?: number;
  /** Supported file types */
  supportedFileTypes?: string[];
  /** Max file size in bytes @default 50MB */
  maxFileSize?: number;
  /** Max files per batch @default 100 */
  maxFilesPerBatch?: number;
  /** Enable OCR for images/PDFs @default false */
  enableOcr?: boolean;
  /** Enable table extraction @default true */
  enableTableExtraction?: boolean;
  /** Automatically process uploaded files through the ingestion pipeline @default false */
  autoIngestOnUpload?: boolean;

  // --- Semantic Chunker Settings (RFC-105) ---
  /** Chunking strategy to use @default 'sentence-splitter' */
  chunkingStrategy?: ChunkingStrategy;
  /** Breakpoint detection method for semantic chunking @default 'percentile' */
  breakpointMethod?: BreakpointMethod;
  /** Breakpoint threshold (0-100, percentile value for split detection) @default 95 */
  breakpointThreshold?: number;
  /** Minimum chunk size in tokens @default 50 */
  chunkMinTokens?: number;
  /** Maximum chunk size in tokens @default 500 */
  chunkMaxTokens?: number;
  /** Content type hint for chunking optimization @default 'auto' */
  contentType?: ChunkingContentType;
  /** Number of sentences to overlap between semantic chunks (0-10) @default 2 */
  overlapSentences?: number;
  /** Enable cosine similarity smoothing before breakpoint detection @default true */
  smoothingEnabled?: boolean;
  /** Sliding window size for smoothing (1-10) @default 3 */
  smoothingWindowSize?: number;
}

/**
 * Zod schema for IngestionConfig runtime validation (RFC-105)
 *
 * All fields optional — merged with DEFAULT_TENANT_CONFIG at runtime.
 */
export const IngestionConfigSchema = z.object({
  chunkSize: z.number().int().positive().optional(),
  chunkOverlap: z.number().int().nonnegative().optional(),
  supportedFileTypes: z.array(z.string()).optional(),
  maxFileSize: z.number().int().positive().optional(),
  maxFilesPerBatch: z.number().int().positive().optional(),
  enableOcr: z.boolean().optional(),
  enableTableExtraction: z.boolean().optional(),
  autoIngestOnUpload: z.boolean().optional(),
  // Semantic chunker settings (RFC-105)
  chunkingStrategy: z.enum(['sentence-splitter', 'semantic', 'semantic-overlap']).optional(),
  breakpointMethod: z
    .enum(['percentile', 'standard_deviation', 'interquartile', 'gradient'])
    .optional(),
  breakpointThreshold: z.number().min(1).max(100).optional(),
  chunkMinTokens: z.number().int().positive().optional(),
  chunkMaxTokens: z.number().int().positive().optional(),
  contentType: z.enum(['auto', 'prose', 'code', 'mixed', 'legal', 'medical']).optional(),
  overlapSentences: z.number().int().min(0).max(10).optional(),
  smoothingEnabled: z.boolean().optional(),
  smoothingWindowSize: z.number().int().min(1).max(10).optional(),
});

// ============================================================================
// Community Hierarchy
// ============================================================================

/**
 * Community hierarchy level description
 */
export interface CommunityLevel {
  /** Level index (0 = most detailed) */
  level: number;
  /** Level name (e.g., 'topics', 'themes', 'domains') */
  name: string;
  /** Level description */
  description?: string;
  /** Expected number of communities */
  expectedCount?: number;
}

// ============================================================================
// Main TenantConfig
// ============================================================================

/**
 * Complete tenant configuration
 *
 * Persistent layer stored in PostgreSQL + cached in Redis
 */
export interface TenantConfig {
  /** Unique tenant identifier */
  tenantId: string;

  /** Display name for the tenant */
  name?: string;

  /** Tenant description */
  description?: string;

  /** LLM configuration */
  llm: TenantLLMConfig;

  /** Embedding configuration */
  embedding: EmbeddingConfig;

  /** Prompt templates */
  prompts?: PromptConfig;

  /** Ontology bindings (multiple, priority-based) */
  ontologyBindings?: OntologyBinding[];

  /** GraphRAG settings */
  graphRag?: GraphRAGConfig;

  /** Locale settings */
  locale?: LocaleConfig;

  /** Rate limits */
  rateLimits?: RateLimitConfig;

  /** Feature flags */
  features?: FeatureFlags;

  /** Ingestion settings */
  ingestion?: IngestionConfig;

  /** Memory settings (RFC-080) */
  memory?: MemoryConfig;

  /** LLM Observability settings (RFC-062) */
  observe?: ObserveConfig;

  /** OTel tracing settings (RFC-115) */
  tracing?: TracingConfig;

  /** Model fallback chain configuration (RFC-094) */
  fallbackConfig?: FallbackConfig;

  /** ACL Sync settings (RFC-042) */
  aclSync?: AclSyncConfig;

  /** Deny Ledger settings (RFC-042) */
  denyLedger?: DenyLedgerConfig;

  /** Entity resolution settings (RFC-096) */
  entityResolution?: EntityResolutionConfig;

  /** Multilingual settings (RFC-097) */
  multilingual?: MultilingualConfig;

  /** Vector search settings (RFC-098) */
  vectorSearch?: VectorSearchConfig;

  /** Reranker settings */
  reranker?: RerankerConfig;

  /** Quality monitoring settings (RFC-118) */
  qualityMonitoring?: QualityMonitoringConfig;

  /** Eval judge settings (LLM-as-a-judge) */
  eval?: EvalConfig;

  /** Agent reasoning settings (RFC-128) */
  agentReasoning?: AgentReasoningConfig;

  /** Community hierarchy description */
  communityHierarchy?: CommunityLevel[];

  /** Config hash for cache invalidation */
  configHash?: string;

  /** Creation timestamp */
  createdAt?: string;

  /** Last update timestamp */
  updatedAt?: string;

  /** Custom metadata (extensible) */
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Create/Update DTOs
// ============================================================================

/**
 * DTO for creating a new tenant config
 */
export interface TenantConfigCreate {
  /** Unique tenant identifier */
  tenantId: string;
  /** Display name */
  name?: string;
  /** Description */
  description?: string;
  /** LLM configuration (required) */
  llm: TenantLLMConfig;
  /** Embedding configuration (required) */
  embedding: EmbeddingConfig;
  /** Optional: Prompt templates */
  prompts?: PromptConfig;
  /** Optional: Ontology bindings */
  ontologyBindings?: OntologyBinding[];
  /** Optional: GraphRAG settings */
  graphRag?: GraphRAGConfig;
  /** Optional: Locale settings */
  locale?: LocaleConfig;
  /** Optional: Rate limits */
  rateLimits?: RateLimitConfig;
  /** Optional: Feature flags */
  features?: FeatureFlags;
  /** Optional: Ingestion settings */
  ingestion?: IngestionConfig;
  /** Optional: Memory settings (RFC-080) */
  memory?: MemoryConfig;
  /** Optional: LLM Observability settings (RFC-062) */
  observe?: ObserveConfig;
  /** Optional: OTel tracing settings (RFC-115) */
  tracing?: TracingConfig;
  /** Optional: Model fallback chain configuration (RFC-094) */
  fallbackConfig?: FallbackConfig;
  /** Optional: ACL Sync settings (RFC-042) */
  aclSync?: AclSyncConfig;
  /** Optional: Deny Ledger settings (RFC-042) */
  denyLedger?: DenyLedgerConfig;
  /** Optional: Entity resolution settings (RFC-096) */
  entityResolution?: EntityResolutionConfig;
  /** Optional: Multilingual settings (RFC-097) */
  multilingual?: MultilingualConfig;
  /** Optional: Vector search settings (RFC-098) */
  vectorSearch?: VectorSearchConfig;
  /** Optional: Reranker settings */
  reranker?: RerankerConfig;
  /** Optional: Quality monitoring settings (RFC-118) */
  qualityMonitoring?: QualityMonitoringConfig;
  /** Optional: Eval judge settings */
  eval?: EvalConfig;
  /** Optional: Agent reasoning settings (RFC-128) */
  agentReasoning?: AgentReasoningConfig;
  /** Optional: Community hierarchy */
  communityHierarchy?: CommunityLevel[];
  /** Optional: Custom metadata */
  metadata?: Record<string, unknown>;
}

/**
 * DTO for updating a tenant config (all fields optional except tenantId)
 */
export interface TenantConfigUpdate {
  /** Tenant identifier (required for lookup) */
  tenantId: string;
  /** Display name */
  name?: string;
  /** Description */
  description?: string;
  /** LLM configuration */
  llm?: Partial<TenantLLMConfig>;
  /** Embedding configuration */
  embedding?: Partial<EmbeddingConfig>;
  /** Prompt templates */
  prompts?: Partial<PromptConfig>;
  /** Ontology bindings (replace all) */
  ontologyBindings?: OntologyBinding[];
  /** GraphRAG settings */
  graphRag?: Partial<GraphRAGConfig>;
  /** Locale settings */
  locale?: Partial<LocaleConfig>;
  /** Rate limits */
  rateLimits?: Partial<RateLimitConfig>;
  /** Feature flags */
  features?: Partial<FeatureFlags>;
  /** Ingestion settings */
  ingestion?: Partial<IngestionConfig>;
  /** Memory settings (RFC-080) */
  memory?: Partial<MemoryConfig>;
  /** LLM Observability settings (RFC-062) */
  observe?: Partial<ObserveConfig>;
  /** OTel tracing settings (RFC-115) */
  tracing?: Partial<TracingConfig>;
  /** Model fallback chain configuration (RFC-094) */
  fallbackConfig?: FallbackConfig;
  /** ACL Sync settings (RFC-042) */
  aclSync?: Partial<AclSyncConfig>;
  /** Deny Ledger settings (RFC-042) */
  denyLedger?: Partial<DenyLedgerConfig>;
  /** Entity resolution settings (RFC-096) */
  entityResolution?: Partial<EntityResolutionConfig>;
  /** Multilingual settings (RFC-097) */
  multilingual?: Partial<MultilingualConfig>;
  /** Vector search settings (RFC-098) */
  vectorSearch?: Partial<VectorSearchConfig>;
  /** Reranker settings */
  reranker?: Partial<RerankerConfig>;
  /** Quality monitoring settings (RFC-118) */
  qualityMonitoring?: Partial<QualityMonitoringConfig>;
  /** Eval judge settings */
  eval?: Partial<EvalConfig>;
  /** Agent reasoning settings (RFC-128) */
  agentReasoning?: Partial<AgentReasoningConfig>;
  /** Community hierarchy (replace all) */
  communityHierarchy?: CommunityLevel[];
  /** Custom metadata (merge) */
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Resolved Config (after composition)
// ============================================================================

/**
 * Resolved configuration after applying:
 * 1. System defaults
 * 2. Tenant config
 * 3. User preferences (if any)
 * 4. Request overrides
 */
export interface ResolvedTenantConfig {
  /** Source tenant config */
  tenantId: string;
  /** LLM configuration (resolved) */
  llm: Required<TenantLLMConfig>;
  /** Embedding configuration (resolved) */
  embedding: Required<EmbeddingConfig>;
  /** Prompt templates (resolved with defaults) */
  prompts: Required<PromptConfig>;
  /** Composed ontology (from bindings) */
  ontology: {
    classes: string[];
    objectProperties: string[];
    datatypeProperties: string[];
  };
  /** GraphRAG settings (resolved) */
  graphRag: Required<GraphRAGConfig>;
  /** Locale settings (resolved) */
  locale: Required<LocaleConfig>;
  /** Rate limits (resolved) */
  rateLimits: Required<RateLimitConfig>;
  /** Feature flags (resolved) */
  features: Required<FeatureFlags>;
  /** Ingestion settings (resolved) */
  ingestion: Required<IngestionConfig>;
  /** Resolution timestamp */
  resolvedAt: string;
}

// ============================================================================
// Runtime Type Guards (manual implementation)
// Note: Typia validators will be used in apps/pipeline where ts-patch is configured
// ============================================================================

/**
 * Check if value is a valid TenantLLMConfig
 */
export function isTenantLLMConfig(value: unknown): value is TenantLLMConfig {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.provider === 'string' &&
    ['openai', 'anthropic', 'azure', 'google', 'ollama', 'litellm', 'custom'].includes(
      v.provider,
    ) &&
    typeof v.model === 'string'
  );
}

/**
 * Check if value is a valid EmbeddingConfig
 */
export function isEmbeddingConfig(value: unknown): value is EmbeddingConfig {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.provider === 'string' &&
    ['openai', 'azure', 'infinity', 'ollama', 'litellm', 'custom'].includes(v.provider) &&
    typeof v.model === 'string'
  );
}

/**
 * Check if value is a valid TenantConfig (basic check)
 */
export function isTenantConfig(value: unknown): value is TenantConfig {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.tenantId === 'string' && isTenantLLMConfig(v.llm) && isEmbeddingConfig(v.embedding)
  );
}

/**
 * Check if value is a valid TenantConfigCreate
 */
export function isTenantConfigCreate(value: unknown): value is TenantConfigCreate {
  return isTenantConfig(value);
}

/**
 * Check if value is a valid TenantConfigUpdate
 */
export function isTenantConfigUpdate(value: unknown): value is TenantConfigUpdate {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.tenantId === 'string';
}

// ============================================================================
// Default Configuration
// ============================================================================

/**
 * System defaults for TenantConfig
 * Used when tenant config is missing or incomplete
 */
export const DEFAULT_TENANT_CONFIG: Omit<TenantConfig, 'tenantId' | 'llm' | 'embedding'> = {
  graphRag: {
    mode: 'auto' as const,
    maxHops: 2,
    topK: 20,
    useSchemaHints: true,
    ontologyMode: false,
    communityLevel: 0,
    includeCommunities: true,
    includeEntities: true,
    includeRelationships: true,
    includeSources: true,
    maxTokens: 4096,
    streaming: false,
    streamChunkSize: 100,
    // Gleaning
    useGleaning: true,
    maxGleaningIterations: 1,
    // Deduplication
    dedupEnabled: true,
    dedupMinSimilarity: 0.85,
    dedupMaxCandidates: 5,
    dedupEnableAliases: true,
    // Extraction tuning
    numericProperties: true,
    extractionBatchSize: 10,
    extractionConcurrency: 3,
    maxTriplesPerChunk: 50,
    // Community
    communityAlgorithm: 'louvain' as const,
    // communityResolution intentionally omitted — resolved per-algorithm in community handler
    // Louvain default: 1.5, Leiden default: 0.5 (different quality functions)
    maxClusterSize: 100,
    communityMaxLevels: 3,
    communityIncludeChunks: false,
    communityMaxChunksInPrompt: 5,
    communityChunkBudgetPercent: 20,
    communitySimilarityThreshold: 0.3,
    communitySearchTopK: 10,
    communityTopKCap: 100,
    // DRIFT iterative search
    driftEnabled: true,
    driftMaxHops: 3,
    driftSeedTopK: 5,
    driftSimilarityThreshold: 0.3,
    // RAPTOR tree summarization
    raptorEnabled: false,
    raptorMaxDepth: 3,
    raptorClusterSize: 10,
    raptorMinClusterSize: 3,
    // Entity Resolution
    entityResolutionEnabled: false,
    entityNormalizationEnabled: true,
    entityResolutionThreshold: 0.85,
    entityResolutionStrategy: 'conservative' as const,
    entityMatcherMinSimilarity: 0.85,
    entityMatcherMaxCandidates: 10,
    // HippoRAG
    hippoEnabled: false,
    hippoPPRDamping: 0.85,
    hippoMaxNodes: 50,
    // SubGraph RAG
    subgraphEnabled: false,
    subgraphMaxNodes: 50,
    subgraphMaxHops: 2,
    // Temporal GraphRAG
    temporalEnabled: false,
    temporalDecayRate: 0.1,
    temporalWindowDays: 30,
    // ToG (Think-on-Graph)
    togEnabled: false,
    togBeamWidth: 3,
    togMaxDepth: 3,
    togMaxRelations: 20,
    togBranchDecay: 0.4,
    // IRCoT
    ircotEnabled: false,
    ircotMaxSteps: 5,
    // NL→Cypher aggregate enrichment
    useNlCypherForAggregate: true,
    // Ontology hints
    ontologyTopKClasses: 20,
    ontologyTopKProperties: 30,
    ontologyMinScore: 0.3,
    // Ontology embedding
    ontologyEmbedBatchSize: 30,
    ontologyEmbedConcurrency: 5,
    // Hybrid Search Fusion
    fusionWeightVector: 0.4,
    fusionWeightBm25: 0.3,
    fusionWeightGraph: 0.3,
    rrfK: 60,
    bm25K1: 1.5,
    bm25B: 0.75,
    pprDamping: 0.85,
    pprIterations: 100,
    subgraphDecayFactor: 0.5,
    // Entity reranking
    entityRerankEnabled: true,
    maxExpandedEntities: 10,
    entityRerankDecayFactor: 0.5,
    alwaysRerank: true,
    minContextRelevance: 0.3,
    // Query classification & entry point fallback
    aggregateQueryDetection: true,
    entryPointFallback: true,
    // Query decomposition
    queryDecomposition: true,
    // Pipeline (RFC-123)
    usePipeline: true,
    autoRoutingEnabled: true,
    routeAggregate: 'global',
    routeThematic: 'raptor',
    routeSpecific: 'local',
    routeMultiHop: 'local',
    fallbackChain: ['local', 'global'],
    nameBoostEnabled: false,
  },
  locale: {
    language: 'en',
    timezone: 'UTC',
    dateFormat: 'YYYY-MM-DD',
    numberFormat: 'en-US',
  },
  rateLimits: {
    requestsPerMinute: 60,
    requestsPerHour: 1000,
    requestsPerDay: 10000,
    maxConcurrent: 10,
    tokensPerMinute: 100000,
  },
  features: {
    communityDetection: true,
    entityDeduplication: true,
    ontologyRag: false,
    shaclValidation: false,
    shaclMode: 'warning' as const,
    numericProperties: true,
    auditLogging: true,
    realTimeEvents: false,
  },
  ingestion: {
    chunkSize: 1000,
    chunkOverlap: 200,
    supportedFileTypes: ['txt', 'md', 'pdf', 'docx', 'html'],
    maxFileSize: 50 * 1024 * 1024, // 50MB
    maxFilesPerBatch: 100,
    enableOcr: false,
    enableTableExtraction: true,
    autoIngestOnUpload: false,
    // Semantic chunker settings (RFC-105)
    chunkingStrategy: 'sentence-splitter' as const,
    breakpointMethod: 'percentile' as const,
    breakpointThreshold: 95,
    chunkMinTokens: 50,
    chunkMaxTokens: 500,
    contentType: 'auto' as const,
    overlapSentences: 2,
    smoothingEnabled: true,
    smoothingWindowSize: 3,
  },
  memory: {
    enabled: true,
    maxFactsInContext: 50,
    maxContextTokens: 1024,
    factExtractionEnabled: true,
    extractFacts: true,
    factExtractionMaxTokens: 8000,
    factExtractionJsonMode: true,
    ttlHours: 24,
    maxItemsPerScope: 1000,
    accessPolicy: 'open' as const,
    enabledLayers: ['session', 'working', 'longterm', 'entity'],
    // RFC-126 extensions
    retainEnabled: true,
    promotionThreshold: 0.7,
    reflectionIntervalMinutes: 60,
    reflectEnabled: true,
    reflectMinTotalFacts: 20,
    reflectMinNewFacts: 5,
    entityXRefRerank: false,
    // RFC-126 Phase 12.6 — decay profiles
    decayProfile: 'balanced' as const,
    decayHalfLifeDays: 90,
    decayFloor: 0.05,
    decayMode: 'logarithmic' as const,
    decayFrequencyBoost: 0.15,
    disposition: {
      skepticism: 3,
      literalism: 3,
      empathy: 3,
    },
    // RFC-130 Phase 3 — fact cleanup
    factCleanupEnabled: true,
    factCleanupLimit: 500,
    factCleanupCron: '0 4 * * *',
    driftAlertThreshold: 0.4,
    llm: {
      extractionTemperature: 0,
      extractionMaxTokens: 2000,
      reflectionTemperature: 0.3,
      reflectionMaxTokens: 3000,
    },
  },
  observe: {
    enabled: true,
    sampleRate: 1.0, // Capture all traces by default
    traceRetentionDays: 30,
    generationRetentionDays: 90,
    maxPayloadSizeKb: 100,
    logPayloads: true,
    trackCost: true,
    defaultTags: [],
  },
  tracing: {
    enabled: true,
    // samplingRate intentionally undefined — falls back to global OTEL_SAMPLING_RATE
  },
  aclSync: {
    enabled: true,
    maxRevocationLagSeconds: 300, // 5 minutes (OSS default)
    identityStrategy: 'pending-grants' as const, // OSS default
    pendingGrantTtlDays: 90,
    trustedDomains: [],
    publicDocs: {
      requireApproval: false, // OSS default
      rateLimitPerHour: 1000,
    },
    openFgaTenancyMode: 'shared' as const, // OSS default
  },
  denyLedger: {
    mode: 'memory' as const, // OSS default
    cacheTtlSeconds: 3600, // 1 hour
    bruteForceExpireSeconds: 900, // 15 minutes
    maxCacheSize: 10000,
    enableNatsSync: false,
  },
  entityResolution: {
    enabled: true,
    strategy: 'hybrid' as const,
    thresholds: {
      autoMerge: 0.75,
      review: 0.65,
      reject: 0.45,
    },
    crossLingual: false,
    llmFallback: false,
    garbageFilter: true,
  },
  multilingual: {
    enabled: false,
    defaultLanguage: 'en',
    supportedLanguages: ['en'],
  },
  vectorSearch: {
    mode: 'hybrid' as const,
    sparseWeight: 0.3,
    denseWeight: 0.7,
    rerankEnabled: true,
    rerankTopK: 20,
  },
  reranker: {
    enabled: true,
    provider: 'infinity' as const,
    model: 'BAAI/bge-reranker-v2-m3',
    topN: 20,
    scoreThreshold: 0.0,
  },
  eval: {
    judgeEnabled: true,
    heuristicFallback: true,
    thresholds: {
      faithfulness: 0.7,
      contextRelevance: 0.7,
      answerRelevance: 0.7,
      hallucination: 0.3,
    },
  },
  agentReasoning: {
    enabled: false,
    confidenceThresholdAnswer: 0.85,
    confidenceThresholdEscalate: 0.5,
    maxSubtasks: 5,
    maxReactIterations: 5,
    toolRankerWeights: {
      relevance: 0.5,
      historicalSuccess: 0.3,
      latency: 0.1,
      freshness: 0.1,
    },
    defaultBudget: {
      maxSteps: 10,
      maxTokens: 8000,
      maxTimeMs: 30000,
      maxRetries: 2,
    },
  },
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Merge tenant config with defaults
 *
 * @param config - Partial tenant config
 * @returns Complete tenant config with defaults applied
 */
export function mergeTenantConfigWithDefaults(config: TenantConfigCreate): TenantConfig {
  return {
    ...config,
    graphRag: {
      ...DEFAULT_TENANT_CONFIG.graphRag,
      ...config.graphRag,
    },
    locale: {
      ...DEFAULT_TENANT_CONFIG.locale,
      ...config.locale,
    },
    rateLimits: {
      ...DEFAULT_TENANT_CONFIG.rateLimits,
      ...config.rateLimits,
    },
    features: {
      ...DEFAULT_TENANT_CONFIG.features,
      ...config.features,
    },
    ingestion: {
      ...DEFAULT_TENANT_CONFIG.ingestion,
      ...config.ingestion,
    },
    memory: {
      ...DEFAULT_TENANT_CONFIG.memory,
      ...config.memory,
      disposition: {
        ...DEFAULT_TENANT_CONFIG.memory?.disposition,
        ...config.memory?.disposition,
      },
      llm: {
        ...DEFAULT_TENANT_CONFIG.memory?.llm,
        ...config.memory?.llm,
      },
    },
    observe: {
      ...DEFAULT_TENANT_CONFIG.observe,
      ...config.observe,
    },
    tracing: {
      ...DEFAULT_TENANT_CONFIG.tracing,
      ...config.tracing,
    },
    aclSync: {
      ...DEFAULT_TENANT_CONFIG.aclSync,
      ...config.aclSync,
      publicDocs: {
        ...DEFAULT_TENANT_CONFIG.aclSync?.publicDocs,
        ...config.aclSync?.publicDocs,
      },
    },
    denyLedger: {
      ...DEFAULT_TENANT_CONFIG.denyLedger,
      ...config.denyLedger,
    },
    entityResolution: {
      ...DEFAULT_TENANT_CONFIG.entityResolution,
      ...config.entityResolution,
      thresholds: {
        ...DEFAULT_TENANT_CONFIG.entityResolution?.thresholds,
        ...config.entityResolution?.thresholds,
      },
    },
    multilingual: {
      ...DEFAULT_TENANT_CONFIG.multilingual,
      ...config.multilingual,
    },
    vectorSearch: {
      ...DEFAULT_TENANT_CONFIG.vectorSearch,
      ...config.vectorSearch,
    },
    eval: {
      ...DEFAULT_TENANT_CONFIG.eval,
      ...config.eval,
      thresholds: {
        ...DEFAULT_TENANT_CONFIG.eval?.thresholds,
        ...config.eval?.thresholds,
      },
    },
    agentReasoning: {
      ...DEFAULT_TENANT_CONFIG.agentReasoning!,
      ...config.agentReasoning,
      toolRankerWeights: {
        ...DEFAULT_TENANT_CONFIG.agentReasoning!.toolRankerWeights,
        ...config.agentReasoning?.toolRankerWeights,
      },
      defaultBudget: {
        ...DEFAULT_TENANT_CONFIG.agentReasoning!.defaultBudget,
        ...config.agentReasoning?.defaultBudget,
      },
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Apply update to existing tenant config
 *
 * @param existing - Existing tenant config
 * @param update - Update DTO
 * @returns Updated tenant config
 */
export function applyTenantConfigUpdate(
  existing: TenantConfig,
  update: TenantConfigUpdate,
): TenantConfig {
  return {
    ...existing,
    ...update,
    // Deep merge for nested objects
    llm: update.llm ? { ...existing.llm, ...update.llm } : existing.llm,
    embedding: update.embedding
      ? { ...existing.embedding, ...update.embedding }
      : existing.embedding,
    prompts: update.prompts ? { ...existing.prompts, ...update.prompts } : existing.prompts,
    graphRag: update.graphRag ? { ...existing.graphRag, ...update.graphRag } : existing.graphRag,
    locale: update.locale ? { ...existing.locale, ...update.locale } : existing.locale,
    rateLimits: update.rateLimits
      ? { ...existing.rateLimits, ...update.rateLimits }
      : existing.rateLimits,
    features: update.features ? { ...existing.features, ...update.features } : existing.features,
    ingestion: update.ingestion
      ? { ...existing.ingestion, ...update.ingestion }
      : existing.ingestion,
    memory: update.memory
      ? {
          ...existing.memory,
          ...update.memory,
          disposition: {
            ...existing.memory?.disposition,
            ...update.memory?.disposition,
          },
          llm: {
            ...existing.memory?.llm,
            ...update.memory?.llm,
          },
        }
      : existing.memory,
    observe: update.observe ? { ...existing.observe, ...update.observe } : existing.observe,
    tracing: update.tracing ? { ...existing.tracing, ...update.tracing } : existing.tracing,
    aclSync: update.aclSync
      ? {
          ...existing.aclSync,
          ...update.aclSync,
          publicDocs: update.aclSync.publicDocs
            ? { ...existing.aclSync?.publicDocs, ...update.aclSync.publicDocs }
            : existing.aclSync?.publicDocs,
        }
      : existing.aclSync,
    denyLedger: update.denyLedger
      ? { ...existing.denyLedger, ...update.denyLedger }
      : existing.denyLedger,
    entityResolution: update.entityResolution
      ? {
          ...DEFAULT_TENANT_CONFIG.entityResolution,
          ...existing.entityResolution,
          ...update.entityResolution,
          thresholds: {
            ...DEFAULT_TENANT_CONFIG.entityResolution?.thresholds,
            ...existing.entityResolution?.thresholds,
            ...update.entityResolution?.thresholds,
          },
        }
      : existing.entityResolution,
    multilingual: update.multilingual
      ? { ...DEFAULT_TENANT_CONFIG.multilingual, ...existing.multilingual, ...update.multilingual }
      : existing.multilingual,
    vectorSearch: update.vectorSearch
      ? { ...DEFAULT_TENANT_CONFIG.vectorSearch, ...existing.vectorSearch, ...update.vectorSearch }
      : existing.vectorSearch,
    reranker: update.reranker
      ? { ...DEFAULT_TENANT_CONFIG.reranker, ...existing.reranker, ...update.reranker }
      : existing.reranker,
    qualityMonitoring: update.qualityMonitoring
      ? {
          enabled: false,
          samplerCron: '0 2 * * *',
          driftAlpha: 0.3,
          driftWarningThreshold: 0.05,
          driftCriticalThreshold: 0.1,
          ...existing.qualityMonitoring,
          ...update.qualityMonitoring,
        }
      : existing.qualityMonitoring,
    eval: update.eval
      ? {
          ...DEFAULT_TENANT_CONFIG.eval,
          ...existing.eval,
          ...update.eval,
          thresholds: {
            ...DEFAULT_TENANT_CONFIG.eval?.thresholds,
            ...existing.eval?.thresholds,
            ...update.eval?.thresholds,
          },
        }
      : existing.eval,
    agentReasoning: update.agentReasoning
      ? {
          ...DEFAULT_TENANT_CONFIG.agentReasoning!,
          ...existing.agentReasoning,
          ...update.agentReasoning,
          toolRankerWeights: {
            ...DEFAULT_TENANT_CONFIG.agentReasoning!.toolRankerWeights,
            ...existing.agentReasoning?.toolRankerWeights,
            ...update.agentReasoning?.toolRankerWeights,
          },
          defaultBudget: {
            ...DEFAULT_TENANT_CONFIG.agentReasoning!.defaultBudget,
            ...existing.agentReasoning?.defaultBudget,
            ...update.agentReasoning?.defaultBudget,
          },
        }
      : existing.agentReasoning,
    metadata: update.metadata ? { ...existing.metadata, ...update.metadata } : existing.metadata,
    // Update timestamp
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Calculate config hash for cache invalidation
 *
 * @param config - Tenant config
 * @returns Hash string
 */
export function calculateConfigHash(config: TenantConfig): string {
  const { configHash: _configHash, createdAt: _createdAt, updatedAt: _updatedAt, ...rest } = config;
  // Simple hash based on JSON string
  const str = JSON.stringify(rest);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

// ============================================================================
// Sanitized Config (for inter-service propagation)
// ============================================================================

/**
 * Sanitized LLM configuration without sensitive fields
 *
 * Removes: apiKeyRef, baseUrl (credentials that should not leak via ctx.meta)
 * Keeps: provider, model, temperature, maxTokens, timeout
 *
 * @security RISK-003 - Prevents credential leak via inter-service calls
 */
export type SanitizedTenantLLMConfig = Omit<TenantLLMConfig, 'apiKeyRef' | 'baseUrl'>;

/**
 * Sanitized Embedding configuration without sensitive fields
 *
 * Removes: apiKeyRef, baseUrl (credentials that should not leak via ctx.meta)
 * Keeps: provider, model, dimension, batchSize
 *
 * @security RISK-003 - Prevents credential leak via inter-service calls
 */
export type SanitizedEmbeddingConfig = Omit<EmbeddingConfig, 'apiKeyRef' | 'baseUrl'>;

/**
 * Sanitized Reranker configuration without sensitive fields
 *
 * Removes: apiKeyRef, baseUrl (credentials that should not leak via ctx.meta)
 * Keeps: enabled, provider, model, topN, scoreThreshold, registryModelId, registryProviderId
 *
 * @security RISK-003 - Prevents credential leak via inter-service calls
 */
export type SanitizedRerankerConfig = Omit<RerankerConfig, 'apiKeyRef' | 'baseUrl'>;

/**
 * Sanitized TenantConfig for safe propagation via ctx.meta
 *
 * This type represents a TenantConfig with sensitive fields removed from
 * llm and embedding configurations. Use this for inter-service communication
 * where credentials should not be exposed.
 *
 * @security RISK-003 - Prevents credential leak via inter-service calls
 *
 * @example
 * ```typescript
 * // In session middleware
 * ctx.meta.tenantConfig = sanitizeTenantConfig(response.data);  // Safe for propagation
 * ctx.locals.tenantConfig = response.data;  // Full config, server-side only
 * ```
 */
export type SanitizedTenantConfig = Omit<TenantConfig, 'llm' | 'embedding' | 'reranker'> & {
  /** Sanitized LLM configuration (without apiKeyRef, baseUrl) */
  llm: SanitizedTenantLLMConfig;
  /** Sanitized Embedding configuration (without apiKeyRef, baseUrl) */
  embedding: SanitizedEmbeddingConfig;
  /** Sanitized Reranker configuration (without apiKeyRef, baseUrl) */
  reranker?: SanitizedRerankerConfig;
};

/**
 * Sanitizes TenantConfig for safe propagation via ctx.meta
 *
 * Removes sensitive fields from LLM and Embedding configs:
 * - apiKeyRef: Vault reference to API key
 * - baseUrl: Custom endpoint URL (may contain auth tokens)
 *
 * Use this function when passing TenantConfig through ctx.meta to prevent
 * credential leakage during inter-service calls.
 *
 * @param config - Full TenantConfig with sensitive fields
 * @returns SanitizedTenantConfig safe for inter-service propagation
 *
 * @security RISK-003 - Prevents credential leak via inter-service calls
 *
 * @example
 * ```typescript
 * // In session middleware (line ~732)
 * import { sanitizeTenantConfig } from '@gertsai/core';
 *
 * // BEFORE (vulnerable)
 * ctx.meta.tenantConfig = response.data;
 *
 * // AFTER (safe)
 * ctx.meta.tenantConfig = sanitizeTenantConfig(response.data);  // Safe for propagation
 * ctx.locals.tenantConfig = response.data;  // Full config, server-side only
 * ```
 */
export function sanitizeTenantConfig(config: TenantConfig): SanitizedTenantConfig {
  // Destructure to remove sensitive LLM fields
  const { apiKeyRef: _llmApiKey, baseUrl: _llmBaseUrl, ...sanitizedLlm } = config.llm;

  // Destructure to remove sensitive Embedding fields
  const {
    apiKeyRef: _embeddingApiKey,
    baseUrl: _embeddingBaseUrl,
    ...sanitizedEmbedding
  } = config.embedding;

  // Destructure to remove sensitive Reranker fields (if present)
  let sanitizedReranker: SanitizedRerankerConfig | undefined;
  if (config.reranker) {
    const { apiKeyRef: _rerankerApiKey, baseUrl: _rerankerBaseUrl, ...rest } = config.reranker;
    sanitizedReranker = rest;
  }

  // Return config with sanitized nested objects
  return {
    ...config,
    llm: sanitizedLlm,
    embedding: sanitizedEmbedding,
    reranker: sanitizedReranker,
  };
}

/**
 * Check if value is a SanitizedTenantConfig
 *
 * Validates that the config is a valid TenantConfig structure
 * AND does not contain sensitive fields (apiKeyRef, baseUrl).
 *
 * @param value - Value to check
 * @returns True if value is a valid SanitizedTenantConfig
 *
 * @security RISK-003 - Runtime validation for sanitized configs
 */
export function isSanitizedTenantConfig(value: unknown): value is SanitizedTenantConfig {
  // First check if it's a valid TenantConfig structure
  if (!isTenantConfig(value)) return false;

  const config = value as TenantConfig;

  // Verify LLM config does NOT have sensitive fields
  if ('apiKeyRef' in config.llm || 'baseUrl' in config.llm) {
    return false;
  }

  // Verify Embedding config does NOT have sensitive fields
  if ('apiKeyRef' in config.embedding || 'baseUrl' in config.embedding) {
    return false;
  }

  // Verify Reranker config does NOT have sensitive fields (if present)
  if (config.reranker && ('apiKeyRef' in config.reranker || 'baseUrl' in config.reranker)) {
    return false;
  }

  return true;
}
