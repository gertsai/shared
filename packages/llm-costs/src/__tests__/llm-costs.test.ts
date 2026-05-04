import { describe, it, expect } from 'vitest';
import {
  getModel,
  findModel,
  getAllModels,
  getModelsByProvider,
  getModelsByMode,
  getModelsByCapability,
  filterModels,
  getUniqueProviders,
  getUniqueModes,
  getModelCountByProvider,
  getCheapestChatModels,
  getCheapestEmbeddingModels,
  getLargestContextModels,
  getMeta,
  calculateCost,
  compareCosts,
  getPricingSummary,
  toPerMillion,
  toPerToken,
  formatPrice,
  formatCost,
  getProvider,
  getAllProviders,
} from '../index';

describe('@gerts/llm-costs', () => {
  describe('metadata', () => {
    it('should have 2500+ models loaded', () => {
      const meta = getMeta();
      expect(meta.totalModels).toBeGreaterThan(2500);
      expect(meta.totalProviders).toBeGreaterThan(100);
    });
  });

  describe('getModel', () => {
    it('should return GPT-4o with correct structure', () => {
      const model = getModel('gpt-4o');
      expect(model).toBeDefined();
      expect(model!.provider).toBe('openai');
      expect(model!.mode).toBe('chat');
      expect(model!.tokenPricing.input).toBe(2.5e-6);
      expect(model!.tokenPricing.output).toBe(1e-5);
      expect(model!.maxInputTokens).toBe(128000);
      expect(model!.capabilities.vision).toBe(true);
      expect(model!.capabilities.functionCalling).toBe(true);
    });

    it('should return embedding model with vector size', () => {
      const model = getModel('text-embedding-3-small');
      expect(model).toBeDefined();
      expect(model!.mode).toBe('embedding');
      expect(model!.outputVectorSize).toBe(1536);
      expect(model!.tokenPricing.input).toBe(2e-8);
    });

    it('should return undefined for unknown model', () => {
      expect(getModel('nonexistent-model')).toBeUndefined();
    });
  });

  describe('findModel', () => {
    it('should find by exact match', () => {
      const model = findModel('gpt-4o');
      expect(model?.id).toBe('gpt-4o');
    });

    it('should find by prefix match', () => {
      const model = findModel('claude-3-5-sonnet');
      expect(model).toBeDefined();
      expect(model!.provider).toBe('anthropic');
    });
  });

  describe('getModelsByProvider', () => {
    it('should return OpenAI models', () => {
      const models = getModelsByProvider('openai');
      expect(models.length).toBeGreaterThan(10);
      expect(models.every((m) => m.provider === 'openai')).toBe(true);
    });

    it('should return empty for unknown provider', () => {
      expect(getModelsByProvider('nonexistent')).toHaveLength(0);
    });
  });

  describe('getModelsByMode', () => {
    it('should return embedding models', () => {
      const models = getModelsByMode('embedding');
      expect(models.length).toBeGreaterThan(50);
      expect(models.every((m) => m.mode === 'embedding')).toBe(true);
    });

    it('should return chat models', () => {
      const models = getModelsByMode('chat');
      expect(models.length).toBeGreaterThan(1000);
    });

    it('should return rerank models', () => {
      const models = getModelsByMode('rerank');
      expect(models.length).toBeGreaterThan(10);
    });
  });

  describe('getModelsByCapability', () => {
    it('should return vision models', () => {
      const models = getModelsByCapability('vision');
      expect(models.length).toBeGreaterThan(100);
      expect(models.every((m) => m.capabilities.vision)).toBe(true);
    });

    it('should return reasoning models', () => {
      const models = getModelsByCapability('reasoning');
      expect(models.length).toBeGreaterThan(100);
    });
  });

  describe('filterModels', () => {
    it('should filter by multiple criteria', () => {
      const models = filterModels({
        mode: 'chat',
        provider: 'openai',
        capability: 'vision',
      });
      expect(models.length).toBeGreaterThan(0);
      expect(
        models.every((m) => m.mode === 'chat' && m.provider === 'openai' && m.capabilities.vision),
      ).toBe(true);
    });

    it('should filter by max cost', () => {
      const models = filterModels({
        mode: 'chat',
        maxInputCostPerToken: 1e-6,
      });
      expect(models.length).toBeGreaterThan(0);
      expect(models.every((m) => m.tokenPricing.input <= 1e-6)).toBe(true);
    });
  });

  describe('aggregation', () => {
    it('should list unique providers', () => {
      const providers = getUniqueProviders();
      expect(providers.length).toBeGreaterThan(100);
      expect(providers).toContain('openai');
      expect(providers).toContain('anthropic');
    });

    it('should list unique modes', () => {
      const modes = getUniqueModes();
      expect(modes).toContain('chat');
      expect(modes).toContain('embedding');
      expect(modes).toContain('rerank');
    });

    it('should count models by provider', () => {
      const counts = getModelCountByProvider();
      expect(counts['openai']).toBeGreaterThan(10);
    });
  });

  describe('ranking', () => {
    it('should return cheapest chat models', () => {
      const models = getCheapestChatModels(5);
      expect(models).toHaveLength(5);
      // Should be sorted ascending by input cost
      for (let i = 1; i < models.length; i++) {
        expect(models[i].tokenPricing.input).toBeGreaterThanOrEqual(
          models[i - 1].tokenPricing.input,
        );
      }
    });

    it('should return cheapest embedding models', () => {
      const models = getCheapestEmbeddingModels(5);
      expect(models).toHaveLength(5);
    });

    it('should return largest context models', () => {
      const models = getLargestContextModels(5);
      expect(models).toHaveLength(5);
      // Gemini models should be near the top (2M context)
      expect(models[0].maxInputTokens).toBeGreaterThanOrEqual(1_000_000);
    });
  });

  describe('cost calculation', () => {
    it('should calculate GPT-4o cost', () => {
      const cost = calculateCost('gpt-4o', { inputTokens: 1_000_000, outputTokens: 100_000 });
      expect(cost).toBeDefined();
      // 1M input * $2.5e-6 = $2.50; 100K output * $1e-5 = $1.00
      expect(cost!.inputCost).toBeCloseTo(2.5, 1);
      expect(cost!.outputCost).toBeCloseTo(1.0, 1);
      expect(cost!.totalCost).toBeCloseTo(3.5, 1);
    });

    it('should calculate cost with cache savings', () => {
      const cost = calculateCost('gpt-4o', {
        inputTokens: 100_000,
        outputTokens: 10_000,
        cachedTokens: 50_000,
      });
      expect(cost).toBeDefined();
      expect(cost!.cacheSavings).toBeLessThan(0); // Savings are negative
    });

    it('should return undefined for unknown model', () => {
      expect(calculateCost('nonexistent', { inputTokens: 100, outputTokens: 100 })).toBeUndefined();
    });
  });

  describe('compareCosts', () => {
    it('should compare models sorted by cost', () => {
      const results = compareCosts(['gpt-4o', 'claude-3-5-sonnet-20241022'], {
        inputTokens: 100_000,
        outputTokens: 10_000,
      });
      expect(results.length).toBe(2);
      // Should be sorted cheapest first
      expect(results[0].cost.totalCost).toBeLessThanOrEqual(results[1].cost.totalCost);
    });
  });

  describe('getPricingSummary', () => {
    it('should return per-million pricing', () => {
      const summary = getPricingSummary('gpt-4o');
      expect(summary).toBeDefined();
      expect(summary!.inputPerMToken).toBe(2.5);
      expect(summary!.outputPerMToken).toBe(10);
      expect(summary!.formattedInput).toBe('$2.50 / 1M tokens');
      expect(summary!.formattedOutput).toBe('$10.00 / 1M tokens');
    });
  });

  describe('conversion utilities', () => {
    it('toPerMillion should convert correctly', () => {
      expect(toPerMillion(2.5e-6)).toBe(2.5);
      expect(toPerMillion(1e-5)).toBe(10);
      expect(toPerMillion(0)).toBe(0);
    });

    it('toPerToken should convert correctly', () => {
      expect(toPerToken(2.5)).toBeCloseTo(2.5e-6);
      expect(toPerToken(10)).toBeCloseTo(1e-5);
    });

    it('formatPrice should format for display', () => {
      expect(formatPrice(2.5e-6)).toBe('$2.50 / 1M tokens');
      expect(formatPrice(1e-5)).toBe('$10.00 / 1M tokens');
    });

    it('formatCost should format USD', () => {
      expect(formatCost(0.0875)).toBe('$0.09');
      expect(formatCost(1.234)).toBe('$1.23');
    });
  });

  describe('providers', () => {
    it('should have OpenAI provider', () => {
      const provider = getProvider('openai');
      expect(provider).toBeDefined();
      expect(provider!.name).toBe('OpenAI');
      expect(provider!.endpoints.chatCompletions).toBe(true);
      expect(provider!.endpoints.embeddings).toBe(true);
    });

    it('should have Anthropic provider', () => {
      const provider = getProvider('anthropic');
      expect(provider).toBeDefined();
      expect(provider!.endpoints.chatCompletions).toBe(true);
      expect(provider!.endpoints.embeddings).toBe(false);
    });

    it('should have all key providers', () => {
      const providers = getAllProviders();
      const keys = providers.map((p) => p.key);
      expect(keys).toContain('openai');
      expect(keys).toContain('anthropic');
      expect(keys).toContain('bedrock');
      expect(keys).toContain('ollama');
      expect(keys).toContain('deepseek');
    });
  });
});
