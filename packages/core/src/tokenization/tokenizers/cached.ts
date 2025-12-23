/**
 * @gerts/core - Cached Tokenizer
 *
 * LRU cache wrapper for tokenizers.
 * Caches token counts by text hash to avoid repeated computation.
 *
 * Especially useful for:
 * - API-based tokenizers (Anthropic, Google) - avoids API calls
 * - Repeated text (prompts, templates) - fast lookup
 * - High-frequency counting (memory budgeting) - reduced latency
 */

import {
  type IUniversalTokenizer,
  type TokenizerProvider,
  type TokenizerEncoding,
  type TokenCountResult,
} from '../types.js';
import { LRUCache, toCacheKey } from '../../lru-cache.js';

/**
 * Configuration for CachedTokenizer.
 */
export interface CachedTokenizerConfig {
  /** Maximum cache size (default: 1000) */
  maxSize?: number;
  /** Cache TTL in milliseconds (default: 5 minutes) */
  ttlMs?: number;
}

/**
 * Default cache configuration.
 */
export const DEFAULT_CACHE_CONFIG: Required<CachedTokenizerConfig> = {
  maxSize: 1000,
  ttlMs: 5 * 60 * 1000, // 5 minutes
};

/**
 * CachedTokenizer - LRU cache wrapper for tokenizers.
 *
 * Wraps any IUniversalTokenizer with caching layer.
 * Uses MD5-like hash of text as cache key for O(1) lookup.
 *
 * @example
 * ```typescript
 * const baseTokenizer = new TiktokenTokenizer('gpt-4o');
 * const cachedTokenizer = new CachedTokenizer(baseTokenizer, { maxSize: 500 });
 *
 * // First call - computes and caches
 * const result1 = await cachedTokenizer.countTokens('Hello, world!');
 *
 * // Second call - returns from cache
 * const result2 = await cachedTokenizer.countTokens('Hello, world!');
 * console.log(result2.cached); // true
 * ```
 */
export class CachedTokenizer implements IUniversalTokenizer {
  private readonly inner: IUniversalTokenizer;
  private readonly cache: LRUCache<TokenCountResult>;
  private hits = 0;
  private misses = 0;

  constructor(inner: IUniversalTokenizer, config: CachedTokenizerConfig = {}) {
    this.inner = inner;

    const { maxSize, ttlMs } = { ...DEFAULT_CACHE_CONFIG, ...config };

    this.cache = new LRUCache<TokenCountResult>({
      maxSize,
      defaultTTL: ttlMs,
    });
  }

  /** Provider from wrapped tokenizer */
  get provider(): TokenizerProvider {
    return this.inner.provider;
  }

  /** Encoding from wrapped tokenizer */
  get encoding(): TokenizerEncoding | undefined {
    return this.inner.encoding;
  }

  /** Exactness from wrapped tokenizer */
  get isExact(): boolean {
    return this.inner.isExact;
  }

  /**
   * Count tokens with caching.
   * Returns cached result if available, otherwise computes and caches.
   */
  async countTokens(text: string): Promise<TokenCountResult> {
    if (!text) {
      return {
        count: 0,
        method: this.inner.isExact ? 'exact' : 'estimated',
        provider: this.inner.provider,
        cached: true,
      };
    }

    // Hash text for cache key (fast, deterministic)
    const cacheKey = toCacheKey(this.hashText(text));

    // Check cache
    const cached = this.cache.get(cacheKey);
    if (cached) {
      this.hits++;
      return { ...cached, cached: true };
    }

    // Compute and cache
    this.misses++;
    const result = await this.inner.countTokens(text);
    this.cache.set(cacheKey, result);

    return { ...result, cached: false };
  }

  /**
   * Encode text (delegates to inner tokenizer).
   */
  encode(text: string): number[] {
    if (this.inner.encode) {
      return this.inner.encode(text);
    }
    // Fallback to estimation
    const count = Math.ceil(text.length / 4);
    return Array.from({ length: count }, (_, i) => i);
  }

  /**
   * Decode tokens (delegates to inner tokenizer).
   */
  decode(tokens: number[]): string {
    if (this.inner.decode) {
      return this.inner.decode(tokens);
    }
    return '';
  }

  /**
   * Check if tokenizer supports a model.
   */
  supportsModel(model: string): boolean {
    return this.inner.supportsModel(model);
  }

  /**
   * Dispose inner tokenizer and clear cache.
   */
  dispose(): void {
    if (this.inner.dispose) {
      this.inner.dispose();
    }
    this.cache.clear();
  }

  /**
   * Get cache statistics.
   */
  getStats(): {
    hits: number;
    misses: number;
    hitRate: number;
    size: number;
    maxSize: number;
  } {
    const total = this.hits + this.misses;
    const cacheStats = this.cache.getStats();

    return {
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? this.hits / total : 0,
      size: cacheStats.size,
      maxSize: cacheStats.maxSize,
    };
  }

  /**
   * Clear cache.
   */
  clearCache(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Invalidate cache entries matching pattern.
   */
  invalidatePattern(pattern: RegExp): number {
    return this.cache.invalidatePattern(pattern);
  }

  /**
   * Hash text for cache key.
   * Uses simple but fast hash function.
   */
  private hashText(text: string): string {
    // FNV-1a hash (fast, good distribution)
    let hash = 2166136261;
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash.toString(16);
  }
}

/**
 * Wrap a tokenizer with caching.
 *
 * @param tokenizer - Tokenizer to wrap
 * @param config - Cache configuration
 * @returns Cached tokenizer
 */
export function withCache(
  tokenizer: IUniversalTokenizer,
  config?: CachedTokenizerConfig
): CachedTokenizer {
  return new CachedTokenizer(tokenizer, config);
}
