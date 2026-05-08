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
export class SimpleTokenizer implements ITokenizer {
  /**
   * Encode text into token IDs using a simple 4-char-per-token heuristic.
   * @param text - Text to tokenize
   * @returns Array of sequential token IDs
   */
  encode(text: string): number[] {
    // Rough approximation: 1 token ≈ 4 characters
    const tokenCount = Math.ceil(text.length / 4);
    return Array.from({ length: tokenCount }, (_, i) => i);
  }

  /**
   * Decode tokens back into text.
   * Note: This is a stub implementation. In production, use a real tokenizer.
   * @param tokens - Array of token IDs
   * @returns Empty string (stub implementation)
   */
  decode(_tokens: number[]): string {
    // This is a stub - in production use tiktoken or similar
    return '';
  }
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
export class TokenTextSplitter extends BaseTextSplitter {
  private readonly tokenizer: ITokenizer;

  constructor(options: TokenTextSplitterOptions) {
    // Convert token counts to approximate char counts for base class
    const charsPerToken = 4;
    const { tokensPerChunk, tokenOverlap, tokenizer, ...baseOptions } = options;

    super({
      ...baseOptions,
      chunkSize: (tokensPerChunk ?? options.chunkSize) * charsPerToken,
      chunkOverlap: (tokenOverlap ?? options.chunkOverlap ?? 0) * charsPerToken,
      chunkMethod: 'token',
    });
    this.tokenizer = tokenizer ?? new SimpleTokenizer();
  }

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
  splitText(text: string): string[] {
    // SEC-003: Use safe linear-time sentence splitting
    // instead of regex with lookbehind /(?<=[.!?])\s+/ which can cause ReDoS
    const splits = this.splitBySentences(text);
    return this.mergeSplits(splits, ' ');
  }

  /**
   * SEC-003: Safe O(n) sentence splitting without regex.
   * Splits text at sentence boundaries (. ! ?) followed by whitespace.
   * This is a linear-time alternative to the regex /(?<=[.!?])\s+/.
   *
   * @param text - Text to split
   * @returns Array of sentences
   */
  private splitBySentences(text: string): string[] {
    const sentences: string[] = [];
    let currentSentence = '';
    const sentenceEnders = new Set(['.', '!', '?']);

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      currentSentence += char;

      // Check if this is a sentence ending followed by whitespace
      if (sentenceEnders.has(char)) {
        // Look ahead for whitespace
        const nextChar = text[i + 1];
        if (nextChar && /\s/.test(nextChar)) {
          // Found sentence boundary - push current and start new
          sentences.push(currentSentence.trim());
          currentSentence = '';

          // Skip leading whitespace for next sentence
          while (i + 1 < text.length && /\s/.test(text[i + 1])) {
            i++;
          }
        }
      }
    }

    // Don't forget the last sentence
    if (currentSentence.trim()) {
      sentences.push(currentSentence.trim());
    }

    return sentences.filter((s) => s.length > 0);
  }
}
