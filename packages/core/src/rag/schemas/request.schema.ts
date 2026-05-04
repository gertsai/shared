/**
 * @fileoverview RAG Request Zod Schemas (RFC-036)
 *
 * Runtime validation schemas for RAG API requests.
 * Uses Zod for type-safe validation with TypeScript inference.
 *
 * @module @gertsai/core/rag/schemas
 */

import { z } from 'zod';

// ============================================
// Filter Schemas
// ============================================

/**
 * Filter operator schema.
 */
export const FilterOperatorSchema = z.enum([
  'eq',
  'ne',
  'gt',
  'gte',
  'lt',
  'lte',
  'in',
  'nin',
  'contains',
  'startsWith',
  'exists',
]);

/**
 * Metadata filter schema.
 */
export const MetadataFilterSchema = z.object({
  field: z.string().min(1),
  operator: FilterOperatorSchema,
  value: z.unknown(),
});

/**
 * Composite filter schema (recursive).
 */
export const CompositeFilterSchema: z.ZodType<{
  operator: 'and' | 'or';
  filters: Array<
    | z.infer<typeof MetadataFilterSchema>
    | { operator: 'and' | 'or'; filters: unknown[] }
  >;
}> = z.lazy(() =>
  z.object({
    operator: z.enum(['and', 'or']),
    filters: z.array(z.union([MetadataFilterSchema, CompositeFilterSchema])),
  })
);

// ============================================
// Configuration Schemas
// ============================================

/**
 * Retrieval configuration schema.
 */
export const RetrievalConfigSchema = z.object({
  strategy: z.enum(['vector', 'hybrid', 'graph', 'bm25', 'auto']).optional(),
  topK: z.number().int().min(1).max(100).optional(),
  minScore: z.number().min(0).max(1).optional(),
  filter: z.union([MetadataFilterSchema, CompositeFilterSchema]).optional(),
  rerank: z.boolean().optional(),
  rerankerModel: z.string().optional(),
  maxContextTokens: z.number().int().min(1).max(128000).optional(),
  collection: z.string().optional(),
  namespaces: z.array(z.string()).optional(),
}).strict();

/**
 * Generation configuration schema.
 */
export const GenerationConfigSchema = z.object({
  model: z.string().optional(),
  maxTokens: z.number().int().min(1).max(128000).optional(),
  temperature: z.number().min(0).max(2).optional(),
  systemPrompt: z.string().max(100000).optional(),
  stopSequences: z.array(z.string()).max(4).optional(),
  frequencyPenalty: z.number().min(-2).max(2).optional(),
  presencePenalty: z.number().min(-2).max(2).optional(),
  topP: z.number().min(0).max(1).optional(),
  responseFormat: z.enum(['text', 'json', 'markdown']).optional(),
}).strict();

/**
 * Grounding configuration schema.
 */
export const GroundingConfigSchema = z.object({
  mode: z.enum(['accurate', 'fast']).optional(),
  includeExcerpts: z.boolean().optional(),
  minConfidence: z.number().min(0).max(1).optional(),
  maxCitationsPerClaim: z.number().int().min(1).max(10).optional(),
}).strict();

/**
 * Graph configuration schema.
 */
export const GraphConfigSchema = z.object({
  mode: z.enum(['local', 'global', 'hybrid', 'drift', 'auto']).optional(),
  maxHops: z.number().int().min(1).max(5).optional(),
  includeCommunities: z.boolean().optional(),
  includeSubgraph: z.boolean().optional(),
  entityLimit: z.number().int().min(1).max(500).optional(),
  relationshipLimit: z.number().int().min(1).max(1000).optional(),
  entityTypes: z.array(z.string()).optional(),
  relationshipTypes: z.array(z.string()).optional(),
  minEntityScore: z.number().min(0).max(1).optional(),
}).strict();

// ============================================
// RAG Request Schema
// ============================================

/**
 * Capability names.
 */
export const CapabilitySchema = z.enum(['grounding', 'observability', 'graph']);

/**
 * Full RAG request schema.
 *
 * Validates all request fields with appropriate constraints.
 * Uses `passthrough()` for forward compatibility.
 *
 * @example
 * ```typescript
 * const result = RAGRequestSchema.safeParse(requestBody);
 * if (result.success) {
 *   const validated = result.data;
 * } else {
 *   console.error(result.error.issues);
 * }
 * ```
 */
export const RAGRequestSchema = z.object({
  // Required
  question: z
    .string()
    .min(1, 'Question cannot be empty')
    .max(100000, 'Question is too long'),
  tenantId: z
    .string()
    .min(1, 'Tenant ID is required')
    .max(256, 'Tenant ID is too long'),

  // Capability selection
  capabilities: z.array(CapabilitySchema).optional(),

  // Phase configuration
  retrieval: RetrievalConfigSchema.optional(),
  generation: GenerationConfigSchema.optional(),
  grounding: GroundingConfigSchema.optional(),
  graph: GraphConfigSchema.optional(),

  // Streaming
  stream: z.boolean().optional(),

  // Tracing
  traceId: z.string().max(128).optional(),
  parentSpanId: z.string().max(64).optional(),

  // Request metadata
  timeoutMs: z.number().int().min(1000).max(300000).optional(),
  idempotencyKey: z.string().max(256).optional(),
  userId: z.string().max(256).optional(),
  sessionId: z.string().max(256).optional(),

  // Extensions
  extensions: z.record(z.unknown()).optional(),
}).passthrough(); // Forward compatibility

/**
 * Inferred input type (before validation).
 */
export type RAGRequestInput = z.input<typeof RAGRequestSchema>;

/**
 * Inferred output type (after validation).
 */
export type RAGRequestParsed = z.output<typeof RAGRequestSchema>;

// ============================================
// Validation Helpers
// ============================================

/**
 * Validates a RAG request.
 *
 * @param input - Request to validate
 * @returns Validated request
 * @throws ZodError if validation fails
 */
export function validateRAGRequest(input: unknown): RAGRequestParsed {
  return RAGRequestSchema.parse(input);
}

/**
 * Safely validates a RAG request.
 *
 * @param input - Request to validate
 * @returns Safe parse result with success flag
 */
export function safeValidateRAGRequest(input: unknown) {
  return RAGRequestSchema.safeParse(input);
}

/**
 * Extracts validation error messages.
 *
 * @param error - Zod error
 * @returns Array of error messages with paths
 */
export function formatValidationErrors(
  error: z.ZodError
): Array<{ path: string; message: string }> {
  return error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }));
}
