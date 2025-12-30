/**
 * @gerts/core - Streaming Interfaces
 *
 * Core streaming abstractions for async operations.
 * Used by Graph RAG, LLM providers, and other async operations.
 */
/**
 * Default streaming configuration.
 */
export const DEFAULT_STREAMING_CONFIG = {
    maxBufferSize: 100,
    chunkTimeout: 30000,
    swallowCallbackErrors: true,
    onCallbackError: (error, name) => {
        console.warn(`Callback ${name} threw an error:`, error.message);
    },
};
// ============================================================================
// Type Guards
// ============================================================================
/**
 * Check if an object is a streamable.
 */
export function isStreamable(obj) {
    return (typeof obj === 'object' &&
        obj !== null &&
        'stream' in obj &&
        'result' in obj &&
        typeof obj.abort === 'function');
}
/**
 * Check if an object is an enhanced streamable.
 */
export function isStreamableEnhanced(obj) {
    return (isStreamable(obj) &&
        typeof obj.abortAsync === 'function' &&
        'isActive' in obj &&
        'bufferSize' in obj);
}
