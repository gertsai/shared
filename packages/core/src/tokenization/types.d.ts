/**
 * @gerts/core - Tokenization Types
 *
 * Universal tokenization interface for multi-model support.
 * Works with OpenAI, Anthropic, Google, and other LLM providers.
 *
 * Design principles:
 * - Async-first (supports API-based tokenizers)
 * - Provider-aware (different tokenizers for different models)
 * - Cacheable (expensive operations are cached)
 * - Extensible (easy to add new providers)
 */
/**
 * Supported tokenizer providers.
 */
export type TokenizerProvider = 'openai' | 'anthropic' | 'google' | 'deepseek' | 'mistral' | 'llama' | 'xai' | 'estimation';
/**
 * Tokenizer encoding type.
 * Maps to tiktoken/gpt-tokenizer encoding names.
 */
export type TokenizerEncoding = 'cl100k_base' | 'o200k_base' | 'p50k_base' | 'p50k_edit' | 'r50k_base' | 'gpt2';
/**
 * Token count result with metadata.
 */
export interface TokenCountResult {
    /** Number of tokens */
    count: number;
    /** Counting method */
    method: 'exact' | 'estimated';
    /** Provider used */
    provider: TokenizerProvider;
    /** Model used (if applicable) */
    model?: string;
    /** Encoding used (if applicable) */
    encoding?: TokenizerEncoding;
    /** Whether result was cached */
    cached?: boolean;
}
/**
 * Universal Tokenizer interface.
 *
 * Supports both sync and async operations:
 * - Sync encode/decode for local tokenizers (tiktoken, gpt-tokenizer)
 * - Async countTokens for API-based tokenizers (Anthropic, Google)
 *
 * @example
 * ```typescript
 * const tokenizer = TokenizerFactory.forModel('gpt-4o');
 * const result = await tokenizer.countTokens('Hello, world!');
 * console.log(result.count); // 4
 * ```
 */
export interface IUniversalTokenizer {
    /** Provider name */
    readonly provider: TokenizerProvider;
    /** Encoding name (if applicable) */
    readonly encoding?: TokenizerEncoding;
    /** Whether counting is exact (local) or estimated (API/heuristic) */
    readonly isExact: boolean;
    /**
     * Count tokens in text.
     * Async to support API-based tokenizers.
     *
     * @param text - Text to tokenize
     * @returns Token count result with metadata
     */
    countTokens(text: string): Promise<TokenCountResult>;
    /**
     * Encode text into token IDs.
     * Only available for local tokenizers.
     *
     * @param text - Text to encode
     * @returns Array of token IDs or undefined if not supported
     */
    encode?(text: string): number[];
    /**
     * Decode token IDs back to text.
     * Only available for local tokenizers.
     *
     * @param tokens - Array of token IDs
     * @returns Decoded text or undefined if not supported
     */
    decode?(tokens: number[]): string;
    /**
     * Check if tokenizer supports a specific model.
     *
     * @param model - Model name
     * @returns true if tokenizer supports the model
     */
    supportsModel(model: string): boolean;
    /**
     * Free native resources (if applicable).
     * Call when tokenizer is no longer needed.
     */
    dispose?(): void;
}
/**
 * Configuration for estimation-based tokenizer.
 */
export interface EstimationConfig {
    /** Base characters per token (default: 4) */
    charsPerToken?: number;
    /** Provider-specific multiplier (default: 1.0) */
    multiplier?: number;
    /** Model name for tracking */
    model?: string;
}
/**
 * Provider-specific token multipliers.
 * Based on empirical testing comparing to GPT-4 tokenizer.
 *
 * Claude uses ~20-30% more tokens than GPT for same text.
 * Gemini uses ~10% more tokens.
 */
export declare const PROVIDER_TOKEN_MULTIPLIERS: Record<TokenizerProvider, number>;
/**
 * Model to encoding mapping.
 */
export declare const MODEL_ENCODINGS: Record<string, TokenizerEncoding>;
/**
 * Get encoding for a model.
 *
 * @param model - Model name
 * @returns Encoding name or undefined
 */
export declare function getEncodingForModel(model: string): TokenizerEncoding | undefined;
/**
 * TokenizerFactory configuration.
 */
export interface TokenizerFactoryConfig {
    /** Enable caching (default: true) */
    enableCache?: boolean;
    /** Cache max size (default: 1000) */
    cacheMaxSize?: number;
    /** Cache TTL in milliseconds (default: 5 minutes) */
    cacheTTL?: number;
    /** Default provider for unknown models */
    defaultProvider?: TokenizerProvider;
}
/**
 * Default factory configuration.
 */
export declare const DEFAULT_TOKENIZER_FACTORY_CONFIG: Required<TokenizerFactoryConfig>;
