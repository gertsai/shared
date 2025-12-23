/**
 * @gerts/core - LLM Tests
 * Phase 21: LLM Abstraction
 *
 * Tests for:
 * - BaseLLM abstract class
 * - ModelRouter factory
 * - OpenAI and Anthropic providers (mocked)
 */

import { describe, it, expect, beforeEach, afterEach, vi, type MockedFunction } from 'vitest';
import {
  BaseLLM,
  LLMCapabilities,
  LLMContextLengthExceededError,
  LLMCallError,
} from './base';
import {
  ModelRouter,
  createLLM,
  getDefaultRouter,
} from './routing';
import { OpenAIProvider } from './providers/openai';
import { AnthropicProvider } from './providers/anthropic';
import type {
  LLMMessage,
  LLMResponse,
  LLMCallOptions,
  TokenUsage,
} from './types';
import {
  getContextWindowSize,
  getModelInfo,
  getAllModelNames,
  getModelsForProvider,
  CONTEXT_WINDOW_USAGE_RATIO,
  DEFAULT_CONTEXT_WINDOW_SIZE,
} from './model-registry';
import { SimpleEventBus } from '../event-bus';

// ==================== Mock Setup ====================

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

// Helper to create mock OpenAI response
function createMockOpenAIResponse(content: string, usage?: Partial<TokenUsage>): Response {
  return {
    ok: true,
    json: () =>
      Promise.resolve({
        id: 'chatcmpl-test',
        object: 'chat.completion',
        created: Date.now(),
        model: 'gpt-4o',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content,
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: usage?.promptTokens ?? 10,
          completion_tokens: usage?.completionTokens ?? 20,
          total_tokens: usage?.totalTokens ?? 30,
        },
      }),
  } as Response;
}

// Helper to create mock Anthropic response
function createMockAnthropicResponse(content: string, usage?: Partial<TokenUsage>): Response {
  return {
    ok: true,
    json: () =>
      Promise.resolve({
        id: 'msg_test',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: content }],
        model: 'claude-3-5-sonnet-20241022',
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: {
          input_tokens: usage?.promptTokens ?? 10,
          output_tokens: usage?.completionTokens ?? 20,
        },
      }),
  } as Response;
}

// ==================== Test BaseLLM ====================

