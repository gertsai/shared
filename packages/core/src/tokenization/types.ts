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
export type TokenizerProvider =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'deepseek'
  | 'mistral'
  | 'llama'
  | 'xai'
  | 'estimation';

/**
 * Tokenizer encoding type.
 * Maps to tiktoken/gpt-tokenizer encoding names.
 */
export type TokenizerEncoding =
  | 'cl100k_base' // GPT-4, GPT-3.5-turbo
  | 'o200k_base' // GPT-4o, o1
  | 'p50k_base' // text-davinci-003
  | 'p50k_edit' // text-davinci-edit-001
  | 'r50k_base' // GPT-3
  | 'gpt2'; // GPT-2

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
export const PROVIDER_TOKEN_MULTIPLIERS: Record<TokenizerProvider, number> = {
  openai: 1.0,
  anthropic: 1.25, // Claude uses more tokens
  google: 1.1, // Gemini slightly more
  deepseek: 1.0, // DeepSeek similar to OpenAI
  mistral: 1.05, // Mistral slightly more
  llama: 0.95, // Llama often fewer (smaller vocab)
  xai: 1.0, // Grok similar to OpenAI
  estimation: 1.0, // Base estimation
};

/**
 * Model to encoding mapping.
 */
export const MODEL_ENCODINGS: Record<string, TokenizerEncoding> = {
  // GPT-4o family
  'gpt-4o': 'o200k_base',
  'gpt-4o-mini': 'o200k_base',

  // o1/o3 reasoning models
  o1: 'o200k_base',
  'o1-mini': 'o200k_base',
  'o1-preview': 'o200k_base',
  o3: 'o200k_base',
  'o3-mini': 'o200k_base',

  // GPT-4 family
  'gpt-4': 'cl100k_base',
  'gpt-4-turbo': 'cl100k_base',
  'gpt-4-32k': 'cl100k_base',

  // GPT-3.5 family
  'gpt-3.5-turbo': 'cl100k_base',

  // Legacy
  'text-davinci-003': 'p50k_base',
  'text-davinci-002': 'p50k_base',
  davinci: 'r50k_base',
  curie: 'r50k_base',
  babbage: 'r50k_base',
  ada: 'r50k_base',
};

/**
 * Get encoding for a model.
 *
 * @param model - Model name
 * @returns Encoding name or undefined
 */
export function getEncodingForModel(model: string): TokenizerEncoding | undefined {
  // Direct lookup
  if (model in MODEL_ENCODINGS) {
    return MODEL_ENCODINGS[model];
  }

  // Prefix matching
  const modelLower = model.toLowerCase();

  if (modelLower.startsWith('gpt-4o') || modelLower.startsWith('o1') || modelLower.startsWith('o3')) {
    return 'o200k_base';
  }

  if (modelLower.startsWith('gpt-4') || modelLower.startsWith('gpt-3.5')) {
    return 'cl100k_base';
  }

  return undefined;
}

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
export const DEFAULT_TOKENIZER_FACTORY_CONFIG: Required<TokenizerFactoryConfig> = {
  enableCache: true,
  cacheMaxSize: 1000,
  cacheTTL: 5 * 60 * 1000, // 5 minutes
  defaultProvider: 'estimation',
};
