/**
 * @gertsai/core - OpenAI LLM Provider
 * Phase 21: LLM Abstraction
 *
 * Native OpenAI SDK integration with:
 * - Streaming support
 * - Function/tool calling
 * - Structured outputs (JSON schema)
 * - Token usage tracking
 */

import type { EventBus } from '../../event-bus';
import {
  BaseLLM,
  LLMCallError,
  LLMContextLengthExceededError,
  type LLMCapabilities,
} from '../base';
import type {
  LLMConfig,
  LLMMessage,
  LLMResponse,
  LLMCallOptions,
  LLMTool,
  TokenUsage,
  JSONSchemaDefinition,
} from '../types';

/** OpenAI-specific configuration */
export interface OpenAIConfig extends LLMConfig {
  /** OpenAI API key */
  apiKey?: string;
  /** Base URL for API (for proxies) */
  baseUrl?: string;
  /** Organization ID */
  organization?: string;
  /** Project ID */
  project?: string;
  /** Reasoning effort for o1 models */
  reasoningEffort?: 'low' | 'medium' | 'high';
}

/** OpenAI message format */
interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_call_id?: string;
  tool_calls?: OpenAIToolCall[];
  name?: string;
}

/** OpenAI tool call format */
interface OpenAIToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

/** OpenAI tool format */
interface OpenAITool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: JSONSchemaDefinition;
  };
}

/** OpenAI completion response */
interface OpenAICompletion {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string | null;
      tool_calls?: OpenAIToolCall[];
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/** OpenAI streaming chunk */
interface OpenAIStreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string;
      tool_calls?: Partial<OpenAIToolCall>[];
    };
    finish_reason: string | null;
  }>;
}

/**
 * OpenAI LLM Provider using native SDK patterns.
 *
 * Supports GPT-4, GPT-4o, O1, and other OpenAI models with:
 * - Chat completions API
 * - Streaming responses
 * - Function/tool calling
 * - Structured outputs
 *
 * @example
 * ```typescript
 * const openai = new OpenAIProvider({
 *   model: 'gpt-4o',
 *   apiKey: process.env.OPENAI_API_KEY,
 *   temperature: 0.7,
 * });
 *
 * const response = await openai.call([
 *   { role: 'user', content: 'Hello!' }
 * ]);
 * ```
 */
export class OpenAIProvider extends BaseLLM {
  private organization?: string;
  private project?: string;
  private reasoningEffort?: 'low' | 'medium' | 'high';
  private isO1Model: boolean;

  constructor(config: OpenAIConfig, eventBus?: EventBus) {
    super(
      {
        ...config,
        provider: 'openai',
        apiKey: config.apiKey ?? process.env.OPENAI_API_KEY,
      },
      eventBus,
    );

    this.organization = config.organization;
    this.project = config.project;
    this.reasoningEffort = config.reasoningEffort;
    this.isO1Model =
      config.model.toLowerCase().includes('o1') || config.model.toLowerCase().includes('o3');
  }

  /**
   * Get OpenAI-specific capabilities.
   */
  override getCapabilities(): LLMCapabilities {
    return {
      // O1 models don't support function calling
      supportsFunctionCalling: !this.isO1Model,
      // O1 models don't support stop words
      supportsStopWords: !this.isO1Model,
      supportsStreaming: true,
      supportsVision: this.model.includes('gpt-4o') || this.model.includes('gpt-4-turbo'),
      // OpenAI has full native structured output support
      supportsNativeStructuredOutputs: true,
      supportsJsonSchemaOutputs: true,
      supportsJsonMode: true,
    };
  }

  /**
   * Call OpenAI chat completion API.
   */
  async call(messages: LLMMessage[], options?: LLMCallOptions): Promise<LLMResponse> {
    const startTime = Date.now();
    this.emitCallStarted(messages, options?.tools);

    try {
      const formattedMessages = this.formatMessagesForOpenAI(messages);
      const params = this.prepareParams(formattedMessages, options);

      if (!this.apiKey) {
        throw new LLMCallError('OpenAI API key is required', 'openai', this.model);
      }

      const response = await this.makeRequest(params);

      const content = response.choices[0]?.message?.content ?? '';
      const processedContent = this.applyStopWords(content);

      const usage: TokenUsage = {
        promptTokens: response.usage.prompt_tokens,
        completionTokens: response.usage.completion_tokens,
        totalTokens: response.usage.total_tokens,
      };

      this.trackTokenUsage(usage);

      const llmResponse: LLMResponse = {
        content: processedContent,
        usage,
        model: response.model,
        finishReason: this.mapFinishReason(response.choices[0]?.finish_reason),
        toolCalls: response.choices[0]?.message?.tool_calls?.map((tc) => ({
          id: tc.id,
          type: tc.type,
          function: {
            name: tc.function.name,
            arguments: tc.function.arguments,
          },
        })),
      };

      // Handle tool calls if present and available functions provided
      if (llmResponse.toolCalls && options?.availableFunctions) {
        for (const toolCall of llmResponse.toolCalls) {
          const args = JSON.parse(toolCall.function.arguments);
          await this.handleToolExecution(toolCall.function.name, args, options.availableFunctions);
        }
      }

      this.emitCallCompleted(llmResponse, startTime);
      return llmResponse;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.emitCallFailed(errorMsg, startTime);

      if (this.isContextLengthError(error)) {
        throw new LLMContextLengthExceededError(`Context window exceeded for model ${this.model}`);
      }

      throw new LLMCallError(`OpenAI API call failed: ${errorMsg}`, 'openai', this.model, error);
    }
  }