describe('BaseLLM', () => {
  // Create a concrete implementation for testing
  class TestLLM extends BaseLLM {
    callCount = 0;

    async call(messages: LLMMessage[], options?: LLMCallOptions): Promise<LLMResponse> {
      this.callCount++;
      return {
        content: 'Test response',
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
        model: this.model,
        finishReason: 'stop',
      };
    }
  }

  describe('constructor', () => {
    it('should require a model name', () => {
      expect(
        () => new TestLLM({ model: '', provider: 'test' })
      ).toThrow('Model name is required');
    });

    it('should set default values', () => {
      const llm = new TestLLM({ model: 'test-model', provider: 'test' });
      expect(llm.model).toBe('test-model');
      expect(llm['timeout']).toBe(60000);
      expect(llm['maxRetries']).toBe(2);
      expect(llm['stop']).toEqual([]);
    });

    it('should normalize stop sequences', () => {
      const llm1 = new TestLLM({ model: 'test', provider: 'test', stop: 'STOP' });
      expect(llm1['stop']).toEqual(['STOP']);

      const llm2 = new TestLLM({ model: 'test', provider: 'test', stop: ['STOP1', 'STOP2'] });
      expect(llm2['stop']).toEqual(['STOP1', 'STOP2']);
    });
  });

  describe('applyStopWords', () => {
    it('should truncate at stop word', () => {
      const llm = new TestLLM({
        model: 'test',
        provider: 'test',
        stop: ['STOP', 'END'],
      });

      const content = 'Hello world STOP more text END final';
      const result = llm['applyStopWords'](content);
      expect(result).toBe('Hello world');
    });

    it('should return content unchanged if no stop word found', () => {
      const llm = new TestLLM({
        model: 'test',
        provider: 'test',
        stop: ['NOTFOUND'],
      });

      const content = 'Hello world';
      const result = llm['applyStopWords'](content);
      expect(result).toBe('Hello world');
    });

    it('should handle empty content', () => {
      const llm = new TestLLM({
        model: 'test',
        provider: 'test',
        stop: ['STOP'],
      });

      expect(llm['applyStopWords']('')).toBe('');
    });
  });

  describe('token usage tracking', () => {
    it('should track token usage across calls', () => {
      const llm = new TestLLM({ model: 'test', provider: 'test' });

      llm['trackTokenUsage']({ promptTokens: 10, completionTokens: 20, totalTokens: 30 });
      llm['trackTokenUsage']({ promptTokens: 5, completionTokens: 10, totalTokens: 15 });

      const usage = llm.getTokenUsage();
      expect(usage.promptTokens).toBe(15);
      expect(usage.completionTokens).toBe(30);
      expect(usage.totalTokens).toBe(45);
      expect(usage.successfulRequests).toBe(2);
    });

    it('should reset token usage', () => {
      const llm = new TestLLM({ model: 'test', provider: 'test' });

      llm['trackTokenUsage']({ promptTokens: 10, completionTokens: 20, totalTokens: 30 });
      llm.resetTokenUsage();

      const usage = llm.getTokenUsage();
      expect(usage.totalTokens).toBe(0);
      expect(usage.successfulRequests).toBe(0);
    });
  });

  describe('context window', () => {
    it('should return correct context window for known models', () => {
      const llm = new TestLLM({ model: 'gpt-4o', provider: 'openai' });
      const windowSize = llm.getContextWindowSize();

      // Use model-registry to get expected value
      const expected = getContextWindowSize('gpt-4o');
      expect(windowSize).toBe(expected);
      // Should be approximately 108800 (128000 * 0.85)
      expect(windowSize).toBeGreaterThan(100000);
    });

    it('should return default for unknown models', () => {
      const llm = new TestLLM({ model: 'unknown-model-xyz', provider: 'test' });
      const windowSize = llm.getContextWindowSize();

      const expected = Math.floor(DEFAULT_CONTEXT_WINDOW_SIZE * CONTEXT_WINDOW_USAGE_RATIO);
      expect(windowSize).toBe(expected);
    });

    it('should cache context window size', () => {
      const llm = new TestLLM({ model: 'gpt-4o', provider: 'openai' });

      const size1 = llm.getContextWindowSize();
      const size2 = llm.getContextWindowSize();

      expect(size1).toBe(size2);
    });
  });

  describe('event emission', () => {
    it('should emit events when event bus is provided', async () => {
      const eventBus = new SimpleEventBus();
      const events: unknown[] = [];

      eventBus.on('llm.call.started', (e) => events.push(e));
      eventBus.on('llm.call.completed', (e) => events.push(e));

      const llm = new TestLLM({ model: 'test', provider: 'test' }, eventBus);

      // Simulate event emission
      llm['emitCallStarted']([{ role: 'user', content: 'Hello' }]);
      llm['emitCallCompleted'](
        { content: 'Hi', usage: { promptTokens: 5, completionTokens: 5, totalTokens: 10 }, model: 'test' },
        Date.now() - 100
      );

      expect(events.length).toBe(2);
    });
  });

  describe('capabilities', () => {
    it('should return default capabilities', () => {
      const llm = new TestLLM({ model: 'test', provider: 'test' });
      const caps = llm.getCapabilities();

      expect(caps.supportsFunctionCalling).toBe(true);
      expect(caps.supportsStopWords).toBe(true);
      expect(caps.supportsStreaming).toBe(true);
    });
  });
});

// ==================== Test ModelRouter ====================

