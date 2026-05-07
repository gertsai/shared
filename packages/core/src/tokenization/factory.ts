/**
 * @gertsai/core - Tokenizer Factory
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

import {
  type IUniversalTokenizer,
  type TokenizerProvider,
  type TokenCountResult,
  type TokenizerFactoryConfig,
  DEFAULT_TOKENIZER_FACTORY_CONFIG,
  getEncodingForModel,
} from './types.js';
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
export class TokenizerFactory {
  private static instances = new Map<string, IUniversalTokenizer>();
  private static cachedInstances = new Map<string, CachedTokenizer>();
  private static config: Required<TokenizerFactoryConfig> = DEFAULT_TOKENIZER_FACTORY_CONFIG;

  /**
   * Configure the factory.
   *
   * @param config - Factory configuration
   */
  static configure(config: Partial<TokenizerFactoryConfig>): void {
    TokenizerFactory.config = { ...DEFAULT_TOKENIZER_FACTORY_CONFIG, ...config };
  }

  /**
   * Get tokenizer for a model.
   * Auto-detects provider and returns appropriate tokenizer.
   *
   * @param model - Model name (e.g., 'gpt-4o', 'claude-3-5-sonnet')
   * @returns Tokenizer instance (not cached)
   */
  static forModel(model: string): IUniversalTokenizer {
    // Check if we already have an instance
    const existing = TokenizerFactory.instances.get(model);
    if (existing) {
      return existing;
    }

    // Create new tokenizer based on model
    const tokenizer = TokenizerFactory.createTokenizer(model);
    TokenizerFactory.instances.set(model, tokenizer);

    return tokenizer;
  }

  /**
   * Get cached tokenizer for a model.
   * Uses LRU cache wrapper for repeated token counting.
   *
   * @param model - Model name
   * @returns Cached tokenizer instance
   */
  static getCached(model: string): CachedTokenizer {
    const existing = TokenizerFactory.cachedInstances.get(model);
    if (existing) {
      return existing;
    }

    const baseTokenizer = TokenizerFactory.forModel(model);
    const cached = new CachedTokenizer(baseTokenizer, {
      maxSize: TokenizerFactory.config.cacheMaxSize,
      ttlMs: TokenizerFactory.config.cacheTTL,
    });

    TokenizerFactory.cachedInstances.set(model, cached);
    return cached;
  }

  /**
   * Quick token counting helper.
   * Creates or reuses tokenizer for model and counts tokens.
   *
   * @param text - Text to count
   * @param model - Model name (default: 'gpt-4o')
   * @returns Token count result
   */
  static async countTokens(text: string, model: string = 'gpt-4o'): Promise<TokenCountResult> {
    const tokenizer = TokenizerFactory.config.enableCache
      ? TokenizerFactory.getCached(model)
      : TokenizerFactory.forModel(model);

    return tokenizer.countTokens(text);
  }

  /**
   * Quick token count helper (returns number only).
   *
   * @param text - Text to count
   * @param model - Model name (default: 'gpt-4o')
   * @returns Token count
   */
  static async count(text: string, model: string = 'gpt-4o'): Promise<number> {
    const result = await TokenizerFactory.countTokens(text, model);
    return result.count;
  }

  /**
   * Get tokenizer for a specific provider.
   *
   * @param provider - Provider name
   * @returns Provider-specific tokenizer
   */
  static forProvider(provider: TokenizerProvider): IUniversalTokenizer {
    switch (provider) {
      case 'openai':
        return new TiktokenTokenizer('gpt-4o');
      case 'anthropic':
        return new EstimationTokenizer({ model: 'claude-3-5-sonnet', multiplier: 1.25 });
      case 'google':
        return new EstimationTokenizer({ model: 'gemini-1.5-pro', multiplier: 1.1 });
      case 'deepseek':
        return new EstimationTokenizer({ model: 'deepseek-chat', multiplier: 1.0 });
      case 'mistral':
        return new EstimationTokenizer({ model: 'mistral-large', multiplier: 1.05 });
      case 'llama':
        return new EstimationTokenizer({ model: 'llama-3-70b', multiplier: 0.95 });
      case 'xai':
        return new EstimationTokenizer({ model: 'grok-2', multiplier: 1.0 });
      default:
        return new EstimationTokenizer();
    }
  }

  /**
   * Create OpenAI-compatible tokenizer.
   * Uses TiktokenTokenizer with specified encoding.
   *
   * @param model - Model name (default: 'gpt-4o')
   * @returns TiktokenTokenizer
   */
  static openai(model: string = 'gpt-4o'): TiktokenTokenizer {
    return new TiktokenTokenizer(model);
  }

  /**
   * Create Anthropic estimation tokenizer.
   * Uses 1.25x multiplier for Claude models.
   *
   * @param model - Model name (default: 'claude-3-5-sonnet')
   * @returns EstimationTokenizer
   */
  static anthropic(model: string = 'claude-3-5-sonnet'): EstimationTokenizer {
    return new EstimationTokenizer({ model, multiplier: 1.25 });
  }

  /**
   * Create Google estimation tokenizer.
   * Uses 1.1x multiplier for Gemini models.
   *
   * @param model - Model name (default: 'gemini-1.5-pro')
   * @returns EstimationTokenizer
   */
  static google(model: string = 'gemini-1.5-pro'): EstimationTokenizer {
    return new EstimationTokenizer({ model, multiplier: 1.1 });
  }

  /**
   * Create estimation tokenizer with custom multiplier.
   *
   * @param multiplier - Custom multiplier (default: 1.0)
   * @returns EstimationTokenizer
   */
  static estimation(multiplier: number = 1.0): EstimationTokenizer {
    return new EstimationTokenizer({ multiplier });
  }

  /**
   * Clear all cached instances.
   * Useful for testing or memory management.
   */
  static clearAll(): void {
    // Dispose cached tokenizers
    for (const cached of TokenizerFactory.cachedInstances.values()) {
      cached.dispose();
    }

    TokenizerFactory.instances.clear();
    TokenizerFactory.cachedInstances.clear();
  }

  /**
   * Get cache statistics for a model.
   *
   * @param model - Model name
   * @returns Cache stats or undefined if not cached
   */
  static getCacheStats(
    model: string
  ): { hits: number; misses: number; hitRate: number; size: number } | undefined {
    const cached = TokenizerFactory.cachedInstances.get(model);
    if (cached) {
      return cached.getStats();
    }
    return undefined;
  }

  /**
   * Create tokenizer based on model detection.
   */
  private static createTokenizer(model: string): IUniversalTokenizer {
    // Check if model uses OpenAI encoding
    const encoding = getEncodingForModel(model);
    if (encoding) {
      return new TiktokenTokenizer(model);
    }

    // Infer provider and create estimation tokenizer
    return new EstimationTokenizer({ model });
  }
}

/**
 * Convenience function to count tokens.
 *
 * @param text - Text to count
 * @param model - Model name (default: 'gpt-4o')
 * @returns Token count
 */
export async function countTokens(text: string, model?: string): Promise<number> {
  return TokenizerFactory.count(text, model);
}

/**
 * Convenience function to get tokenizer for model.
 *
 * @param model - Model name
 * @returns Tokenizer instance
 */
export function getTokenizer(model: string): IUniversalTokenizer {
  return TokenizerFactory.forModel(model);
}

/**
 * Convenience function to get cached tokenizer.
 *
 * @param model - Model name
 * @returns Cached tokenizer
 */
export function getCachedTokenizer(model: string): CachedTokenizer {
  return TokenizerFactory.getCached(model);
}
