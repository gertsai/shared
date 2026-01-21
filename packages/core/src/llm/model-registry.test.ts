import { describe, it, expect } from 'vitest';
import {
  getAllModelNames,
  getModelsForProvider,
  getModelInfo,
  getContextWindowSize,
  CONTEXT_WINDOW_USAGE_RATIO,
  DEFAULT_CONTEXT_WINDOW_SIZE,
} from './model-registry';

describe('Model Registry (llm-info)', () => {
  describe('getAllModelNames', () => {
    it('should return array of model names', () => {
      const models = getAllModelNames();
      expect(Array.isArray(models)).toBe(true);
      expect(models.length).toBeGreaterThan(0);
    });

    it('should contain known models', () => {
      const models = getAllModelNames();
      // Should contain at least some known models
      expect(models.some((m) => m.includes('gpt'))).toBe(true);
      expect(models.some((m) => m.includes('claude'))).toBe(true);
    });
  });

  describe('getModelsForProvider', () => {
    it('should return array for any provider', () => {
      // Should return array (possibly empty) for any provider
      const models = getModelsForProvider('OpenAI');
      expect(Array.isArray(models)).toBe(true);
    });

    it('should accept provider name and return array', () => {
      // Test various provider names
      const providers = ['OpenAI', 'Anthropic', 'Google', 'openai', 'anthropic'];

      for (const provider of providers) {
        const models = getModelsForProvider(provider);
        expect(Array.isArray(models)).toBe(true);
      }
    });
  });

  describe('getModelInfo', () => {
    it('should return model info for known models', () => {
      const info = getModelInfo('gpt-4o');
      expect(info).toBeDefined();
      if (info) {
        expect(info.contextWindowTokenLimit).toBeGreaterThan(0);
        expect(info.outputTokenLimit).toBeGreaterThan(0);
      }
    });

    it('should return undefined for unknown models', () => {
      const info = getModelInfo('completely-unknown-model-xyz');
      expect(info).toBeUndefined();
    });
  });

  describe('getContextWindowSize', () => {
    it('should return context window with 85% ratio', () => {
      const size = getContextWindowSize('gpt-4o');
      // gpt-4o has 128k context, 85% = ~108800
      expect(size).toBeGreaterThan(100000);
      expect(size).toBeLessThan(128000);
    });

    it('should return default for unknown models', () => {
      const size = getContextWindowSize('unknown-model-xyz');
      const expected = Math.floor(DEFAULT_CONTEXT_WINDOW_SIZE * CONTEXT_WINDOW_USAGE_RATIO);
      expect(size).toBe(expected);
    });
  });

  describe('CONTEXT_WINDOW_USAGE_RATIO', () => {
    it('should be 0.85 (85%)', () => {
      expect(CONTEXT_WINDOW_USAGE_RATIO).toBe(0.85);
    });
  });
});