describe('ModelRouter', () => {
  let router: ModelRouter;

  beforeEach(() => {
    router = new ModelRouter({ defaultProvider: 'openai' });
    mockFetch.mockReset();
  });

  describe('inferProvider', () => {
    it('should infer OpenAI from model name', () => {
      expect(router.inferProvider('gpt-4o')).toBe('openai');
      expect(router.inferProvider('gpt-4-turbo')).toBe('openai');
      expect(router.inferProvider('o1-preview')).toBe('openai');
    });

    it('should infer Anthropic from model name', () => {
      expect(router.inferProvider('claude-3-5-sonnet-20241022')).toBe('anthropic');
      expect(router.inferProvider('claude-3-opus-20240229')).toBe('anthropic');
    });

    it('should parse provider prefix', () => {
      expect(router.inferProvider('openai/gpt-4o')).toBe('openai');
      expect(router.inferProvider('anthropic/claude-3-5-sonnet')).toBe('anthropic');
    });

    it('should default to configured provider for unknown models', () => {
      expect(router.inferProvider('unknown-model')).toBe('openai');
    });
  });

  describe('create', () => {
    it('should create OpenAI provider for GPT models', () => {
      mockFetch.mockResolvedValueOnce(createMockOpenAIResponse('Hello'));

      const llm = router.create('gpt-4o', { apiKey: 'test-key' });
      expect(llm).toBeInstanceOf(OpenAIProvider);
    });

    it('should create Anthropic provider for Claude models', () => {
      mockFetch.mockResolvedValueOnce(createMockAnthropicResponse('Hello'));

      const llm = router.create('claude-3-5-sonnet-20241022', { apiKey: 'test-key' });
      expect(llm).toBeInstanceOf(AnthropicProvider);
    });

    it('should throw for unsupported providers', () => {
      expect(() => router.create('gemini/gemini-1.5-pro')).toThrow('not supported');
    });

    it('should handle provider prefix', () => {
      const llm = router.create('openai/gpt-4o', { apiKey: 'test-key' });
      expect(llm).toBeInstanceOf(OpenAIProvider);
      expect(llm.model).toBe('gpt-4o');
    });
  });

  describe('getCostOptimizedModel', () => {
    it('should return appropriate model for task type', () => {
      expect(router.getCostOptimizedModel('simple', 'openai')).toBe('gpt-4o-mini');
      expect(router.getCostOptimizedModel('complex', 'openai')).toBe('gpt-4o');
      expect(router.getCostOptimizedModel('simple', 'anthropic')).toBe('claude-3-5-haiku-latest');
    });
  });

  describe('getSupportedProviders', () => {
    it('should return list of supported providers', () => {
      const providers = router.getSupportedProviders();
      expect(providers).toContain('openai');
      expect(providers).toContain('anthropic');
    });
  });
});

// ==================== Test OpenAIProvider ====================

describe('OpenAIProvider', () => {
  let provider: OpenAIProvider;

  beforeEach(() => {
    mockFetch.mockReset();
    provider = new OpenAIProvider({
      model: 'gpt-4o',
      apiKey: 'test-api-key',
      temperature: 0.7,
    });
  });

  describe('call', () => {
    it('should make API call and return response', async () => {
      mockFetch.mockResolvedValueOnce(createMockOpenAIResponse('Hello, world!'));

      const response = await provider.call([{ role: 'user', content: 'Hi' }]);

      expect(response.content).toBe('Hello, world!');
      expect(response.model).toBe('gpt-4o');
      expect(response.usage.totalTokens).toBe(30);
    });

    it('should apply stop words to response', async () => {
      const providerWithStop = new OpenAIProvider({
        model: 'gpt-4o',
        apiKey: 'test-key',
        stop: ['STOP'],
      });

      mockFetch.mockResolvedValueOnce(createMockOpenAIResponse('Hello STOP world'));

      const response = await providerWithStop.call([{ role: 'user', content: 'Hi' }]);
      expect(response.content).toBe('Hello');
    });

    it('should track token usage', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockOpenAIResponse('Hello', {
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
        })
      );

      await provider.call([{ role: 'user', content: 'Hi' }]);

      const usage = provider.getTokenUsage();
      expect(usage.promptTokens).toBe(100);
      expect(usage.completionTokens).toBe(50);
      expect(usage.totalTokens).toBe(150);
    });

    it('should throw error when API key is missing', async () => {
      const noKeyProvider = new OpenAIProvider({ model: 'gpt-4o' });

      await expect(noKeyProvider.call([{ role: 'user', content: 'Hi' }])).rejects.toThrow(
        'API key is required'
      );
    });

    it('should throw LLMCallError on API failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        text: () => Promise.resolve('Rate limit exceeded'),
      } as Response);

      await expect(provider.call([{ role: 'user', content: 'Hi' }])).rejects.toThrow(LLMCallError);
    });
  });

  describe('capabilities', () => {
    it('should report correct capabilities for GPT-4o', () => {
      const caps = provider.getCapabilities();
      expect(caps.supportsFunctionCalling).toBe(true);
      expect(caps.supportsVision).toBe(true);
      expect(caps.supportsStructuredOutputs).toBe(true);
    });

    it('should report limited capabilities for O1 models', () => {
      const o1Provider = new OpenAIProvider({
        model: 'o1-preview',
        apiKey: 'test-key',
      });

      const caps = o1Provider.getCapabilities();
      expect(caps.supportsFunctionCalling).toBe(false);
      expect(caps.supportsStopWords).toBe(false);
    });
  });
});

