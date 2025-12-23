import { BaseTextSplitter, type TextSplitterOptions } from './base';
/**
 * Interface for tokenizers used by TokenTextSplitter.
 * Allows for pluggable tokenization strategies (e.g., tiktoken, custom tokenizers).
 */
export interface ITokenizer {
    /**
     * Encode text into tokens.
     * @param text - Text to tokenize
     * @returns Array of token IDs
     */
    encode(text: string): number[];
    /**
     * Decode tokens back into text.
     * @param tokens - Array of token IDs
     * @returns Decoded text
     */
    decode(tokens: number[]): string;
}
/**
 * Simple stub tokenizer that estimates ~4 characters per token.
 * This is a rough approximation for development/testing.
 * In production, replace with tiktoken or another proper tokenizer.
 */
export declare class SimpleTokenizer implements ITokenizer {
    /**
     * Encode text into token IDs using a simple 4-char-per-token heuristic.
     * @param text - Text to tokenize
     * @returns Array of sequential token IDs
     */
    encode(text: string): number[];
    /**
     * Decode tokens back into text.
     * Note: This is a stub implementation. In production, use a real tokenizer.
     * @param tokens - Array of token IDs
     * @returns Empty string (stub implementation)
     */
    decode(tokens: number[]): string;
}
/**
 * Options for TokenTextSplitter.
 */
export interface TokenTextSplitterOptions extends TextSplitterOptions {
    /**
     * Tokenizer instance to use for encoding/decoding.
     * Defaults to SimpleTokenizer if not provided.
     */
    tokenizer?: ITokenizer;
    /**
     * Number of tokens per chunk.
     * If provided, overrides chunkSize.
     */
    tokensPerChunk?: number;
    /**
     * Number of tokens to overlap between chunks.
     * If provided, overrides chunkOverlap.
     */
    tokenOverlap?: number;
}
/**
 * Text splitter that splits based on token count rather than character count.
 * Useful for LLM context window management where token limits are critical.
 *
 * @example
 * ```typescript
 * const splitter = new TokenTextSplitter({
 *   tokensPerChunk: 512,
 *   tokenOverlap: 50
 * });
 * const chunks = splitter.splitText(longText);
 * ```
 */
export declare class TokenTextSplitter extends BaseTextSplitter {
    private readonly tokenizer;
    constructor(options: TokenTextSplitterOptions);
    /**
     * Split text into chunks based on token count.
     * First splits by sentence boundaries, then merges based on token limits.
     *
     * SEC-003: Uses safe linear-time sentence splitting instead of regex lookbehind
     * to prevent ReDoS attacks.
     *
     * @param text - Text to split
     * @returns Array of text chunks
     */
    splitText(text: string): string[];
    /**
     * SEC-003: Safe O(n) sentence splitting without regex.
     * Splits text at sentence boundaries (. ! ?) followed by whitespace.
     * This is a linear-time alternative to the regex /(?<=[.!?])\s+/.
     *
     * @param text - Text to split
     * @returns Array of sentences
     */
    private splitBySentences;
}
//# sourceMappingURL=token.d.ts.map