/**
 * @gerts/core - BaseLLM Abstract Class
 * Phase 21: LLM Abstraction
 *
 * Abstract base class for LLM implementations following CrewAI patterns:
 * - Abstract call() and stream() methods
 * - Event emission for observability
 * - Stop words handling
 * - Token usage tracking
 * - Hook system integration (prepared for Phase 19)
 */

import type { EventBus } from '../event-bus';
import type {
  LLMConfig,
  LLMMessage,
  LLMResponse,
  LLMCallOptions,
  LLMTool,
  TokenUsage,
  UsageMetrics,
  LLMCallStartedEvent,
  LLMCallCompletedEvent,
  LLMCallFailedEvent,
  LLMCallStreamedEvent,
  LLMToolStartedEvent,
  LLMToolCompletedEvent,
  LLMToolFailedEvent,
} from './types';
import {
  getContextWindowSize as getContextWindowFromRegistry,
  supportsVision as supportsVisionFromRegistry,
  supportsReasoning as supportsReasoningFromRegistry,
} from './model-registry';

/** LLM capability flags */
export interface LLMCapabilities {
  /** Supports function/tool calling */
  supportsFunctionCalling: boolean;
  /** Supports stop words/sequences */
  supportsStopWords: boolean;
  /** Supports streaming responses */
  supportsStreaming: boolean;
  /** Supports vision/images */
  supportsVision: boolean;

  // ==================== Structured Output Capabilities ====================

  /**
   * Supports native structured outputs (OpenAI, Anthropic 4.5+, Mistral)
   * Uses `response_format: { type: "json_schema", json_schema: {...} }`
   * with strict mode guaranteeing schema adherence.
   */
  supportsNativeStructuredOutputs: boolean;

  /**
   * Supports JSON schema format (Llama, LMStudio, Gemini)
   * Model understands JSON schema but may not guarantee strict adherence.
   */
  supportsJsonSchemaOutputs: boolean;

  /**
   * Supports basic JSON mode (most models)
   * Uses `response_format: { type: "json_object" }` - valid JSON but no schema.
   */
  supportsJsonMode: boolean;
}

/** @deprecated Use supportsNativeStructuredOutputs instead */
export type LLMCapabilitiesLegacy = LLMCapabilities & {
  supportsStructuredOutputs: boolean;
};

/**
 * Abstract base class for LLM implementations.
 *
 * All LLM providers must extend this class and implement
 * the abstract call() method. Provides common functionality
 * for event emission, stop words handling, and token tracking.
 *
 * @example
 * ```typescript
 * class OpenAIProvider extends BaseLLM {
 *   async call(messages: LLMMessage[], options?: LLMCallOptions): Promise<LLMResponse> {
 *     // Implementation using OpenAI SDK
 *   }
 * }
 * ```
 */
export abstract class BaseLLM {
  /** Model identifier */
  readonly model: string;

  /** Provider name */
  readonly provider: string;

  /** Temperature for sampling */
  protected temperature?: number;

  /** Maximum tokens to generate */
  protected maxTokens?: number;

  /** Stop sequences */
  protected stop: string[];

  /** API key */
  protected apiKey?: string;

  /** Base URL for API */
  protected baseUrl?: string;

  /** Timeout in milliseconds */
  protected timeout: number;

  /** Maximum retries */
  protected maxRetries: number;

  /** Event bus for emitting events */
  protected eventBus?: EventBus;

  /** Internal token usage tracking */
  private _tokenUsage: UsageMetrics = {
    totalTokens: 0,
    promptTokens: 0,
    completionTokens: 0,
    cachedPromptTokens: 0,
    successfulRequests: 0,
  };

  /** Cached context window size */
  private _contextWindowSize = 0;

  constructor(config: LLMConfig & { provider: string; apiKey?: string; baseUrl?: string }, eventBus?: EventBus) {
    if (!config.model) {
      throw new Error('Model name is required and cannot be empty');
    }

    this.model = config.model;
    this.provider = config.provider;
    this.temperature = config.temperature;
    this.maxTokens = config.maxTokens;
    this.timeout = config.timeout ?? 60000;
    this.maxRetries = config.maxRetries ?? 2;
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl;
    this.eventBus = eventBus;

    // Normalize stop sequences
    if (config.stop === undefined || config.stop === null) {
      this.stop = [];
    } else if (typeof config.stop === 'string') {
      this.stop = [config.stop];
    } else {
      this.stop = config.stop;
    }
  }