  /**
   * Stream responses from OpenAI.
   */
  override async *stream(
    messages: LLMMessage[],
    options?: LLMCallOptions,
  ): AsyncGenerator<string, void, unknown> {
    const startTime = Date.now();
    this.emitCallStarted(messages, options?.tools);

    try {
      const formattedMessages = this.formatMessagesForOpenAI(messages);
      const params = this.prepareParams(formattedMessages, options);
      params.stream = true;

      if (!this.apiKey) {
        throw new LLMCallError('OpenAI API key is required', 'openai', this.model);
      }

      const response = await fetch(`${this.getBaseUrl()}/chat/completions`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(params),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenAI API error: ${response.status} - ${error}`);
      }

      if (!response.body) {
        throw new Error('No response body for streaming');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let chunkIndex = 0;
      let fullContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const chunk: OpenAIStreamChunk = JSON.parse(data);
              const content = chunk.choices[0]?.delta?.content;

              if (content) {
                fullContent += content;
                this.emitStreamChunk(content, chunkIndex++);
                yield content;
              }
            } catch {
              // Skip malformed JSON
            }
          }
        }
      }

      // Emit completion event with estimated usage
      const llmResponse: LLMResponse = {
        content: this.applyStopWords(fullContent),
        usage: {
          promptTokens: 0, // Not available in streaming
          completionTokens: 0,
          totalTokens: 0,
        },
        model: this.model,
        finishReason: 'stop',
      };

      this.emitCallCompleted(llmResponse, startTime);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.emitCallFailed(errorMsg, startTime);
      throw new LLMCallError(`OpenAI streaming failed: ${errorMsg}`, 'openai', this.model, error);
    }
  }

  // ==================== Private Methods ====================

  private getBaseUrl(): string {
    return this.baseUrl ?? 'https://api.openai.com/v1';
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.apiKey}`,
    };

    if (this.organization) {
      headers['OpenAI-Organization'] = this.organization;
    }

    if (this.project) {
      headers['OpenAI-Project'] = this.project;
    }

    return headers;
  }

  private formatMessagesForOpenAI(messages: LLMMessage[]): OpenAIMessage[] {
    return messages.map((msg) => {
      const formatted: OpenAIMessage = {
        role: msg.role as OpenAIMessage['role'],
        content: typeof msg.content === 'string' ? msg.content : null,
      };

      if (msg.toolCallId) {
        formatted.tool_call_id = msg.toolCallId;
      }

      if (msg.name) {
        formatted.name = msg.name;
      }

      return formatted;
    });
  }

  private prepareParams(
    messages: OpenAIMessage[],
    options?: LLMCallOptions,
  ): Record<string, unknown> {
    const params: Record<string, unknown> = {
      model: this.model,
      messages,
    };

    // Temperature (not supported for O1 models)
    if (this.temperature !== undefined && !this.isO1Model) {
      params.temperature = this.temperature;
    }

    // Max tokens
    if (this.maxTokens !== undefined) {
      // O1 models use max_completion_tokens
      if (this.isO1Model) {
        params.max_completion_tokens = this.maxTokens;
      } else {
        params.max_tokens = this.maxTokens;
      }
    }

    // Stop sequences (not supported for O1 models)
    if (this.stop.length > 0 && !this.isO1Model) {
      params.stop = this.stop;
    }

    // Reasoning effort for O1 models
    if (this.isO1Model && this.reasoningEffort) {
      params.reasoning_effort = this.reasoningEffort;
    }

    // Tools (not supported for O1 models)
    if (options?.tools && !this.isO1Model) {
      params.tools = this.convertTools(options.tools);
    }

    // Response format
    if (options?.responseFormat) {
      if (options.responseFormat.type === 'json_schema' && options.responseFormat.jsonSchema) {
        params.response_format = {
          type: 'json_schema',
          json_schema: {
            name: options.responseFormat.jsonSchema.name,
            schema: options.responseFormat.jsonSchema.schema,
            strict: options.responseFormat.jsonSchema.strict ?? true,
          },
        };
      } else {
        params.response_format = { type: options.responseFormat.type };
      }
    }

    return params;
  }

  private convertTools(tools: LLMTool[]): OpenAITool[] {
    return tools.map((tool) => ({
      type: 'function',
      function: {
        name: tool.function.name,
        description: tool.function.description,
        parameters: tool.function.parameters,
      },
    }));
  }

  private async makeRequest(params: Record<string, unknown>): Promise<OpenAICompletion> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.getBaseUrl()}/chat/completions`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(params),
        signal: controller.signal,
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenAI API error: ${response.status} - ${error}`);
      }

      return (await response.json()) as OpenAICompletion;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private mapFinishReason(reason: string | undefined): LLMResponse['finishReason'] {
    switch (reason) {
      case 'stop':
        return 'stop';
      case 'length':
        return 'length';
      case 'tool_calls':
        return 'tool_calls';
      case 'content_filter':
        return 'content_filter';
      default:
        return 'stop';
    }
  }

  private isContextLengthError(error: unknown): boolean {
    if (error instanceof Error) {
      const msg = error.message.toLowerCase();
      return (
        msg.includes('context_length_exceeded') ||
        msg.includes('maximum context length') ||
        msg.includes('tokens')
      );
    }
    return false;
  }
}
