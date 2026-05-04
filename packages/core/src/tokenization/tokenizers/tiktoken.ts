/**
 * @gertsai/core - Tiktoken Tokenizer
 *
 * Exact token counting using gpt-tokenizer.
 * Supports GPT-4, GPT-4o, o1, and GPT-3.5 models.
 *
 * Uses gpt-tokenizer which is a fast pure-JS implementation
 * of OpenAI's tiktoken tokenizer.
 */

import {
  type IUniversalTokenizer,
  type TokenizerProvider,
  type TokenizerEncoding,
  type TokenCountResult,
  getEncodingForModel,
} from '../types.js';

// Lazy-loaded gpt-tokenizer to avoid startup cost
let gptTokenizer: typeof import('gpt-tokenizer') | null = null;

/**
 * Load gpt-tokenizer module lazily.
 */
async function loadGptTokenizer(): Promise<typeof import('gpt-tokenizer')> {
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
export class TiktokenTokenizer implements IUniversalTokenizer {
  readonly provider: TokenizerProvider = 'openai';
  readonly isExact = true;
  readonly encoding: TokenizerEncoding;

  private model: string;
  private encoderPromise: Promise<typeof import('gpt-tokenizer')> | null = null;

  constructor(model: string = 'gpt-4o') {
    this.model = model;
    this.encoding = getEncodingForModel(model) ?? 'cl100k_base';
  }

  /**
   * Get encoder (lazy initialization).
   */
  private async getEncoder(): Promise<typeof import('gpt-tokenizer')> {
    if (!this.encoderPromise) {
      this.encoderPromise = loadGptTokenizer();
    }
    return this.encoderPromise;
  }

  /**
   * Count tokens in text.
   */
  async countTokens(text: string): Promise<TokenCountResult> {
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
    } catch {
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
  encode(text: string): number[] {
    if (!text) return [];

    try {
      // Use sync require for encode (gpt-tokenizer is sync-safe)
      // This is for compatibility with ITokenizer interface
      if (!gptTokenizer) {
        // If not loaded yet, use estimation
        const count = Math.ceil(text.length / 4);
        return Array.from({ length: count }, (_, i) => i);
      }
      return Array.from(gptTokenizer.encode(text));
    } catch {
      const count = Math.ceil(text.length / 4);
      return Array.from({ length: count }, (_, i) => i);
    }
  }

  /**
   * Decode tokens to text (sync version for compatibility).
   */
  decode(tokens: number[]): string {
    if (!tokens || tokens.length === 0) return '';

    try {
      if (!gptTokenizer) {
        return ''; // Cannot decode without encoder
      }
      return gptTokenizer.decode(tokens);
    } catch {
      return '';
    }
  }

  /**
   * Check if tokenizer supports a model.
   */
  supportsModel(model: string): boolean {
    const encoding = getEncodingForModel(model);
    return encoding !== undefined;
  }

  /**
   * No-op for this tokenizer (no native resources).
   */
  dispose(): void {
    // gpt-tokenizer doesn't require cleanup
  }
}

/**
 * Create a tiktoken tokenizer for a model.
 *
 * @param model - Model name (e.g., 'gpt-4o', 'gpt-3.5-turbo')
 * @returns TiktokenTokenizer instance
 */
export function createTiktokenTokenizer(model: string = 'gpt-4o'): TiktokenTokenizer {
  return new TiktokenTokenizer(model);
}
