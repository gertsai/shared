/**
 * @gertsai/core - Tokenization Module
 *
 * Universal tokenization system for multi-model support.
 *
 * Features:
 * - Model-aware tokenizer selection
 * - Provider-specific multipliers (Claude, Gemini, etc.)
 * - LRU cache for performance
 * - Exact counting for OpenAI models (gpt-tokenizer)
 * - Estimation fallback for other providers
 *
 * @example
 * ```typescript
 * import { TokenizerFactory, countTokens } from '@gertsai/core';
 *
 * // Quick counting
 * const count = await countTokens('Hello, world!', 'gpt-4o');
 *
 * // With factory
 * const tokenizer = TokenizerFactory.forModel('claude-3-5-sonnet');
 * const result = await tokenizer.countTokens('Hello, world!');
 *
 * // With caching
 * const cached = TokenizerFactory.getCached('gpt-4o');
 * await cached.countTokens('Repeated text...');
 * console.log(cached.getStats().hitRate);
 * ```
 */

// Types
export {
  type TokenizerProvider,
  type TokenizerEncoding,
  type TokenCountResult,
  type IUniversalTokenizer,
  type EstimationConfig,
  type TokenizerFactoryConfig,
  PROVIDER_TOKEN_MULTIPLIERS,
  MODEL_ENCODINGS,
  DEFAULT_TOKENIZER_FACTORY_CONFIG,
  getEncodingForModel,
} from './types.js';

// Tokenizers
export {
  TiktokenTokenizer,
  createTiktokenTokenizer,
} from './tokenizers/tiktoken.js';

export {
  EstimationTokenizer,
  createEstimationTokenizer,
  createProviderTokenizer,
  DEFAULT_ESTIMATION_CONFIG,
} from './tokenizers/estimation.js';

export {
  CachedTokenizer,
  withCache,
  type CachedTokenizerConfig,
  DEFAULT_CACHE_CONFIG,
} from './tokenizers/cached.js';

// Factory (main entry point)
export {
  TokenizerFactory,
  countTokens,
  getTokenizer,
  getCachedTokenizer,
} from './factory.js';
