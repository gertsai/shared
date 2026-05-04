/**
 * @fileoverview RAG API Standard (RFC-036)
 *
 * Universal types for RAG API responses.
 *
 * ## Overview
 *
 * This module provides:
 * - **Request types**: `RAGRequest`, `MetadataFilter`
 * - **Response types**: `RAGResponse`, `Source`, `TokenUsage`
 * - **Capabilities**: `GroundingCapability`, `ObservabilityCapability`, `GraphCapability`
 * - **Streaming**: `RAGStreamEvent`, `encodeSSE`
 * - **Errors**: `RAGError`, `RAGErrors`
 * - **Schemas**: Zod validation schemas
 *
 * ## Usage
 *
 * ### Basic Response
 *
 * ```typescript
 * import { RAGResponse, createResponseId, createSourceId } from '@gertsai/core/rag';
 *
 * const response: RAGResponse<{}> = {
 *   id: createResponseId(),
 *   object: 'rag.response',
 *   answer: 'Alice Chen is a software engineer at NeuraTech.',
 *   sources: [{
 *     id: createSourceId(),
 *     text: 'Alice Chen works at NeuraTech as a senior engineer.',
 *     score: 0.95,
 *     documentId: 'doc_123',
 *     chunkIndex: 0,
 *   }],
 *   usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
 *   createdAt: new Date().toISOString(),
 *   tenantId: 'demo',
 * };
 * ```
 *
 * ### With Capabilities
 *
 * ```typescript
 * import { RAGResponse } from '@gertsai/core/rag';
 *
 * const response: RAGResponse<{ grounding: true; graph: true }> = {
 *   ...coreFields,
 *   grounding: {
 *     citations: [],
 *     groundingScore: 0.95,
 *     mode: 'accurate',
 *   },
 *   graph: {
 *     mode: 'local',
 *     entities: [],
 *     relationships: [],
 *   },
 * };
 * ```
 *
 * ### Streaming
 *
 * ```typescript
 * import { RAGStreamEvent, encodeSSE, createTextDelta } from '@gertsai/core/rag';
 *
 * function* streamResponse(): Generator<string> {
 *   yield encodeSSE({ type: 'start', id: 'rag_123', timestamp: new Date().toISOString() });
 *   yield encodeSSE(createTextDelta('Hello '));
 *   yield encodeSSE(createTextDelta('World!'));
 *   yield encodeSSE({ type: 'finish', finishReason: 'complete' });
 * }
 * ```
 *
 * ### Error Handling
 *
 * ```typescript
 * import { RAGErrors, RAGResult, isSuccess } from '@gertsai/core/rag';
 *
 * async function query(req: RAGRequest): Promise<RAGResult<{}>> {
 *   try {
 *     const response = await doQuery(req);
 *     return { success: true, data: response };
 *   } catch (e) {
 *     if (e instanceof TimeoutError) {
 *       return { success: false, error: RAGErrors.retrievalTimeout(5000) };
 *     }
 *     return { success: false, error: RAGErrors.internal(e) };
 *   }
 * }
 *
 * const result = await query(request);
 * if (isSuccess(result)) {
 *   console.log(result.data.answer);
 * }
 * ```
 *
 * ### Request Validation
 *
 * ```typescript
 * import { RAGRequestSchema, safeValidateRAGRequest } from '@gertsai/core/rag';
 *
 * const result = safeValidateRAGRequest(requestBody);
 * if (result.success) {
 *   const validated = result.data;
 * } else {
 *   console.error(result.error.issues);
 * }
 * ```
 *
 * @module @gertsai/core/rag
 */

// ============================================
// Types
// ============================================

// Response types
export type {
  ResponseId,
  SourceId,
  CitationId,
  Source,
  TokenUsage,
  RAGResponseCore,
} from './types';

export {
  createResponseId,
  createSourceId,
  createCitationId,
} from './types';

// Capability types
export type {
  Citation,
  GroundingCapability,
  RetrievalMetadata,
  GenerationMetadata,
  LatencyBreakdown,
  ObservabilityCapability,
  Entity,
  Relationship,
  SubgraphNode,
  SubgraphEdge,
  Community,
  GraphCapability,
  RAGCapabilities,
  RAGResponse,
} from './types';

export {
  hasGrounding,
  hasObservability,
  hasGraph,
} from './types';

// Request types
export type {
  FilterOperator,
  MetadataFilter,
  CompositeFilter,
  RetrievalStrategy,
  RetrievalConfig,
  GenerationConfig,
  GroundingConfig,
  GraphMode,
  GraphConfig,
  RAGRequest,
} from './types';

export {
  createRAGRequest,
  hasCapability,
} from './types';

// Streaming types
export type {
  StreamStartEvent,
  StreamFinishEvent,
  HeartbeatEvent,
  TextStartEvent,
  TextDeltaEvent,
  TextEndEvent,
  RetrievalStartEvent,
  RetrievalCandidateEvent,
  RerankStartEvent,
  RetrievalSourceEvent,
  RetrievalCompleteEvent,
  GroundingCitationEvent,
  GroundingCompleteEvent,
  GraphStartEvent,
  GraphEntityEvent,
  GraphRelationshipEvent,
  GraphCommunityEvent,
  GraphCompleteEvent,
  RAGCompleteEvent,
  RAGUsageEvent,
  WarningEvent,
  ErrorEvent,
  RAGStreamEvent,
} from './types';

export {
  encodeSSE,
  encodeSSEWithId,
  decodeSSE,
  isTextDelta,
  isRetrievalEvent,
  isGroundingEvent,
  isGraphEvent,
  isErrorEvent,
  isCompleteEvent,
  createStartEvent,
  createFinishEvent,
  createTextDelta,
  createHeartbeat,
} from './types';

// Error types
export type {
  RAGErrorStage,
  RAGErrorCode,
  RAGError,
  RAGPartialResult,
  RAGResult,
} from './types';

export {
  ERROR_STATUS_CODES,
  RAGErrors,
  isRetryable,
  getStatusCode,
  isSuccess,
  isFailure,
  isPartialSuccess,
} from './types';

// ============================================
// Schemas
// ============================================

export {
  // Request schemas
  FilterOperatorSchema,
  MetadataFilterSchema,
  CompositeFilterSchema,
  RetrievalConfigSchema,
  GenerationConfigSchema,
  GroundingConfigSchema,
  GraphConfigSchema,
  CapabilitySchema,
  RAGRequestSchema,
  type RAGRequestInput,
  type RAGRequestParsed,
  validateRAGRequest,
  safeValidateRAGRequest,
  formatValidationErrors,

  // Response schemas
  SourceSchema,
  type SourceFromSchema,
  TokenUsageSchema,
  RAGResponseCoreSchema,
  CitationSchema,
  GroundingCapabilitySchema,
  RetrievalMetadataSchema,
  GenerationMetadataSchema,
  LatencyBreakdownSchema,
  ObservabilityCapabilitySchema,
  EntitySchema,
  RelationshipSchema,
  SubgraphNodeSchema,
  SubgraphEdgeSchema,
  CommunitySchema,
  GraphCapabilitySchema,
  RAGResponseFullSchema,
  type RAGResponseFull,
  RAGErrorSchema,
  type RAGErrorFromSchema,
  validateRAGResponse,
  safeValidateRAGResponse,
  validateRAGError,
} from './schemas';
