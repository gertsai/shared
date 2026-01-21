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
import { BaseLLM, LLMCapabilities, LLMContextLengthExceededError, LLMCallError } from './base';
import { ModelRouter, createLLM, getDefaultRouter } from './routing';
import { OpenAIProvider } from './providers/openai';
import { AnthropicProvider } from './providers/anthropic';
import { GeminiProvider } from './providers/gemini';
import type { LLMMessage, LLMResponse, LLMCallOptions, TokenUsage } from './types';
import type { LLMRouterSelectionEvent } from './router-types';
import * as ModelRegistry from './model-registry';
import { SimpleEventBus } from '../event-bus';

// ==================== Mock Setup ====================

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

// Mock model registry to ensure deterministic behavior
vi.mock('./model-registry', async (importOriginal) => {
  const actual = await importOriginal<typeof ModelRegistry>();
  return {
    ...actual,
    getCheapestModel: vi.fn(),
    getMostCapableModel: vi.fn(),
    inferProvider: vi.fn(),
    getModelInfo: vi.fn(),
    getContextWindowSize: vi.fn(),
    supportsVision: vi.fn(),
    supportsReasoning: vi.fn(),
  };
});

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

// Helper to create mock Gemini response
function createMockGeminiResponse(content: string, usage?: Partial<TokenUsage>): Response {
  return {
    ok: true,
    json: () =>
      Promise.resolve({
        candidates: [
          {
            content: {
              parts: [{ text: content }],
            },
            finishReason: 'STOP',
          },
        ],
        usageMetadata: {
          promptTokenCount: usage?.promptTokens ?? 10,
          candidatesTokenCount: usage?.completionTokens ?? 20,
          totalTokenCount: usage?.totalTokens ?? 30,
        },
        modelVersion: 'gemini-1.5-pro',
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

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ModelRegistry.getContextWindowSize).mockReturnValue(100000);
    vi.mocked(ModelRegistry.supportsVision).mockReturnValue(true);
    vi.mocked(ModelRegistry.supportsReasoning).mockReturnValue(false);
  });

  describe('constructor', () => {
    it('should require a model name', () => {
      expect(() => new TestLLM({ model: '', provider: 'test' })).toThrow('Model name is required');
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
      vi.mocked(ModelRegistry.getContextWindowSize).mockReturnValue(108800);

      const llm = new TestLLM({ model: 'gpt-4o', provider: 'openai' });
      const windowSize = llm.getContextWindowSize();

      expect(windowSize).toBe(108800);
    });

    it('should cache context window size', () => {
      vi.mocked(ModelRegistry.getContextWindowSize).mockReturnValue(1000);

      const llm = new TestLLM({ model: 'gpt-4o', provider: 'openai' });

      const size1 = llm.getContextWindowSize();
      const size2 = llm.getContextWindowSize();

      expect(size1).toBe(size2);
      expect(ModelRegistry.getContextWindowSize).toHaveBeenCalledTimes(1);
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
        {
          content: 'Hi',
          usage: { promptTokens: 5, completionTokens: 5, totalTokens: 10 },
          model: 'test',
        },
        Date.now() - 100,
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
    mockFetch.mockReset();
    vi.mocked(ModelRegistry.getCheapestModel).mockReturnValue('gpt-4o-mini');
    vi.mocked(ModelRegistry.getMostCapableModel).mockReturnValue('gpt-4o');
    vi.mocked(ModelRegistry.inferProvider).mockReturnValue('openai');
    vi.mocked(ModelRegistry.getContextWindowSize).mockReturnValue(128000);
    vi.mocked(ModelRegistry.getModelInfo).mockReturnValue({
      name: 'gpt-4o',
      provider: 'OpenAI',
      contextWindowTokenLimit: 128000,
      outputTokenLimit: 4096,
      id: 'gpt-4o',
      pricePerMillionInputTokens: 5,
      pricePerMillionOutputTokens: 15,
      reasoning: false,
      supportsImageInput: true,
      recommendedForCoding: true,
      recommendedForWriting: true,
      legacy: false,
    });

    router = new ModelRouter({ defaultProvider: 'openai' });
  });

  describe('inferProvider', () => {
    it('should infer OpenAI from model name', () => {
      vi.mocked(ModelRegistry.inferProvider).mockReturnValue('openai');
      expect(router.inferProvider('gpt-4o')).toBe('openai');
    });

    it('should infer Anthropic from model name', () => {
      vi.mocked(ModelRegistry.inferProvider).mockReturnValue('anthropic');
      expect(router.inferProvider('claude-3-5-sonnet-20241022')).toBe('anthropic');
    });

    it('should parse provider prefix', () => {
      expect(router.inferProvider('openai/gpt-4o')).toBe('openai');
      expect(router.inferProvider('anthropic/claude-3-5-sonnet')).toBe('anthropic');
      expect(router.inferProvider('gemini/gemini-1.5-pro')).toBe('gemini');
    });

    it('should default to configured provider for unknown models', () => {
      vi.mocked(ModelRegistry.inferProvider).mockReturnValue('openai'); // Fallback in registry
      expect(router.inferProvider('unknown-model')).toBe('openai');
    });
  });

  describe('create', () => {
    it('should create OpenAI provider for GPT models', () => {
      vi.mocked(ModelRegistry.inferProvider).mockReturnValue('openai');
      mockFetch.mockResolvedValueOnce(createMockOpenAIResponse('Hello'));

      const llm = router.create('gpt-4o', { apiKey: 'test-key' });
      expect(llm).toBeInstanceOf(OpenAIProvider);
    });

    it('should create Anthropic provider for Claude models', () => {
      vi.mocked(ModelRegistry.inferProvider).mockReturnValue('anthropic');
      mockFetch.mockResolvedValueOnce(createMockAnthropicResponse('Hello'));

      const llm = router.create('claude-3-5-sonnet-20241022', { apiKey: 'test-key' });
      expect(llm).toBeInstanceOf(AnthropicProvider);
    });

    it('should throw for unsupported providers', () => {
      // Mock inferProvider to return 'groq' for 'groq/...'
      // OR parseModel logic should handle it.
      // With our new logic, parseModel('groq/...') returns provider 'groq'.
      expect(() => router.create('groq/llama3-8b')).toThrow('not supported');
    });

    it('should create Gemini provider for Gemini models', () => {
      vi.mocked(ModelRegistry.inferProvider).mockReturnValue('google'); // llm-info returns 'google'
      mockFetch.mockResolvedValueOnce(createMockGeminiResponse('Hello'));

      const llm = router.create('gemini-1.5-pro', { apiKey: 'test-key' });
      expect(llm).toBeInstanceOf(GeminiProvider);
    });

    it('should handle provider prefix', () => {
      const llm = router.create('openai/gpt-4o', { apiKey: 'test-key' });
      expect(llm).toBeInstanceOf(OpenAIProvider);
      expect(llm.model).toBe('gpt-4o');
    });
  });

  describe('getCostOptimizedModel', () => {
    it('should return appropriate model for task type', () => {
      // Mocks are set in beforeEach: simple -> cheapest (gpt-4o-mini), complex -> capable (gpt-4o)
      expect(router.getCostOptimizedModel('simple', 'openai')).toBe('gpt-4o-mini');
      expect(router.getCostOptimizedModel('complex', 'openai')).toBe('gpt-4o');
    });
  });

  describe('routing helpers', () => {
    it('should provide candidate models', () => {
      // Ensure mocks return something
      vi.mocked(ModelRegistry.getCheapestModel).mockReturnValue('gpt-4o-mini');
      vi.mocked(ModelRegistry.getMostCapableModel).mockReturnValue('gpt-4o');

      const candidates = router.listCandidates({ taskType: 'complex' });
      expect(candidates.length).toBeGreaterThan(0);
      expect(candidates[0].contextWindow).toBeGreaterThan(0);
    });

    it('should emit router selection events', () => {
      const eventBus = new SimpleEventBus();
      const events: LLMRouterSelectionEvent[] = [];
      const routerWithEvents = new ModelRouter({
        defaultProvider: 'openai',
        eventBus,
      });

      eventBus.on('llm.router.selection', (event) => events.push(event));

      const result = routerWithEvents.selectModelForTask({
        taskType: 'simple',
        inputTokens: 10,
        outputTokens: 20,
      });

      expect(result.selection.selectedModel).toBeDefined();
      expect(events.length).toBe(1);
      expect(events[0].model).toBe(result.selection.selectedModel);
      expect(result.selection.costEstimate?.estimatedCostUsd).toBeGreaterThan(0);
    });
  });

  describe('getSupportedProviders', () => {
    it('should return list of supported providers', () => {
      const providers = router.getSupportedProviders();
      expect(providers).toContain('openai');
      expect(providers).toContain('anthropic');
      expect(providers).toContain('gemini');
    });
  });
});

// ==================== Test OpenAIProvider ====================

describe('OpenAIProvider', () => {
  let provider: OpenAIProvider;

  beforeEach(() => {
    mockFetch.mockReset();
    vi.mocked(ModelRegistry.supportsVision).mockReturnValue(true);
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
        }),
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
        'API key is required',
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
      expect(caps.supportsNativeStructuredOutputs).toBe(true);
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
        'API key is required',
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

// ==================== Test GeminiProvider ====================

describe('GeminiProvider', () => {
  let provider: GeminiProvider;

  beforeEach(() => {
    mockFetch.mockReset();
    provider = new GeminiProvider({
      model: 'gemini-1.5-pro',
      apiKey: 'test-api-key',
      temperature: 0.7,
    });
  });

  describe('call', () => {
    it('should make API call and return response', async () => {
      mockFetch.mockResolvedValueOnce(createMockGeminiResponse('Hello, world!'));

      const response = await provider.call([{ role: 'user', content: 'Hi' }]);

      expect(response.content).toBe('Hello, world!');
      expect(response.model).toBe('gemini-1.5-pro');
      expect(response.usage.totalTokens).toBe(30);
    });

    it('should apply stop words to response', async () => {
      mockFetch.mockResolvedValueOnce(createMockGeminiResponse('Hello stop world'));

      const providerWithStop = new GeminiProvider({
        model: 'gemini-1.5-pro',
        apiKey: 'test-api-key',
        stop: ['stop'],
      });

      const response = await providerWithStop.call([{ role: 'user', content: 'Hi' }]);

      expect(response.content).toBe('Hello');
    });

    it('should throw error if API key missing', async () => {
      const noKeyProvider = new GeminiProvider({ model: 'gemini-1.5-pro' });

      await expect(noKeyProvider.call([{ role: 'user', content: 'Hi' }])).rejects.toThrow(
        LLMCallError,
      );
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

// ==================== Advanced Integration Tests ====================

describe('Advanced Integration Scenarios', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.mocked(ModelRegistry.supportsVision).mockReturnValue(true);
  });

  describe('OpenAI Streaming', () => {
    it('should parse SSE chunks and assemble response', async () => {
      const provider = new OpenAIProvider({
        model: 'gpt-4o',
        apiKey: 'test-key',
      });

      // Mock a readable stream response
      const stream = new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();
          const chunks = [
            'data: ' + JSON.stringify({ choices: [{ delta: { content: 'Hello' } }] }) + '\n\n',
            'data: ' + JSON.stringify({ choices: [{ delta: { content: ' World' } }] }) + '\n\n',
            'data: [DONE]\n\n',
          ];
          chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
          controller.close();
        },
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: stream,
      });

      const chunks: string[] = [];
      for await (const chunk of provider.stream([{ role: 'user', content: 'Hi' }])) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual(['Hello', ' World']);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('Payload Verification', () => {
    it('should correctly format JSON Schema for OpenAI', async () => {
      const provider = new OpenAIProvider({
        model: 'gpt-4o',
        apiKey: 'test-key',
      });

      mockFetch.mockResolvedValueOnce(createMockOpenAIResponse('{}'));

      const jsonSchema = {
        name: 'test_schema',
        schema: { type: 'object' as const, properties: { foo: { type: 'string' } } },
        strict: true,
      };

      await provider.call([{ role: 'user', content: 'Gen JSON' }], {
        responseFormat: {
          type: 'json_schema',
          jsonSchema,
        },
      });

      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body as string);

      expect(body.response_format).toEqual({
        type: 'json_schema',
        json_schema: {
          name: 'test_schema',
          schema: jsonSchema.schema,
          strict: true,
        },
      });
    });

    it('should extract system message for Anthropic', async () => {
      const provider = new AnthropicProvider({
        model: 'claude-3-5-sonnet',
        apiKey: 'test-key',
      });

      mockFetch.mockResolvedValueOnce(createMockAnthropicResponse('OK'));

      await provider.call([
        { role: 'system', content: 'Be polite' },
        { role: 'user', content: 'Hello' },
      ]);

      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body as string);

      // System should be top-level
      expect(body.system).toBe('Be polite');
      // System should be removed from messages
      expect(body.messages).toHaveLength(1);
      expect(body.messages[0].role).toBe('user');
    });
  });

  describe('Router Fallback', () => {
    it('should try next model if first is unsupported', () => {
      const router = new ModelRouter({ defaultProvider: 'openai' });

      // 'groq/...' throws "not supported" in create(), so createWithFallback should catch it and try next
      // We need to verify that it *doesn't* throw immediately but tries the next one.

      // Mock parsing to ensure first model fails check, second succeeds
      // Note: This relies on internal behavior of create().
      // If we pass a valid provider for the second one, it should succeed.

      const llm = router.createWithFallback(['groq/llama3', 'openai/gpt-4o'], { apiKey: 'test' });

      expect(llm).toBeInstanceOf(OpenAIProvider);
      expect(llm.model).toBe('gpt-4o');
    });
  });

  describe('Tool Execution', () => {
    it('should execute provided function when requested by model', async () => {
      const provider = new OpenAIProvider({
        model: 'gpt-4o',
        apiKey: 'test-key',
      });

      // Mock response requesting a tool call
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'call_123',
            object: 'chat.completion',
            created: Date.now(),
            model: 'gpt-4o',
            choices: [
              {
                index: 0,
                message: {
                  role: 'assistant',
                  content: null,
                  tool_calls: [
                    {
                      id: 'call_abc',
                      type: 'function',
                      function: {
                        name: 'get_weather',
                        arguments: '{"location": "London"}',
                      },
                    },
                  ],
                },
                finish_reason: 'tool_calls',
              },
            ],
            usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
          }),
      });

      const weatherSpy = vi.fn().mockResolvedValue('Sunny, 15C');

      await provider.call([{ role: 'user', content: 'Weather in London?' }], {
        availableFunctions: {
          get_weather: weatherSpy,
        },
      });

      expect(weatherSpy).toHaveBeenCalledTimes(1);
      expect(weatherSpy).toHaveBeenCalledWith({ location: 'London' });
    });
  });

  describe('Error Mapping', () => {
    it('should map OpenAI context length error to LLMContextLengthExceededError', async () => {
      const provider = new OpenAIProvider({
        model: 'gpt-4o',
        apiKey: 'test-key',
      });

      mockFetch.mockResolvedValueOnce({
        ok: false,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              error: {
                message:
                  "This model's maximum context length is 8192 tokens. However, your messages resulted in 9000 tokens.",
                type: 'invalid_request_error',
                code: 'context_length_exceeded',
              },
            }),
          ),
      });

      await expect(provider.call([{ role: 'user', content: 'Huge prompt...' }])).rejects.toThrow(
        LLMContextLengthExceededError,
      );
    });
  });
});