  /**
   * Call the LLM with the given messages.
   *
   * @param messages - Array of messages to send
   * @param options - Optional call options (tools, response format)
   * @returns LLM response with content and usage
   */
  abstract call(
    messages: LLMMessage[],
    options?: LLMCallOptions
  ): Promise<LLMResponse>;

  /**
   * Stream responses from the LLM.
   *
   * @param messages - Array of messages to send
   * @param options - Optional call options
   * @yields String chunks as they arrive
   */
  async *stream(
    messages: LLMMessage[],
    options?: LLMCallOptions
  ): AsyncGenerator<string, void, unknown> {
    // Default implementation: fall back to non-streaming call
    const response = await this.call(messages, options);
    yield response.content;
  }

  /**
   * Get LLM capabilities.
   * Uses llm-info registry for capabilities like vision and reasoning.
   * Override in subclasses for provider-specific capabilities.
   */
  getCapabilities(): LLMCapabilities {
    return {
      supportsFunctionCalling: true,
      supportsStopWords: true,
      supportsStreaming: true,
      supportsVision: supportsVisionFromRegistry(this.model),
      // Structured output capabilities - override in providers
      supportsNativeStructuredOutputs: false,
      supportsJsonSchemaOutputs: false,
      supportsJsonMode: true,
    };
  }

  /**
   * Check if model supports reasoning (chain-of-thought).
   * Uses llm-info registry.
   */
  supportsReasoning(): boolean {
    return supportsReasoningFromRegistry(this.model);
  }

  /**
   * Get the context window size for this model.
   * Uses llm-info registry for up-to-date model information.
   * Applies 85% ratio to avoid cutoff issues.
   */
  getContextWindowSize(): number {
    if (this._contextWindowSize !== 0) {
      return this._contextWindowSize;
    }

    // Use llm-info registry for accurate context window sizes
    this._contextWindowSize = getContextWindowFromRegistry(this.model);
    return this._contextWindowSize;
  }

  /**
   * Get aggregated token usage metrics.
   */
  getTokenUsage(): UsageMetrics {
    return { ...this._tokenUsage };
  }

  /**
   * Reset token usage counters.
   */
  resetTokenUsage(): void {
    this._tokenUsage = {
      totalTokens: 0,
      promptTokens: 0,
      completionTokens: 0,
      cachedPromptTokens: 0,
      successfulRequests: 0,
    };
  }

  // ==================== Protected Methods ====================

  /**
   * Apply stop words to truncate response content.
   * Native providers should call this method to post-process responses.
   *
   * @param content - Raw response content from the LLM
   * @returns Content truncated at the first occurrence of any stop word
   */
  protected applyStopWords(content: string): string {
    if (this.stop.length === 0 || !content) {
      return content;
    }

    // Find the earliest occurrence of any stop word
    let earliestStopPos = content.length;

    for (const stopWord of this.stop) {
      const stopPos = content.indexOf(stopWord);
      if (stopPos !== -1 && stopPos < earliestStopPos) {
        earliestStopPos = stopPos;
      }
    }

    // Truncate at the stop word if found
    if (earliestStopPos < content.length) {
      return content.slice(0, earliestStopPos).trim();
    }

    return content;
  }

  /**
   * Track token usage internally.
   *
   * @param usage - Token usage data from API response
   */
  protected trackTokenUsage(usage: TokenUsage): void {
    this._tokenUsage.promptTokens += usage.promptTokens;
    this._tokenUsage.completionTokens += usage.completionTokens;
    this._tokenUsage.totalTokens += usage.totalTokens;
    this._tokenUsage.successfulRequests += 1;

    if (usage.cachedPromptTokens) {
      this._tokenUsage.cachedPromptTokens =
        (this._tokenUsage.cachedPromptTokens ?? 0) + usage.cachedPromptTokens;
    }
  }

  /**
   * Emit LLM call started event.
   */
  protected emitCallStarted(messages: LLMMessage[], tools?: LLMTool[]): void {
    if (!this.eventBus) return;

    const event: LLMCallStartedEvent = {
      type: 'llm.call.started',
      timestamp: new Date(),
      model: this.model,
      messages,
      tools,
    };

    this.eventBus.emit('llm.call.started', event);
  }

