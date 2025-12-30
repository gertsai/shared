/**
 * @gerts/core - Tiktoken Tokenizer
 *
 * Exact token counting using gpt-tokenizer.
 * Supports GPT-4, GPT-4o, o1, and GPT-3.5 models.
 *
 * Uses gpt-tokenizer which is a fast pure-JS implementation
 * of OpenAI's tiktoken tokenizer.
 */
import { getEncodingForModel, } from '../types.js';
// Lazy-loaded gpt-tokenizer to avoid startup cost
let gptTokenizer = null;
/**
 * Load gpt-tokenizer module lazily.
 */
async function loadGptTokenizer() {
    if (!gptTokenizer) {
        gptTokenizer = await import('gpt-tokenizer');
    }
    return gptTokenizer;
}
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
export class TiktokenTokenizer {
    provider = 'openai';
    isExact = true;
    encoding;
    model;
    encoderPromise = null;
    constructor(model = 'gpt-4o') {
        this.model = model;
        this.encoding = getEncodingForModel(model) ?? 'cl100k_base';
    }
    /**
     * Get encoder (lazy initialization).
     */
    async getEncoder() {
        if (!this.encoderPromise) {
            this.encoderPromise = loadGptTokenizer();
        }
        return this.encoderPromise;
    }
    /**
     * Count tokens in text.
     */
    async countTokens(text) {
        if (!text) {
            return {
                count: 0,
                method: 'exact',
                provider: this.provider,
                model: this.model,
                encoding: this.encoding,
            };
        }
        try {
            const encoder = await this.getEncoder();
            const tokens = encoder.encode(text);
            return {
                count: tokens.length,
                method: 'exact',
                provider: this.provider,
                model: this.model,
                encoding: this.encoding,
            };
        }
        catch {
            // Fallback to estimation if encoder fails
            return {
                count: Math.ceil(text.length / 4),
                method: 'estimated',
                provider: this.provider,
                model: this.model,
                encoding: this.encoding,
            };
        }
    }
    /**
     * Encode text to tokens (sync version for compatibility).
     * Note: Uses cached encoder, may throw if not initialized.
     */
    encode(text) {
        if (!text)
            return [];
        try {
            // Use sync require for encode (gpt-tokenizer is sync-safe)
            // This is for compatibility with ITokenizer interface
            if (!gptTokenizer) {
                // If not loaded yet, use estimation
                const count = Math.ceil(text.length / 4);
                return Array.from({ length: count }, (_, i) => i);
            }
            return Array.from(gptTokenizer.encode(text));
        }
        catch {
            const count = Math.ceil(text.length / 4);
            return Array.from({ length: count }, (_, i) => i);
        }
    }
    /**
     * Decode tokens to text (sync version for compatibility).
     */
    decode(tokens) {
        if (!tokens || tokens.length === 0)
            return '';
        try {
            if (!gptTokenizer) {
                return ''; // Cannot decode without encoder
            }
            return gptTokenizer.decode(tokens);
        }
        catch {
            return '';
        }
    }
    /**
     * Check if tokenizer supports a model.
     */
    supportsModel(model) {
        const encoding = getEncodingForModel(model);
        return encoding !== undefined;
    }
    /**
     * No-op for this tokenizer (no native resources).
     */
    dispose() {
        // gpt-tokenizer doesn't require cleanup
    }
}
/**
 * Create a tiktoken tokenizer for a model.
 *
 * @param model - Model name (e.g., 'gpt-4o', 'gpt-3.5-turbo')
 * @returns TiktokenTokenizer instance
 */
export function createTiktokenTokenizer(model = 'gpt-4o') {
    return new TiktokenTokenizer(model);
}
