/**
 * @gerts/core - Cached Tokenizer
 *
 * LRU cache wrapper for tokenizers.
 * Caches token counts by text hash to avoid repeated computation.
 *
 * Especially useful for:
 * - API-based tokenizers (Anthropic, Google) - avoids API calls
 * - Repeated text (prompts, templates) - fast lookup
 * - High-frequency counting (memory budgeting) - reduced latency
 */
import { type IUniversalTokenizer, type TokenizerProvider, type TokenizerEncoding, type TokenCountResult } from '../types.js';
/**
 * Configuration for CachedTokenizer.
 */
export interface CachedTokenizerConfig {
    /** Maximum cache size (default: 1000) */
    maxSize?: number;
    /** Cache TTL in milliseconds (default: 5 minutes) */
    ttlMs?: number;
}
/**
 * Default cache configuration.
 */
export declare const DEFAULT_CACHE_CONFIG: Required<CachedTokenizerConfig>;
/**
 * CachedTokenizer - LRU cache wrapper for tokenizers.
 *
 * Wraps any IUniversalTokenizer with caching layer.
 * Uses MD5-like hash of text as cache key for O(1) lookup.
 *
 * @example
 * ```typescript
 * const baseTokenizer = new TiktokenTokenizer('gpt-4o');
 * const cachedTokenizer = new CachedTokenizer(baseTokenizer, { maxSize: 500 });
 *
 * // First call - computes and caches
 * const result1 = await cachedTokenizer.countTokens('Hello, world!');
 *
 * // Second call - returns from cache
 * const result2 = await cachedTokenizer.countTokens('Hello, world!');
 * console.log(result2.cached); // true
 * ```
 */
export declare class CachedTokenizer implements IUniversalTokenizer {
    private readonly inner;
    private readonly cache;
    private hits;
    private misses;
    constructor(inner: IUniversalTokenizer, config?: CachedTokenizerConfig);
    /** Provider from wrapped tokenizer */
    get provider(): TokenizerProvider;
    /** Encoding from wrapped tokenizer */
    get encoding(): TokenizerEncoding | undefined;
    /** Exactness from wrapped tokenizer */
    get isExact(): boolean;
    /**
     * Count tokens with caching.
     * Returns cached result if available, otherwise computes and caches.
     */
    countTokens(text: string): Promise<TokenCountResult>;
    /**
     * Encode text (delegates to inner tokenizer).
     */
    encode(text: string): number[];
    /**
     * Decode tokens (delegates to inner tokenizer).
     */
    decode(tokens: number[]): string;
    /**
     * Check if tokenizer supports a model.
     */
    supportsModel(model: string): boolean;
    /**
     * Dispose inner tokenizer and clear cache.
     */
    dispose(): void;
    /**
     * Get cache statistics.
     */
    getStats(): {
        hits: number;
        misses: number;
        hitRate: number;
        size: number;
        maxSize: number;
    };
    /**
     * Clear cache.
     */
    clearCache(): void;
    /**
     * Invalidate cache entries matching pattern.
     */
    invalidatePattern(pattern: RegExp): number;
    /**
     * Hash text for cache key.
     * Uses simple but fast hash function.
     */
    private hashText;
}
/**
 * Wrap a tokenizer with caching.
 *
 * @param tokenizer - Tokenizer to wrap
 * @param config - Cache configuration
 * @returns Cached tokenizer
 */
export declare function withCache(tokenizer: IUniversalTokenizer, config?: CachedTokenizerConfig): CachedTokenizer;
//# sourceMappingURL=cached.d.ts.map