  /**
   * Emit LLM call completed event.
   */
  protected emitCallCompleted(response: LLMResponse, startTime: number): void {
    if (!this.eventBus) return;

    const event: LLMCallCompletedEvent = {
      type: 'llm.call.completed',
      timestamp: new Date(),
      model: this.model,
      response,
      durationMs: Date.now() - startTime,
    };

    this.eventBus.emit('llm.call.completed', event);
  }

  /**
   * Emit LLM call failed event.
   */
  protected emitCallFailed(error: string, startTime: number): void {
    if (!this.eventBus) return;

    const event: LLMCallFailedEvent = {
      type: 'llm.call.failed',
      timestamp: new Date(),
      model: this.model,
      error,
      durationMs: Date.now() - startTime,
    };

    this.eventBus.emit('llm.call.failed', event);
  }

  /**
   * Emit streaming chunk event.
   */
  protected emitStreamChunk(chunk: string, index: number): void {
    if (!this.eventBus) return;

    const event: LLMCallStreamedEvent = {
      type: 'llm.call.streamed',
      timestamp: new Date(),
      model: this.model,
      chunk,
      index,
    };

    this.eventBus.emit('llm.call.streamed', event);
  }

  /**
   * Emit tool execution started event.
   */
  protected emitToolStarted(toolName: string, toolArgs: Record<string, unknown>): void {
    if (!this.eventBus) return;

    const event: LLMToolStartedEvent = {
      type: 'llm.tool.started',
      timestamp: new Date(),
      model: this.model,
      toolName,
      toolArgs,
    };

    this.eventBus.emit('llm.tool.started', event);
  }

  /**
   * Emit tool execution completed event.
   */
  protected emitToolCompleted(toolName: string, result: unknown, startTime: number): void {
    if (!this.eventBus) return;

    const event: LLMToolCompletedEvent = {
      type: 'llm.tool.completed',
      timestamp: new Date(),
      model: this.model,
      toolName,
      result,
      durationMs: Date.now() - startTime,
    };

    this.eventBus.emit('llm.tool.completed', event);
  }

  /**
   * Emit tool execution failed event.
   */
  protected emitToolFailed(toolName: string, error: string, startTime: number): void {
    if (!this.eventBus) return;

    const event: LLMToolFailedEvent = {
      type: 'llm.tool.failed',
      timestamp: new Date(),
      model: this.model,
      toolName,
      error,
      durationMs: Date.now() - startTime,
    };

    this.eventBus.emit('llm.tool.failed', event);
  }

  /**
   * Handle tool execution with event emission.
   *
   * @param toolName - Name of the tool to execute
   * @param toolArgs - Arguments for the tool
   * @param availableFunctions - Map of available function implementations
   * @returns Tool result or undefined if not found
   */
  protected async handleToolExecution(
    toolName: string,
    toolArgs: Record<string, unknown>,
    availableFunctions: Record<string, (...args: unknown[]) => unknown>
  ): Promise<string | undefined> {
    const fn = availableFunctions[toolName];
    if (!fn) {
      console.warn(`Function '${toolName}' not found in available functions`);
      return undefined;
    }

    const startTime = Date.now();
    this.emitToolStarted(toolName, toolArgs);

    try {
      const result = await fn(toolArgs);
      this.emitToolCompleted(toolName, result, startTime);
      return String(result);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.emitToolFailed(toolName, errorMsg, startTime);
      console.error(`Error executing function '${toolName}':`, errorMsg);
      return undefined;
    }
  }

  /**
   * Format messages for the provider.
   * Override in subclasses if provider requires specific formatting.
   *
   * @param messages - Input messages
   * @returns Formatted messages
   */
  protected formatMessages(messages: LLMMessage[]): LLMMessage[] {
    return messages;
  }
}

/**
 * Error thrown when context window is exceeded.
 */
export class LLMContextLengthExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LLMContextLengthExceededError';
  }
}

/**
 * Error thrown when LLM call fails.
 */
export class LLMCallError extends Error {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly model: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'LLMCallError';
  }
}
