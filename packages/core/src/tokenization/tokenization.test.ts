/**
 * @gerts/core - Tokenization Tests
 *
 * Comprehensive tests for the tokenization module.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  TokenizerFactory,
  TiktokenTokenizer,
  EstimationTokenizer,
  CachedTokenizer,
  withCache,
  countTokens,
  getTokenizer,
  getCachedTokenizer,
  getEncodingForModel,
  PROVIDER_TOKEN_MULTIPLIERS,
  type IUniversalTokenizer,
} from './index.js';

describe('@gerts/core/tokenization', () => {
  afterEach(() => {
    TokenizerFactory.clearAll();
  });

  describe('getEncodingForModel', () => {
    it('should return o200k_base for GPT-4o models', () => {
      expect(getEncodingForModel('gpt-4o')).toBe('o200k_base');
      expect(getEncodingForModel('gpt-4o-mini')).toBe('o200k_base');
    });

    it('should return o200k_base for o1/o3 models', () => {
      expect(getEncodingForModel('o1')).toBe('o200k_base');
      expect(getEncodingForModel('o1-mini')).toBe('o200k_base');
      expect(getEncodingForModel('o1-preview')).toBe('o200k_base');
      expect(getEncodingForModel('o3')).toBe('o200k_base');
    });

    it('should return cl100k_base for GPT-4 models', () => {
      expect(getEncodingForModel('gpt-4')).toBe('cl100k_base');
      expect(getEncodingForModel('gpt-4-turbo')).toBe('cl100k_base');
      expect(getEncodingForModel('gpt-3.5-turbo')).toBe('cl100k_base');
    });

    it('should return undefined for non-OpenAI models', () => {
      expect(getEncodingForModel('claude-3-5-sonnet')).toBeUndefined();
      expect(getEncodingForModel('gemini-1.5-pro')).toBeUndefined();
      expect(getEncodingForModel('llama-3-70b')).toBeUndefined();
    });
  });

  describe('PROVIDER_TOKEN_MULTIPLIERS', () => {
    it('should have correct multipliers', () => {
      expect(PROVIDER_TOKEN_MULTIPLIERS.openai).toBe(1.0);
      expect(PROVIDER_TOKEN_MULTIPLIERS.anthropic).toBe(1.25);
      expect(PROVIDER_TOKEN_MULTIPLIERS.google).toBe(1.1);
      expect(PROVIDER_TOKEN_MULTIPLIERS.llama).toBe(0.95);
    });
  });

  describe('TiktokenTokenizer', () => {
    let tokenizer: TiktokenTokenizer;

    beforeEach(() => {
      tokenizer = new TiktokenTokenizer('gpt-4o');
    });

    it('should have correct provider', () => {
      expect(tokenizer.provider).toBe('openai');
    });

    it('should be exact', () => {
      expect(tokenizer.isExact).toBe(true);
    });

    it('should have correct encoding', () => {
      expect(tokenizer.encoding).toBe('o200k_base');
    });

    it('should count tokens for empty text', async () => {
      const result = await tokenizer.countTokens('');
      expect(result.count).toBe(0);
      expect(result.method).toBe('exact');
    });

    it('should count tokens for simple text', async () => {
      const result = await tokenizer.countTokens('Hello, world!');
      expect(result.count).toBeGreaterThan(0);
      expect(result.count).toBeLessThan(10); // Should be ~4 tokens
      expect(result.method).toBe('exact');
      expect(result.provider).toBe('openai');
    });

    it('should count tokens for longer text', async () => {
      const text = 'The quick brown fox jumps over the lazy dog. '.repeat(10);
      const result = await tokenizer.countTokens(text);
      expect(result.count).toBeGreaterThan(50);
      expect(result.method).toBe('exact');
    });

    it('should support the model', () => {
      expect(tokenizer.supportsModel('gpt-4o')).toBe(true);
      expect(tokenizer.supportsModel('gpt-4')).toBe(true);
      expect(tokenizer.supportsModel('claude-3')).toBe(false);
    });
  });

  describe('EstimationTokenizer', () => {
    it('should have estimation provider by default', () => {
      const tokenizer = new EstimationTokenizer();
      expect(tokenizer.provider).toBe('estimation');
      expect(tokenizer.isExact).toBe(false);
    });

    it('should auto-detect provider from model', () => {
      const claude = new EstimationTokenizer({ model: 'claude-3-5-sonnet' });
      expect(claude.provider).toBe('anthropic');

      const gemini = new EstimationTokenizer({ model: 'gemini-1.5-pro' });
      expect(gemini.provider).toBe('google');
    });

    it('should apply provider multipliers', async () => {
      const base = new EstimationTokenizer({ multiplier: 1.0 });
      const claude = new EstimationTokenizer({ model: 'claude-3-5-sonnet' });

      // Use longer text for visible difference
      const text = 'The quick brown fox jumps over the lazy dog. '.repeat(10);
      const baseResult = await base.countTokens(text);
      const claudeResult = await claude.countTokens(text);

      // Claude should have ~25% more tokens
      expect(claudeResult.count).toBeGreaterThan(baseResult.count);

      // Verify the ratio is approximately 1.25 (within rounding tolerance)
      const actualRatio = claudeResult.count / baseResult.count;
      expect(actualRatio).toBeGreaterThan(1.2);
      expect(actualRatio).toBeLessThan(1.3);
    });

    it('should count tokens for empty text', async () => {
      const tokenizer = new EstimationTokenizer();
      const result = await tokenizer.countTokens('');
      expect(result.count).toBe(0);
      expect(result.method).toBe('estimated');
    });

    it('should estimate ~4 chars per token', async () => {
      const tokenizer = new EstimationTokenizer({ multiplier: 1.0 });
      const text = 'a'.repeat(100); // 100 chars
      const result = await tokenizer.countTokens(text);
      expect(result.count).toBe(25); // 100 / 4 = 25
    });

    it('should support all models', () => {
      const tokenizer = new EstimationTokenizer();
      expect(tokenizer.supportsModel('any-model')).toBe(true);
    });

    it('should allow custom multiplier', async () => {
      const tokenizer = new EstimationTokenizer({ multiplier: 2.0 });
      const text = 'a'.repeat(100);
      const result = await tokenizer.countTokens(text);
      expect(result.count).toBe(50); // 25 * 2 = 50
    });

    it('should provide encode method', () => {
      const tokenizer = new EstimationTokenizer();
      const tokens = tokenizer.encode('Hello');
      expect(Array.isArray(tokens)).toBe(true);
      expect(tokens.length).toBeGreaterThan(0);
    });
  });

  describe('CachedTokenizer', () => {
    let baseTokenizer: EstimationTokenizer;
    let cachedTokenizer: CachedTokenizer;

    beforeEach(() => {
      baseTokenizer = new EstimationTokenizer();
      cachedTokenizer = new CachedTokenizer(baseTokenizer, { maxSize: 100 });
    });

    it('should wrap base tokenizer', () => {
      expect(cachedTokenizer.provider).toBe(baseTokenizer.provider);
      expect(cachedTokenizer.isExact).toBe(baseTokenizer.isExact);
    });

    it('should cache results', async () => {
      const text = 'Hello, world!';

      // First call - miss
      const result1 = await cachedTokenizer.countTokens(text);
      expect(result1.cached).toBe(false);

      // Second call - hit
      const result2 = await cachedTokenizer.countTokens(text);
      expect(result2.cached).toBe(true);
      expect(result2.count).toBe(result1.count);
    });

    it('should track cache stats', async () => {
      await cachedTokenizer.countTokens('Hello');
      await cachedTokenizer.countTokens('Hello');
      await cachedTokenizer.countTokens('World');

      const stats = cachedTokenizer.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(2);
      expect(stats.hitRate).toBeCloseTo(1 / 3);
    });

    it('should clear cache', async () => {
      await cachedTokenizer.countTokens('Hello');
      cachedTokenizer.clearCache();

      const stats = cachedTokenizer.getStats();
      expect(stats.size).toBe(0);
      expect(stats.hits).toBe(0);
    });

    it('should delegate encode/decode', () => {
      const tokens = cachedTokenizer.encode('Hello');
      expect(Array.isArray(tokens)).toBe(true);
    });
  });

  describe('withCache', () => {
    it('should wrap tokenizer with cache', async () => {
      const base = new EstimationTokenizer();
      const cached = withCache(base);

      expect(cached).toBeInstanceOf(CachedTokenizer);

      await cached.countTokens('Hello');
      await cached.countTokens('Hello');

      expect(cached.getStats().hits).toBe(1);
    });
  });

  describe('TokenizerFactory', () => {
    describe('forModel', () => {
      it('should return TiktokenTokenizer for OpenAI models', () => {
        const tokenizer = TokenizerFactory.forModel('gpt-4o');
        expect(tokenizer).toBeInstanceOf(TiktokenTokenizer);
        expect(tokenizer.provider).toBe('openai');
      });

      it('should return EstimationTokenizer for Claude models', () => {
        const tokenizer = TokenizerFactory.forModel('claude-3-5-sonnet');
        expect(tokenizer).toBeInstanceOf(EstimationTokenizer);
        expect(tokenizer.provider).toBe('anthropic');
      });

      it('should return EstimationTokenizer for Gemini models', () => {
        const tokenizer = TokenizerFactory.forModel('gemini-1.5-pro');
        expect(tokenizer).toBeInstanceOf(EstimationTokenizer);
        expect(tokenizer.provider).toBe('google');
      });

      it('should return singleton instance', () => {
        const t1 = TokenizerFactory.forModel('gpt-4o');
        const t2 = TokenizerFactory.forModel('gpt-4o');
        expect(t1).toBe(t2);
      });
    });

    describe('getCached', () => {
      it('should return cached tokenizer', () => {
        const cached = TokenizerFactory.getCached('gpt-4o');
        expect(cached).toBeInstanceOf(CachedTokenizer);
      });

      it('should return singleton cached instance', () => {
        const c1 = TokenizerFactory.getCached('gpt-4o');
        const c2 = TokenizerFactory.getCached('gpt-4o');
        expect(c1).toBe(c2);
      });
    });

    describe('countTokens', () => {
      it('should count tokens for model', async () => {
        const result = await TokenizerFactory.countTokens('Hello, world!', 'gpt-4o');
        expect(result.count).toBeGreaterThan(0);
        expect(result.provider).toBe('openai');
      });

      it('should use default model if not specified', async () => {
        const result = await TokenizerFactory.countTokens('Hello');
        expect(result.provider).toBe('openai');
      });
    });

    describe('count', () => {
      it('should return just the count', async () => {
        const count = await TokenizerFactory.count('Hello, world!');
        expect(typeof count).toBe('number');
        expect(count).toBeGreaterThan(0);
      });
    });

    describe('forProvider', () => {
      it('should create OpenAI tokenizer', () => {
        const t = TokenizerFactory.forProvider('openai');
        expect(t).toBeInstanceOf(TiktokenTokenizer);
      });

      it('should create Anthropic tokenizer', () => {
        const t = TokenizerFactory.forProvider('anthropic');
        expect(t).toBeInstanceOf(EstimationTokenizer);
        expect((t as EstimationTokenizer).getMultiplier()).toBe(1.25);
      });

      it('should create Google tokenizer', () => {
        const t = TokenizerFactory.forProvider('google');
        expect(t).toBeInstanceOf(EstimationTokenizer);
        expect((t as EstimationTokenizer).getMultiplier()).toBe(1.1);
      });
    });

    describe('provider shortcuts', () => {
      it('should create OpenAI tokenizer', () => {
        const t = TokenizerFactory.openai();
        expect(t).toBeInstanceOf(TiktokenTokenizer);
      });

      it('should create Anthropic tokenizer', () => {
        const t = TokenizerFactory.anthropic();
        expect(t).toBeInstanceOf(EstimationTokenizer);
      });

      it('should create Google tokenizer', () => {
        const t = TokenizerFactory.google();
        expect(t).toBeInstanceOf(EstimationTokenizer);
      });

      it('should create estimation tokenizer', () => {
        const t = TokenizerFactory.estimation(1.5);
        expect(t.getMultiplier()).toBe(1.5);
      });
    });

    describe('clearAll', () => {
      it('should clear all instances', () => {
        TokenizerFactory.forModel('gpt-4o');
        TokenizerFactory.getCached('gpt-4o');
        TokenizerFactory.clearAll();

        // Next call should create new instance
        const t = TokenizerFactory.forModel('gpt-4o');
        expect(t).toBeInstanceOf(TiktokenTokenizer);
      });
    });

    describe('getCacheStats', () => {
      it('should return stats for cached model', async () => {
        const cached = TokenizerFactory.getCached('gpt-4o');
        await cached.countTokens('Hello');

        const stats = TokenizerFactory.getCacheStats('gpt-4o');
        expect(stats).toBeDefined();
        expect(stats?.misses).toBe(1);
      });

      it('should return undefined for non-cached model', () => {
        const stats = TokenizerFactory.getCacheStats('unknown-model');
        expect(stats).toBeUndefined();
      });
    });

    describe('configure', () => {
      it('should configure factory', () => {
        TokenizerFactory.configure({ cacheMaxSize: 500 });
        // Configuration should apply to new cached instances
        const cached = TokenizerFactory.getCached('gpt-4o');
        expect(cached).toBeInstanceOf(CachedTokenizer);
      });
    });
  });

  describe('convenience functions', () => {
    describe('countTokens', () => {
      it('should count tokens', async () => {
        const count = await countTokens('Hello, world!');
        expect(count).toBeGreaterThan(0);
      });

      it('should accept model parameter', async () => {
        const count = await countTokens('Hello', 'claude-3-5-sonnet');
        expect(count).toBeGreaterThan(0);
      });
    });

    describe('getTokenizer', () => {
      it('should return tokenizer', () => {
        const t = getTokenizer('gpt-4o');
        expect(t.provider).toBe('openai');
      });
    });

    describe('getCachedTokenizer', () => {
      it('should return cached tokenizer', () => {
        const t = getCachedTokenizer('gpt-4o');
        expect(t).toBeInstanceOf(CachedTokenizer);
      });
    });
  });

  describe('integration: multi-model comparison', () => {
    it('should show different token counts for same text', async () => {
      const text = 'The quick brown fox jumps over the lazy dog.';

      const openai = await TokenizerFactory.countTokens(text, 'gpt-4o');
      const claude = await TokenizerFactory.countTokens(text, 'claude-3-5-sonnet');
      const gemini = await TokenizerFactory.countTokens(text, 'gemini-1.5-pro');

      // Claude should use more tokens (1.25x)
      expect(claude.count).toBeGreaterThan(openai.count);

      // Gemini should use more tokens (1.1x)
      expect(gemini.count).toBeGreaterThan(openai.count);

      // Claude should use more than Gemini
      expect(claude.count).toBeGreaterThanOrEqual(gemini.count);
    });

    it('should handle unicode text', async () => {
      const text = 'Привет, мир! 🌍 こんにちは世界';

      const result = await TokenizerFactory.countTokens(text, 'gpt-4o');
      expect(result.count).toBeGreaterThan(0);
    });

    it('should handle very long text', async () => {
      const text = 'word '.repeat(10000); // ~50,000 chars

      const result = await TokenizerFactory.countTokens(text, 'gpt-4o');
      expect(result.count).toBeGreaterThan(5000);
    });
  });

  describe('IUniversalTokenizer interface compliance', () => {
    const tokenizers: [string, IUniversalTokenizer][] = [
      ['TiktokenTokenizer', new TiktokenTokenizer()],
      ['EstimationTokenizer', new EstimationTokenizer()],
      ['CachedTokenizer', new CachedTokenizer(new EstimationTokenizer())],
    ];

    it.each(tokenizers)('%s should have provider property', (name, tokenizer) => {
      expect(tokenizer.provider).toBeDefined();
      expect(typeof tokenizer.provider).toBe('string');
    });

    it.each(tokenizers)('%s should have isExact property', (name, tokenizer) => {
      expect(typeof tokenizer.isExact).toBe('boolean');
    });

    it.each(tokenizers)('%s should implement countTokens', async (name, tokenizer) => {
      const result = await tokenizer.countTokens('Hello');
      expect(result).toHaveProperty('count');
      expect(result).toHaveProperty('method');
      expect(result).toHaveProperty('provider');
    });

    it.each(tokenizers)('%s should implement supportsModel', (name, tokenizer) => {
      expect(typeof tokenizer.supportsModel('gpt-4')).toBe('boolean');
    });
  });
});
