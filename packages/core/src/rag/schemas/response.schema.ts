/**
 * @fileoverview RAG Response Zod Schemas (RFC-036)
 *
 * Runtime validation schemas for RAG API responses.
 * Useful for validating external API responses.
 *
 * @module @gerts/core/rag/schemas
 */

import { z } from 'zod';

// ============================================
// Source Schema
// ============================================

/**
 * Source schema.
 */
export const SourceSchema = z.object({
  id: z.string(),
  text: z.string(),
  score: z.number().min(0).max(1),
  documentId: z.string(),
  chunkIndex: z.number().int().nonnegative(),
  url: z.string().url().optional(),
  title: z.string().optional(),
  pageNumber: z.number().int().positive().optional(),
  vectorScore: z.number().min(0).max(1).optional(),
  keywordScore: z.number().min(0).max(1).optional(),
  rerankScore: z.number().min(0).max(1).optional(),
  entityMentions: z.array(z.string()).optional(),
  indexedAt: z.string().datetime().optional(),
  metadata: z.record(z.unknown()).optional(),
});

/**
 * Inferred Source type from schema.
 */
export type SourceFromSchema = z.infer<typeof SourceSchema>;

// ============================================
// Token Usage Schema
// ============================================

/**
 * Token usage schema (OpenAI-compatible).
 */
export const TokenUsageSchema = z.object({
  promptTokens: z.number().int().nonnegative(),
  completionTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
  retrievalTokens: z.number().int().nonnegative().optional(),
  graphTokens: z.number().int().nonnegative().optional(),
  cachedTokens: z.number().int().nonnegative().optional(),
});

// ============================================
// RAG Response Core Schema
// ============================================

/**
 * Core RAG response schema.
 */
export const RAGResponseCoreSchema = z.object({
  id: z.string().regex(/^rag_/),
  object: z.literal('rag.response'),
  answer: z.string(),
  sources: z.array(SourceSchema),
  usage: TokenUsageSchema,
  createdAt: z.string().datetime(),
  tenantId: z.string(),
  model: z.string().optional(),
  apiVersion: z.string().optional(),
}).passthrough();

// ============================================
// Capability Schemas
// ============================================

/**
 * Citation schema.
 */
export const CitationSchema = z.object({
  id: z.string().regex(/^cit_/),
  sourceId: z.string().regex(/^src_/),
  startChar: z.number().int().nonnegative(),
  endChar: z.number().int().positive(),
  text: z.string(),
  claim: z.string().optional(),
  confidence: z.number().min(0).max(1),
});

/**
 * Grounding capability schema.
 */
export const GroundingCapabilitySchema = z.object({
  grounding: z.object({
    citations: z.array(CitationSchema),
    groundingScore: z.number().min(0).max(1),
    mode: z.enum(['accurate', 'fast']),
    claimCount: z.number().int().nonnegative().optional(),
    groundedClaimCount: z.number().int().nonnegative().optional(),
  }),
});

/**
 * Retrieval metadata schema.
 */
export const RetrievalMetadataSchema = z.object({
  strategy: z.enum(['vector', 'hybrid', 'graph', 'bm25']),
  candidateCount: z.number().int().nonnegative(),
  usedCount: z.number().int().nonnegative(),
  rerankingApplied: z.boolean(),
  latencyMs: z.number().nonnegative(),
  embeddingModel: z.string().optional(),
  rerankerModel: z.string().optional(),
});

/**
 * Generation metadata schema.
 */
export const GenerationMetadataSchema = z.object({
  model: z.string(),
  temperature: z.number().min(0).max(2),
  maxTokens: z.number().int().positive(),
  stopReason: z.enum(['end_turn', 'max_tokens', 'stop_sequence']),
  latencyMs: z.number().nonnegative(),
  retries: z.number().int().nonnegative().optional(),
});

/**
 * Latency breakdown schema.
 */
export const LatencyBreakdownSchema = z.object({
  totalMs: z.number().nonnegative(),
  retrievalMs: z.number().nonnegative(),
  generationMs: z.number().nonnegative(),
  groundingMs: z.number().nonnegative().optional(),
  graphMs: z.number().nonnegative().optional(),
  queueMs: z.number().nonnegative().optional(),
});

