/**
 * @gerts/core - Tokenizer Factory
 *
 * Central factory for creating tokenizers.
 * Auto-detects provider from model name and returns appropriate tokenizer.
 *
 * Features:
 * - Model-aware tokenizer selection
 * - Singleton management for efficiency
 * - Optional caching layer
 * - Provider-specific fallbacks
 *
 * @example
 * ```typescript
 * // Auto-detect tokenizer for model
 * const tokenizer = TokenizerFactory.forModel('gpt-4o');
 * const result = await tokenizer.countTokens('Hello, world!');
 *
 * // Get cached tokenizer (singleton)
 * const cached = TokenizerFactory.getCached('claude-3-5-sonnet');
 *
 * // Quick token counting
 * const count = await TokenizerFactory.countTokens('Hello!', 'gpt-4o');
 * ```
 */
import { type IUniversalTokenizer, type TokenizerProvider, type TokenCountResult, type TokenizerFactoryConfig } from './types.js';
import { TiktokenTokenizer } from './tokenizers/tiktoken.js';
import { EstimationTokenizer } from './tokenizers/estimation.js';
import { CachedTokenizer } from './tokenizers/cached.js';
/**
 * TokenizerFactory - create tokenizers for any model.
 *
 * Auto-detects provider and returns appropriate tokenizer:
 * - OpenAI models → TiktokenTokenizer (exact)
 * - Claude/Gemini models → EstimationTokenizer (with multiplier)
 * - Unknown models → EstimationTokenizer (base)
 *
 * All tokenizers can be wrapped with caching for performance.
 */
export declare class TokenizerFactory {
    private static instances;
    private static cachedInstances;
    private static config;
    /**
     * Configure the factory.
     *
     * @param config - Factory configuration
     */
    static configure(config: Partial<TokenizerFactoryConfig>): void;
    /**
     * Get tokenizer for a model.
     * Auto-detects provider and returns appropriate tokenizer.
     *
     * @param model - Model name (e.g., 'gpt-4o', 'claude-3-5-sonnet')
     * @returns Tokenizer instance (not cached)
     */
    static forModel(model: string): IUniversalTokenizer;
    /**
     * Get cached tokenizer for a model.
     * Uses LRU cache wrapper for repeated token counting.
     *
     * @param model - Model name
     * @returns Cached tokenizer instance
     */
    static getCached(model: string): CachedTokenizer;
    /**
     * Quick token counting helper.
     * Creates or reuses tokenizer for model and counts tokens.
     *
     * @param text - Text to count
     * @param model - Model name (default: 'gpt-4o')
     * @returns Token count result
     */
    static countTokens(text: string, model?: string): Promise<TokenCountResult>;
    /**
     * Quick token count helper (returns number only).
     *
     * @param text - Text to count
     * @param model - Model name (default: 'gpt-4o')
     * @returns Token count
     */
    static count(text: string, model?: string): Promise<number>;
    /**
     * Get tokenizer for a specific provider.
     *
     * @param provider - Provider name
     * @returns Provider-specific tokenizer
     */
    static forProvider(provider: TokenizerProvider): IUniversalTokenizer;
    /**
     * Create OpenAI-compatible tokenizer.
     * Uses TiktokenTokenizer with specified encoding.
     *
     * @param model - Model name (default: 'gpt-4o')
     * @returns TiktokenTokenizer
     */
    static openai(model?: string): TiktokenTokenizer;
    /**
     * Create Anthropic estimation tokenizer.
     * Uses 1.25x multiplier for Claude models.
     *
     * @param model - Model name (default: 'claude-3-5-sonnet')
     * @returns EstimationTokenizer
     */
    static anthropic(model?: string): EstimationTokenizer;
    /**
     * Create Google estimation tokenizer.
     * Uses 1.1x multiplier for Gemini models.
     *
     * @param model - Model name (default: 'gemini-1.5-pro')
     * @returns EstimationTokenizer
     */
    static google(model?: string): EstimationTokenizer;
    /**
     * Create estimation tokenizer with custom multiplier.
     *
     * @param multiplier - Custom multiplier (default: 1.0)
     * @returns EstimationTokenizer
     */
    static estimation(multiplier?: number): EstimationTokenizer;
    /**
     * Clear all cached instances.
     * Useful for testing or memory management.
     */
    static clearAll(): void;
    /**
     * Get cache statistics for a model.
     *
     * @param model - Model name
     * @returns Cache stats or undefined if not cached
     */
    static getCacheStats(model: string): {
        hits: number;
        misses: number;
        hitRate: number;
        size: number;
    } | undefined;
    /**
     * Create tokenizer based on model detection.
     */
    private static createTokenizer;
}
/**
 * Convenience function to count tokens.
 *
 * @param text - Text to count
 * @param model - Model name (default: 'gpt-4o')
 * @returns Token count
 */
export declare function countTokens(text: string, model?: string): Promise<number>;
/**
 * Convenience function to get tokenizer for model.
 *
 * @param model - Model name
 * @returns Tokenizer instance
 */
export declare function getTokenizer(model: string): IUniversalTokenizer;
/**
 * Convenience function to get cached tokenizer.
 *
 * @param model - Model name
 * @returns Cached tokenizer
 */
export declare function getCachedTokenizer(model: string): CachedTokenizer;
//# sourceMappingURL=factory.d.ts.map