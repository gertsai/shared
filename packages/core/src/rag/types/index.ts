/**
 * @fileoverview RAG Types Index (RFC-036)
 *
 * Re-exports all RAG API Standard types.
 *
 * @module @gertsai/core/rag/types
 */

// Response types
export type {
  ResponseId,
  SourceId,
  CitationId,
  Source,
  TokenUsage,
  RAGResponseCore,
} from './response';

export {
  createResponseId,
  createSourceId,
  createCitationId,
} from './response';

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
} from './capabilities';

export {
  hasGrounding,
  hasObservability,
  hasGraph,
} from './capabilities';

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
} from './request';

export {
  createRAGRequest,
  hasCapability,
} from './request';

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
} from './streaming';

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
} from './streaming';

// Error types
export type {
  RAGErrorStage,
  RAGErrorCode,
  RAGError,
  RAGPartialResult,
  RAGResult,
} from './errors';

export {
  ERROR_STATUS_CODES,
  RAGErrors,
  isRetryable,
  getStatusCode,
  isSuccess,
  isFailure,
  isPartialSuccess,
} from './errors';
