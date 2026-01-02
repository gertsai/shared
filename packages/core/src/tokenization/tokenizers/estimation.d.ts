/**
 * @gerts/core - Estimation Tokenizer
 *
 * Heuristic-based token estimation for models without local tokenizers.
 * Uses provider-specific multipliers to approximate token counts.
 *
 * Based on empirical testing:
 * - Claude uses ~20-30% more tokens than GPT for same text
 * - Gemini uses ~10% more tokens
 * - Llama often uses fewer tokens (smaller vocabulary)
 */
import { type IUniversalTokenizer, type TokenizerProvider, type TokenCountResult, type EstimationConfig } from '../types.js';
/**
 * Default estimation configuration.
 */
export declare const DEFAULT_ESTIMATION_CONFIG: {
    readonly charsPerToken: 4;
    readonly model: "unknown";
};
/**
 * EstimationTokenizer - heuristic-based token estimation.
 *
 * Uses character count and provider-specific multipliers for estimation.
 * Useful for models without local tokenizers (Claude, Gemini, etc.).
 *
 * @example
 * ```typescript
 * // For Claude (uses 1.25x multiplier)
 * const tokenizer = new EstimationTokenizer({ model: 'claude-3-5-sonnet' });
 * const result = await tokenizer.countTokens('Hello, world!');
 * console.log(result); // { count: ~5, method: 'estimated', provider: 'anthropic' }
 * ```
 */
export declare class EstimationTokenizer implements IUniversalTokenizer {
    readonly provider: TokenizerProvider;
    readonly isExact = false;
    private charsPerToken;
    private multiplier;
    private model;
    constructor(config?: EstimationConfig);
    /**
     * Count tokens using heuristic estimation.
     *
     * Formula: ceil(length / charsPerToken * multiplier)
     */
    countTokens(text: string): Promise<TokenCountResult>;
    /**
     * Encode text to pseudo-tokens (estimation only).
     * Returns array of sequential IDs matching estimated count.
     */
    encode(text: string): number[];
    /**
     * Decode is not supported for estimation.
     */
    decode(_tokens: number[]): string;
    /**
     * Estimation tokenizer supports all models (fallback).
     */
    supportsModel(_model: string): boolean;
    /**
     * Get current multiplier.
     */
    getMultiplier(): number;
    /**
     * Set custom multiplier.
     */
    setMultiplier(multiplier: number): void;
}
/**
 * Create an estimation tokenizer for a model.
 *
 * @param model - Model name (e.g., 'claude-3-5-sonnet', 'gemini-1.5-pro')
 * @returns EstimationTokenizer with provider-specific multiplier
 */
export declare function createEstimationTokenizer(model?: string): EstimationTokenizer;
/**
 * Create an estimation tokenizer for a specific provider.
 *
 * @param provider - Provider name
 * @returns EstimationTokenizer with provider-specific multiplier
 */
export declare function createProviderTokenizer(provider: TokenizerProvider): EstimationTokenizer;
