/**
 * @gerts/core - Tiktoken Tokenizer
 *
 * Exact token counting using gpt-tokenizer.
 * Supports GPT-4, GPT-4o, o1, and GPT-3.5 models.
 *
 * Uses gpt-tokenizer which is a fast pure-JS implementation
 * of OpenAI's tiktoken tokenizer.
 */
import { type IUniversalTokenizer, type TokenizerProvider, type TokenizerEncoding, type TokenCountResult } from '../types.js';
/**
 * TiktokenTokenizer - exact token counting for OpenAI models.
 *
 * Uses gpt-tokenizer for accurate counting matching OpenAI's tokenizer.
 * Supports multiple encodings: cl100k_base, o200k_base, p50k_base, etc.
 *
 * @example
 * ```typescript
 * const tokenizer = new TiktokenTokenizer('gpt-4o');
 * const result = await tokenizer.countTokens('Hello, world!');
 * console.log(result); // { count: 4, method: 'exact', provider: 'openai' }
 * ```
 */
export declare class TiktokenTokenizer implements IUniversalTokenizer {
    readonly provider: TokenizerProvider;
    readonly isExact = true;
    readonly encoding: TokenizerEncoding;
    private model;
    private encoderPromise;
    constructor(model?: string);
    /**
     * Get encoder (lazy initialization).
     */
    private getEncoder;
    /**
     * Count tokens in text.
     */
    countTokens(text: string): Promise<TokenCountResult>;
    /**
     * Encode text to tokens (sync version for compatibility).
     * Note: Uses cached encoder, may throw if not initialized.
     */
    encode(text: string): number[];
    /**
     * Decode tokens to text (sync version for compatibility).
     */
    decode(tokens: number[]): string;
    /**
     * Check if tokenizer supports a model.
     */
    supportsModel(model: string): boolean;
    /**
     * No-op for this tokenizer (no native resources).
     */
    dispose(): void;
}
/**
 * Create a tiktoken tokenizer for a model.
 *
 * @param model - Model name (e.g., 'gpt-4o', 'gpt-3.5-turbo')
 * @returns TiktokenTokenizer instance
 */
export declare function createTiktokenTokenizer(model?: string): TiktokenTokenizer;
