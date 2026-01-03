"use strict";
/**
 * @gerts/core - Streaming Interfaces
 *
 * Core streaming abstractions for async operations.
 * Used by Graph RAG, LLM providers, and other async operations.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_STREAMING_CONFIG = void 0;
exports.isStreamable = isStreamable;
exports.isStreamableEnhanced = isStreamableEnhanced;
/**
 * Default streaming configuration.
 */
exports.DEFAULT_STREAMING_CONFIG = {
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
function isStreamable(obj) {
    return (typeof obj === 'object' &&
        obj !== null &&
        'stream' in obj &&
        'result' in obj &&
        typeof obj.abort === 'function');
}
/**
 * Check if an object is an enhanced streamable.
 */
function isStreamableEnhanced(obj) {
    return (isStreamable(obj) &&
        typeof obj.abortAsync === 'function' &&
        'isActive' in obj &&
        'bufferSize' in obj);
}
//# sourceMappingURL=types.js.map