// ==================== Test AnthropicProvider ====================

describe('AnthropicProvider', () => {
  let provider: AnthropicProvider;

  beforeEach(() => {
    mockFetch.mockReset();
    provider = new AnthropicProvider({
      model: 'claude-3-5-sonnet-20241022',
      apiKey: 'test-api-key',
      maxTokens: 4096,
    });
  });

  describe('call', () => {
    it('should make API call and return response', async () => {
      mockFetch.mockResolvedValueOnce(createMockAnthropicResponse('Hello from Claude!'));

      const response = await provider.call([{ role: 'user', content: 'Hi' }]);

      expect(response.content).toBe('Hello from Claude!');
      expect(response.model).toBe('claude-3-5-sonnet-20241022');
    });

    it('should handle system messages separately', async () => {
      mockFetch.mockResolvedValueOnce(createMockAnthropicResponse('Response'));

      await provider.call([
        { role: 'system', content: 'You are helpful' },
        { role: 'user', content: 'Hi' },
      ]);

      const callBody = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
      expect(callBody.system).toBe('You are helpful');
      expect(callBody.messages[0].role).toBe('user');
    });

    it('should throw error when API key is missing', async () => {
      const noKeyProvider = new AnthropicProvider({
        model: 'claude-3-5-sonnet-20241022',
      });

      await expect(noKeyProvider.call([{ role: 'user', content: 'Hi' }])).rejects.toThrow(
        'API key is required'
      );
    });
  });

  describe('capabilities', () => {
    it('should report correct capabilities', () => {
      const caps = provider.getCapabilities();
      expect(caps.supportsFunctionCalling).toBe(true);
      expect(caps.supportsVision).toBe(true);
      expect(caps.supportsStreaming).toBe(true);
    });
  });
});

// ==================== Test Model Registry ====================

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
      expect(models.some(m => m.includes('gpt'))).toBe(true);
      expect(models.some(m => m.includes('claude'))).toBe(true);
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

// ==================== Test Error Classes ====================

describe('LLM Errors', () => {
  describe('LLMContextLengthExceededError', () => {
    it('should create error with correct name', () => {
      const error = new LLMContextLengthExceededError('Context exceeded');
      expect(error.name).toBe('LLMContextLengthExceededError');
      expect(error.message).toBe('Context exceeded');
    });
  });

  describe('LLMCallError', () => {
    it('should create error with provider and model info', () => {
      const error = new LLMCallError('API failed', 'openai', 'gpt-4o', new Error('Network error'));

      expect(error.name).toBe('LLMCallError');
      expect(error.message).toBe('API failed');
      expect(error.provider).toBe('openai');
      expect(error.model).toBe('gpt-4o');
      expect(error.cause).toBeInstanceOf(Error);
    });
  });
});

// ==================== Test Helper Functions ====================

describe('Helper Functions', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe('createLLM', () => {
    it('should create LLM using default router', () => {
      const llm = createLLM('gpt-4o', { apiKey: 'test-key' });
      expect(llm).toBeInstanceOf(OpenAIProvider);
    });
  });
});
