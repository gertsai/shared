/**
 * @gertsai/core - Streaming Interfaces
 *
 * Core streaming abstractions for async operations.
 * Used by Graph RAG, LLM providers, and other async operations.
 */

// ============================================================================
// Generic Streaming Interfaces
// ============================================================================

/**
 * Generic streamable result.
 *
 * Represents an async operation that produces chunks and a final result.
 * Used for streaming LLM responses, Graph RAG results, etc.
 *
 * @typeParam TChunk - Type of individual chunks (e.g., string, event)
 * @typeParam TResult - Type of final result
 *
 * @example
 * ```typescript
 * const streamable: IStreamable<string, GraphRAGResult> = await graphRAG.queryStream(query);
 *
 * // Consume chunks
 * for await (const chunk of streamable.stream) {
 *   console.log(chunk);
 * }
 *
 * // Get final result
 * const result = await streamable.result;
 * ```
 */
export interface IStreamable<TChunk, TResult> {
  /** Async iterator for chunks */
  stream: AsyncIterable<TChunk>;

  /** Promise that resolves to final result */
  result: Promise<TResult>;

  /** Abort the stream */
  abort: () => void;
}

/**
 * Enhanced streamable with async abort and state tracking.
 *
 * @typeParam TChunk - Type of individual chunks
 * @typeParam TResult - Type of final result
 */
export interface IStreamableEnhanced<TChunk, TResult> extends IStreamable<TChunk, TResult> {
  /** Abort and wait for cleanup to complete */
  abortAsync: (reason?: string) => Promise<void>;

  /** Check if stream is still active */
  readonly isActive: boolean;

  /** Current buffer size for backpressure monitoring */
  readonly bufferSize: number;
}

// ============================================================================
// Stream Callbacks
// ============================================================================

/**
 * Stream progress callback.
 * Called with progress events during streaming.
 *
 * @typeParam TEvent - Type of progress events
 */
export type StreamProgressCallback<TEvent> = (event: TEvent) => void;

/**
 * Stream chunk callback.
 * Called with each chunk as it's produced.
 *
 * @typeParam TChunk - Type of chunks
 */
export type StreamChunkCallback<TChunk> = (chunk: TChunk) => void;

/**
 * Stream error callback.
 * Called when an error occurs during streaming.
 */
export type StreamErrorCallback = (error: Error) => void;

/**
 * Stream completion callback.
 * Called when streaming completes successfully.
 *
 * @typeParam TResult - Type of final result
 */
export type StreamCompleteCallback<TResult> = (result: TResult) => void;

// ============================================================================
// Stream Configuration
// ============================================================================

/**
 * Configuration for streaming behavior.
 */
export interface StreamingConfig {
  /** Maximum buffer size before backpressure kicks in */
  maxBufferSize?: number;

  /** Timeout for individual chunk operations (ms) */
  chunkTimeout?: number;

  /** Whether to swallow callback errors */
  swallowCallbackErrors?: boolean;

  /** Error handler for callback failures */
  onCallbackError?: (error: Error, callbackName: string) => void;
}

/**
 * Default streaming configuration.
 */
export const DEFAULT_STREAMING_CONFIG: StreamingConfig = {
  maxBufferSize: 100,
  chunkTimeout: 30000,
  swallowCallbackErrors: true,
  onCallbackError: (error, name) => {
    console.warn(`Callback ${name} threw an error:`, error.message);
  },
};

// ============================================================================
// Stream Events
// ============================================================================

/**
 * Base stream event interface.
 */
export interface StreamEvent {
  /** Event type */
  type: string;

  /** Event timestamp */
  timestamp: number;
}

/**
 * Stream start event.
 */
export interface StreamStartEvent extends StreamEvent {
  type: 'start';

  /** Optional metadata about the stream */
  metadata?: Record<string, unknown>;
}

/**
 * Stream chunk event.
 */
export interface StreamChunkEvent<TChunk> extends StreamEvent {
  type: 'chunk';

  /** The chunk data */
  data: TChunk;

  /** Chunk index (0-based) */
  index: number;
}

/**
 * Stream error event.
 */
export interface StreamErrorEvent extends StreamEvent {
  type: 'error';

  /** Error details */
  error: Error;

  /** Whether the error is recoverable */
  recoverable: boolean;
}

/**
 * Stream complete event.
 */
export interface StreamCompleteEvent<TResult> extends StreamEvent {
  type: 'complete';

  /** Final result */
  result: TResult;

  /** Total chunks produced */
  totalChunks: number;

  /** Total duration (ms) */
  durationMs: number;
}

/**
 * Union of all stream events.
 */
export type AnyStreamEvent<TChunk, TResult> =
  | StreamStartEvent
  | StreamChunkEvent<TChunk>
  | StreamErrorEvent
  | StreamCompleteEvent<TResult>;

// ============================================================================
// Stream Builder Pattern
// ============================================================================

/**
 * Stream callback configuration.
 *
 * @typeParam TChunk - Type of chunks
 * @typeParam TResult - Type of final result
 */
export interface StreamCallbacks<TChunk, TResult> {
  /** Called when streaming starts */
  onStart?: () => void;

  /** Called for each chunk */
  onChunk?: StreamChunkCallback<TChunk>;

  /** Called on error */
  onError?: StreamErrorCallback;

  /** Called on completion */
  onComplete?: StreamCompleteCallback<TResult>;
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Check if an object is a streamable.
 */
export function isStreamable<TChunk, TResult>(
  obj: unknown
): obj is IStreamable<TChunk, TResult> {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'stream' in obj &&
    'result' in obj &&
    typeof (obj as IStreamable<TChunk, TResult>).abort === 'function'
  );
}

/**
 * Check if an object is an enhanced streamable.
 */
export function isStreamableEnhanced<TChunk, TResult>(
  obj: unknown
): obj is IStreamableEnhanced<TChunk, TResult> {
  return (
    isStreamable(obj) &&
    typeof (obj as IStreamableEnhanced<TChunk, TResult>).abortAsync === 'function' &&
    'isActive' in obj &&
    'bufferSize' in obj
  );
}
