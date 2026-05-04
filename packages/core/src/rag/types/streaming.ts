/**
 * @fileoverview RAG Streaming Types (RFC-036)
 *
 * Server-Sent Events (SSE) streaming protocol for RAG responses.
 * Based on Vercel AI SDK v5 data stream protocol with RAG extensions.
 *
 * Event Namespace:
 * - Standard events: `start`, `text-delta`, `finish` (Vercel AI SDK compatible)
 * - RAG events: `rag.*` namespace (retrieval, grounding, graph)
 *
 * @module @gertsai/core/rag
 */

import type {
  Source,
  TokenUsage,
} from './response';
import type {
  Citation,
  Entity,
  Relationship,
  Community,
  RAGCapabilities,
  RAGResponse,
} from './capabilities';
import type { RAGError } from './errors';

// ============================================
// Base Stream Event
// ============================================

/**
 * Base interface for all stream events.
 */
interface BaseStreamEvent {
  /** Event type discriminator */
  readonly type: string;
}

// ============================================
// Lifecycle Events
// ============================================

/** Stream started event */
export interface StreamStartEvent extends BaseStreamEvent {
  readonly type: 'start';
  readonly id: string;
  readonly timestamp: string;
}

/** Stream finished event */
export interface StreamFinishEvent extends BaseStreamEvent {
  readonly type: 'finish';
  readonly finishReason: 'complete' | 'error' | 'cancelled' | 'length';
}

/** Heartbeat for connection keep-alive */
export interface HeartbeatEvent extends BaseStreamEvent {
  readonly type: 'heartbeat';
  readonly ts: number;
}

// ============================================
// Text Generation Events (Vercel AI SDK compatible)
// ============================================

/** Text generation started */
export interface TextStartEvent extends BaseStreamEvent {
  readonly type: 'text-start';
  readonly messageId: string;
}

/** Text chunk/delta */
export interface TextDeltaEvent extends BaseStreamEvent {
  readonly type: 'text-delta';
  readonly textDelta: string;
}

/** Text generation ended */
export interface TextEndEvent extends BaseStreamEvent {
  readonly type: 'text-end';
}

// ============================================
// RAG Retrieval Events
// ============================================

/** Retrieval phase started */
export interface RetrievalStartEvent extends BaseStreamEvent {
  readonly type: 'rag.retrieval.start';
  readonly strategy: string;
}

/** Candidate source found (before re-ranking) */
export interface RetrievalCandidateEvent extends BaseStreamEvent {
  readonly type: 'rag.retrieval.candidate';
  readonly source: Source;
  readonly index: number;
}

/** Re-ranking started */
export interface RerankStartEvent extends BaseStreamEvent {
  readonly type: 'rag.retrieval.rerank.start';
  readonly candidates: number;
}

/** Final source selected (after re-ranking) */
export interface RetrievalSourceEvent extends BaseStreamEvent {
  readonly type: 'rag.retrieval.source';
  readonly source: Source;
}

/** Retrieval phase completed */
export interface RetrievalCompleteEvent extends BaseStreamEvent {
  readonly type: 'rag.retrieval.complete';
  readonly count: number;
  readonly latencyMs: number;
}

// ============================================
// RAG Grounding Events
// ============================================

/** Citation added */
export interface GroundingCitationEvent extends BaseStreamEvent {
  readonly type: 'rag.grounding.citation';
  readonly citation: Citation;
}

/** Grounding phase completed */
export interface GroundingCompleteEvent extends BaseStreamEvent {
  readonly type: 'rag.grounding.complete';
  readonly groundingScore: number;
  readonly citationCount: number;
}

// ============================================
// RAG Graph Events
// ============================================

/** Graph traversal started */
export interface GraphStartEvent extends BaseStreamEvent {
  readonly type: 'rag.graph.start';
  readonly mode: string;
}

/** Entity found */
export interface GraphEntityEvent extends BaseStreamEvent {
  readonly type: 'rag.graph.entity';
  readonly entity: Entity;
}

/** Relationship found */
export interface GraphRelationshipEvent extends BaseStreamEvent {
  readonly type: 'rag.graph.relationship';
  readonly relationship: Relationship;
}

/** Community found (global search) */
export interface GraphCommunityEvent extends BaseStreamEvent {
  readonly type: 'rag.graph.community';
  readonly community: Community;
}

/** Graph traversal completed */
export interface GraphCompleteEvent extends BaseStreamEvent {
  readonly type: 'rag.graph.complete';
  readonly nodeCount: number;
  readonly edgeCount: number;
}

// ============================================
// RAG Completion Events
// ============================================

/** Full response (final event with complete data) */
export interface RAGCompleteEvent<C extends RAGCapabilities> extends BaseStreamEvent {
  readonly type: 'rag.complete';
  readonly response: RAGResponse<C>;
}

/** Token usage statistics */
export interface RAGUsageEvent extends BaseStreamEvent {
  readonly type: 'rag.usage';
  readonly usage: TokenUsage;
}

// ============================================
// Error/Warning Events
// ============================================

/** Non-fatal warning */
export interface WarningEvent extends BaseStreamEvent {
  readonly type: 'warning';
  readonly stage: string;
  readonly message: string;
  readonly code: string;
}

/** Fatal error */
export interface ErrorEvent extends BaseStreamEvent {
  readonly type: 'error';
  readonly error: RAGError;
}

// ============================================
// Discriminated Union
// ============================================