/**
 * Observability capability schema.
 */
export const ObservabilityCapabilitySchema = z.object({
  observability: z.object({
    retrieval: RetrievalMetadataSchema,
    generation: GenerationMetadataSchema,
    traceId: z.string(),
    spanId: z.string(),
    latency: LatencyBreakdownSchema,
    parentSpanId: z.string().optional(),
    sizes: z.object({
      requestBytes: z.number().int().nonnegative(),
      responseBytes: z.number().int().nonnegative(),
    }).optional(),
  }),
});

/**
 * Entity schema.
 */
export const EntitySchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  description: z.string().optional(),
  properties: z.record(z.unknown()).optional(),
  mentions: z.number().int().nonnegative().optional(),
  relevance: z.number().min(0).max(1).optional(),
});

/**
 * Relationship schema.
 */
export const RelationshipSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  type: z.string(),
  properties: z.record(z.unknown()).optional(),
  weight: z.number().min(0).max(1).optional(),
});

/**
 * Subgraph node schema.
 */
export const SubgraphNodeSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  properties: z.record(z.unknown()).optional(),
});

/**
 * Subgraph edge schema.
 */
export const SubgraphEdgeSchema = z.object({
  source: z.string(),
  target: z.string(),
  label: z.string(),
  weight: z.number().min(0).max(1).optional(),
});

/**
 * Community schema.
 */
export const CommunitySchema = z.object({
  id: z.string(),
  level: z.number().int().nonnegative(),
  title: z.string(),
  summary: z.string(),
  entityIds: z.array(z.string()),
  score: z.number().min(0).max(1),
});

/**
 * Graph capability schema.
 */
export const GraphCapabilitySchema = z.object({
  graph: z.object({
    mode: z.enum(['local', 'global', 'hybrid', 'drift']),
    entities: z.array(EntitySchema),
    relationships: z.array(RelationshipSchema),
    subgraph: z.object({
      nodes: z.array(SubgraphNodeSchema),
      edges: z.array(SubgraphEdgeSchema),
    }).optional(),
    communities: z.array(CommunitySchema).optional(),
    hops: z.number().int().nonnegative().optional(),
    nodesTraversed: z.number().int().nonnegative().optional(),
  }),
});

// ============================================
// Full Response Schema
// ============================================

/**
 * Full RAG response schema with all capabilities.
 */
export const RAGResponseFullSchema = RAGResponseCoreSchema
  .merge(GroundingCapabilitySchema.partial())
  .merge(ObservabilityCapabilitySchema.partial())
  .merge(GraphCapabilitySchema.partial());

/**
 * Inferred full response type.
 */
export type RAGResponseFull = z.infer<typeof RAGResponseFullSchema>;

// ============================================
// Error Schema
// ============================================

/**
 * RAG error schema (RFC 9457 + OpenAI).
 */
export const RAGErrorSchema = z.object({
  type: z.string().url(),
  title: z.string(),
  status: z.number().int().min(100).max(599),
  detail: z.string(),
  instance: z.string().optional(),
  error: z.object({
    message: z.string(),
    type: z.string(),
    code: z.string(),
    param: z.string().optional(),
  }),
  stage: z.enum([
    'validation',
    'retrieval',
    'generation',
    'grounding',
    'graph',
    'streaming',
    'unknown',
  ]),
  retryable: z.boolean(),
  retryAfterMs: z.number().int().positive().optional(),
  requestId: z.string(),
  traceId: z.string().optional(),
  timestamp: z.string().datetime(),
});

/**
 * Inferred error type from schema.
 */
export type RAGErrorFromSchema = z.infer<typeof RAGErrorSchema>;

// ============================================
// Validation Helpers
// ============================================

/**
 * Validates a RAG response.
 */
export function validateRAGResponse(input: unknown): RAGResponseFull {
  return RAGResponseFullSchema.parse(input);
}

/**
 * Safely validates a RAG response.
 */
export function safeValidateRAGResponse(input: unknown) {
  return RAGResponseFullSchema.safeParse(input);
}

/**
 * Validates a RAG error.
 */
export function validateRAGError(input: unknown): RAGErrorFromSchema {
  return RAGErrorSchema.parse(input);
}