/**
 * All possible RAG stream event types.
 *
 * Uses TypeScript discriminated union for type-safe event handling.
 * Events are grouped by category:
 *
 * - **Lifecycle**: `start`, `finish`, `heartbeat`
 * - **Text**: `text-start`, `text-delta`, `text-end`
 * - **Retrieval**: `rag.retrieval.*`
 * - **Grounding**: `rag.grounding.*`
 * - **Graph**: `rag.graph.*`
 * - **Completion**: `rag.complete`, `rag.usage`
 * - **Errors**: `warning`, `error`
 *
 * @typeParam C - Capability flags for conditional event types
 *
 * @example
 * ```typescript
 * function handleEvent<C extends RAGCapabilities>(event: RAGStreamEvent<C>) {
 *   switch (event.type) {
 *     case 'start':
 *       console.log('Stream started:', event.id);
 *       break;
 *     case 'text-delta':
 *       process.stdout.write(event.textDelta);
 *       break;
 *     case 'rag.retrieval.source':
 *       console.log('Source:', event.source.title);
 *       break;
 *     case 'finish':
 *       console.log('Done:', event.finishReason);
 *       break;
 *   }
 * }
 * ```
 */
export type RAGStreamEvent<C extends RAGCapabilities = {}> =
  // Lifecycle
  | StreamStartEvent
  | StreamFinishEvent
  | HeartbeatEvent

  // Text generation (Vercel AI SDK compatible)
  | TextStartEvent
  | TextDeltaEvent
  | TextEndEvent

  // Retrieval
  | RetrievalStartEvent
  | RetrievalCandidateEvent
  | RerankStartEvent
  | RetrievalSourceEvent
  | RetrievalCompleteEvent

  // Grounding (conditional)
  | (C['grounding'] extends true ? GroundingCitationEvent : never)
  | (C['grounding'] extends true ? GroundingCompleteEvent : never)

  // Graph (conditional)
  | (C['graph'] extends true ? GraphStartEvent : never)
  | (C['graph'] extends true ? GraphEntityEvent : never)
  | (C['graph'] extends true ? GraphRelationshipEvent : never)
  | (C['graph'] extends true ? GraphCommunityEvent : never)
  | (C['graph'] extends true ? GraphCompleteEvent : never)

  // Completion
  | RAGCompleteEvent<C>
  | RAGUsageEvent

  // Errors
  | WarningEvent
  | ErrorEvent;

// ============================================
// SSE Encoding/Decoding
// ============================================

/**
 * Encodes a stream event as SSE format.
 *
 * @param event - The event to encode
 * @returns SSE-formatted string
 *
 * @example
 * ```typescript
 * const sse = encodeSSE({ type: 'text-delta', textDelta: 'Hello' });
 * // Returns: "event: text-delta\ndata: {"type":"text-delta","textDelta":"Hello"}\n\n"
 * ```
 */
export function encodeSSE<C extends RAGCapabilities>(
  event: RAGStreamEvent<C>
): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

/**
 * Encodes an event as SSE with optional ID.
 *
 * @param event - The event to encode
 * @param id - Optional event ID for client-side resume
 * @returns SSE-formatted string with ID
 */
export function encodeSSEWithId<C extends RAGCapabilities>(
  event: RAGStreamEvent<C>,
  id: string
): string {
  return `id: ${id}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

/**
 * Decodes an SSE data line to event object.
 *
 * @param data - The JSON data string from SSE
 * @returns Parsed event object
 *
 * @example
 * ```typescript
 * const event = decodeSSE<{}>('{"type":"text-delta","textDelta":"Hello"}');
 * // event.type === 'text-delta'
 * ```
 */
export function decodeSSE<C extends RAGCapabilities>(
  data: string
): RAGStreamEvent<C> {
  return JSON.parse(data);
}

// ============================================
// Event Type Guards
// ============================================

/**
 * Checks if event is a text delta.
 */
export function isTextDelta(event: RAGStreamEvent<any>): event is TextDeltaEvent {
  return event.type === 'text-delta';
}

/**
 * Checks if event is a retrieval event.
 */
export function isRetrievalEvent(event: RAGStreamEvent<any>): boolean {
  return event.type.startsWith('rag.retrieval.');
}

/**
 * Checks if event is a grounding event.
 */
export function isGroundingEvent(event: RAGStreamEvent<any>): boolean {
  return event.type.startsWith('rag.grounding.');
}

/**
 * Checks if event is a graph event.
 */
export function isGraphEvent(event: RAGStreamEvent<any>): boolean {
  return event.type.startsWith('rag.graph.');
}

/**
 * Checks if event is an error.
 */
export function isErrorEvent(event: RAGStreamEvent<any>): event is ErrorEvent {
  return event.type === 'error';
}

/**
 * Checks if event is the final complete event.
 */
export function isCompleteEvent<C extends RAGCapabilities>(
  event: RAGStreamEvent<C>
): event is RAGCompleteEvent<C> {
  return event.type === 'rag.complete';
}

// ============================================
// Stream Helpers
// ============================================

/**
 * Creates a start event.
 */
export function createStartEvent(id: string): StreamStartEvent {
  return {
    type: 'start',
    id,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Creates a finish event.
 */
export function createFinishEvent(
  finishReason: StreamFinishEvent['finishReason']
): StreamFinishEvent {
  return { type: 'finish', finishReason };
}

/**
 * Creates a text delta event.
 */
export function createTextDelta(textDelta: string): TextDeltaEvent {
  return { type: 'text-delta', textDelta };
}

/**
 * Creates a heartbeat event.
 */
export function createHeartbeat(): HeartbeatEvent {
  return { type: 'heartbeat', ts: Date.now() };
}
