/**
 * @gertsai/core - Anthropic LLM Provider
 * Phase 21: LLM Abstraction
 *
 * Native Anthropic SDK integration with:
 * - Streaming support
 * - Tool use
 * - Extended thinking mode
 * - System message handling (Anthropic-specific)
 */

import type { EventBus } from '../../event-bus';
import { BaseLLM, LLMCallError, type LLMCapabilities } from '../base';
import { validateBaseUrl } from '../base-url-validator';

const ANTHROPIC_DEFAULT_BASE_URL = 'https://api.anthropic.com/v1';

/**
 * Wave 13.C (PRD-047 / EVID-059 §L FR-004): cap raw upstream response bodies
 * before interpolating them into error messages. Prevents megabyte-sized
 * HTML/JSON payloads (or accidental PII leaks) from being logged verbatim.
 */
function truncateForError(text: string, maxBytes = 500): string {
  if (text.length <= maxBytes) return text;
  return `${text.slice(0, maxBytes)}... [truncated, ${text.length} chars total]`;
}
import type {
  LLMConfig,
  LLMMessage,
  LLMResponse,
  LLMCallOptions,
  LLMTool,
  TokenUsage,
  JSONSchemaDefinition,
} from '../types';

/** Anthropic-specific configuration */
export interface AnthropicConfig extends LLMConfig {
  /** Anthropic API key */
  apiKey?: string;
  /** Base URL for API */
  baseUrl?: string;
  /** Top-p sampling */
  topP?: number;
  /** Top-k sampling */
  topK?: number;
  /** Extended thinking configuration */
  thinking?: AnthropicThinkingConfig;
}

/** Configuration for Anthropic extended thinking mode */
export interface AnthropicThinkingConfig {
  /** Type of thinking mode */
  type: 'enabled';
  /** Budget tokens for thinking */
  budgetTokens?: number;
}

/** Anthropic message format */
interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | AnthropicContentBlock[];
}

/** Anthropic content block */
interface AnthropicContentBlock {
  type: 'text' | 'tool_use' | 'tool_result' | 'thinking' | 'redacted_thinking';
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string;
  thinking?: string;
  signature?: string;
}

/** Anthropic tool format */
interface AnthropicTool {
  name: string;
  description: string;
  input_schema: JSONSchemaDefinition;
}

/** Anthropic API response */
interface AnthropicCompletion {
  id: string;
  type: string;
  role: string;
  content: AnthropicContentBlock[];
  model: string;
  stop_reason: string;
  stop_sequence: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

/** Anthropic streaming event */
interface AnthropicStreamEvent {
  type: string;
  index?: number;
  message?: Partial<AnthropicCompletion>;
  content_block?: AnthropicContentBlock;
  delta?: {
    type: string;
    text?: string;
    partial_json?: string;
  };
  usage?: {
    output_tokens: number;
  };
}

/**
 * Anthropic LLM Provider using native SDK patterns.
 *
 * Supports Claude 3.5, Claude 3, and Claude 2 models with:
 * - Messages API
 * - Streaming responses
 * - Tool use
 * - Extended thinking mode
 *
 * @example
 * ```typescript
 * const anthropic = new AnthropicProvider({
 *   model: 'claude-3-5-sonnet-20241022',
 *   apiKey: process.env.ANTHROPIC_API_KEY,
 *   maxTokens: 4096,
 * });
 *
 * const response = await anthropic.call([
 *   { role: 'user', content: 'Hello!' }
 * ]);
 * ```
 */
/**
 * Metadata key for caller-supplied previous-turn thinking blocks.
 *
 * CRIT-1 (EVID-059 fix, Wave 13.A): previously the provider cached the
 * last response's thinking blocks on instance state (`this.previousThinkingBlocks`),
 * which leaked one tenant's chain-of-thought into the next tenant's prompt
 * when the provider was pooled (e.g. via `ModelRouter`'s module-level singleton).
 *
 * The state has been removed. Callers that need to thread extended-thinking
 * blocks across turns must now pass them explicitly per call via
 * `options.metadata[ANTHROPIC_PREVIOUS_THINKING_BLOCKS_KEY]`. This makes the
 * cross-call dependency explicit and contains thinking-block lifetime to the
 * caller's own session/tenant scope.
 */
export const ANTHROPIC_PREVIOUS_THINKING_BLOCKS_KEY =
  '__gertsai_anthropic_previous_thinking_blocks__' as const;

export class AnthropicProvider extends BaseLLM {
  private topP?: number;
  private topK?: number;
  private thinking?: AnthropicThinkingConfig;

  constructor(config: AnthropicConfig, eventBus?: EventBus) {
    const resolvedApiKey = config.apiKey ?? process.env.ANTHROPIC_API_KEY;
    // Validate baseUrl BEFORE super() (Wave 12.D-fix per EVID-051 S-3 / CWE-918).
    const validatedBaseUrl = validateBaseUrl(
      config.baseUrl,
      ANTHROPIC_DEFAULT_BASE_URL,
      'Anthropic',
    );
    super(
      {
        ...config,
        provider: 'anthropic',
        ...(resolvedApiKey !== undefined && { apiKey: resolvedApiKey }),
        baseUrl: validatedBaseUrl,
        // Anthropic requires max_tokens, default to 4096
        maxTokens: config.maxTokens ?? 4096,
      },
      eventBus
    );

    if (config.topP !== undefined) this.topP = config.topP;
    if (config.topK !== undefined) this.topK = config.topK;
    if (config.thinking !== undefined) this.thinking = config.thinking;
  }

  /**
   * Get Anthropic-specific capabilities.
   */
  override getCapabilities(): LLMCapabilities {
    // Claude 4.5+ models support native structured outputs
    const isNewModel = this.model.includes('claude-sonnet-4') ||
                       this.model.includes('claude-3-5-sonnet') ||
                       this.model.includes('claude-opus-4');
    return {
      supportsFunctionCalling: true,
      supportsStopWords: true,
      supportsStreaming: true,
      supportsVision: true,
      // Newer Claude models have native support, older use tool-based approach
      supportsNativeStructuredOutputs: isNewModel,
      supportsJsonSchemaOutputs: isNewModel,
      supportsJsonMode: true,
    };
  }

  /**
   * Call Anthropic messages API.
   */
  async call(
    messages: LLMMessage[],
    options?: LLMCallOptions
  ): Promise<LLMResponse> {
    const startTime = Date.now();
    this.emitCallStarted(messages, options?.tools);

    try {
      // CRIT-1 (EVID-059): previous-turn thinking blocks are now caller-supplied
      // per call (no instance state). See ANTHROPIC_PREVIOUS_THINKING_BLOCKS_KEY.
      const previousThinkingBlocks = this.extractPreviousThinkingBlocks(options);
      const { formattedMessages, systemMessage } = this.formatMessagesForAnthropic(
        messages,
        previousThinkingBlocks,
      );
      const params = this.prepareParams(formattedMessages, systemMessage, options);

      if (!this.apiKey) {
        throw new LLMCallError(
          'Anthropic API key is required',
          'anthropic',
          this.model
        );
      }

      const response = await this.makeRequest(params);

      // Extract text content
      const textBlocks = response.content.filter(
        (block) => block.type === 'text'
      );
      const content = textBlocks.map((block) => block.text ?? '').join('');
      const processedContent = this.applyStopWords(content);

      // NOTE (CRIT-1, EVID-059): instance-level caching of `thinking` /
      // `redacted_thinking` blocks was removed to prevent cross-tenant
      // chain-of-thought leakage when the provider is pooled. Callers that
      // need multi-turn extended thinking must extract blocks from
      // `response.content` themselves (out of this provider's hot path) and
      // re-supply them on the next call via
      // `options.metadata[ANTHROPIC_PREVIOUS_THINKING_BLOCKS_KEY]`.

      const usage: TokenUsage = {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      };

      this.trackTokenUsage(usage);

      // Extract tool use blocks
      const toolUseBlocks = response.content.filter(
        (block) => block.type === 'tool_use'
      );

      const llmResponse: LLMResponse = {
        content: processedContent,
        usage,
        model: response.model,
        finishReason: this.mapStopReason(response.stop_reason),
        toolCalls: toolUseBlocks.map((block) => ({
          id: block.id ?? '',
          type: 'function' as const,
          function: {
            name: block.name ?? '',
            arguments: JSON.stringify(block.input ?? {}),
          },
        })),
      };

      // Handle tool calls if present and available functions provided
      if (llmResponse.toolCalls && llmResponse.toolCalls.length > 0 && options?.availableFunctions) {
        for (const toolCall of llmResponse.toolCalls) {
          // H-10 (EVID-059): symmetric with OpenAIProvider — skip + report
          // malformed arguments instead of throwing mid-loop and leaking the
          // raw model payload through the surrounding catch.
          let args: Record<string, unknown>;
          try {
            const parsed: unknown = JSON.parse(toolCall.function.arguments);
            if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
              throw new SyntaxError('Tool arguments did not decode to a plain object');
            }
            args = parsed as Record<string, unknown>;
          } catch (parseError) {
            const errorMsg =
              parseError instanceof Error ? parseError.message : String(parseError);
            this.emitToolFailed(
              toolCall.function.name,
              `Malformed tool arguments: ${errorMsg}`,
              Date.now(),
            );
            console.warn('Skipping tool call with malformed JSON arguments', {
              toolName: toolCall.function.name,
              error: errorMsg,
            });
            continue;
          }
          await this.handleToolExecution(
            toolCall.function.name,
            args,
            options.availableFunctions
          );
        }
      }

      this.emitCallCompleted(llmResponse, startTime);
      return llmResponse;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.emitCallFailed(errorMsg, startTime);

      if (this.isContextLengthError(error)) {
        throw new LLMCallError(
          `Context window exceeded for model ${this.model}`,
          'anthropic',
          this.model,
          error
        );
      }

      throw new LLMCallError(
        `Anthropic API call failed: ${errorMsg}`,
        'anthropic',
        this.model,
        error
      );
    }
  }

  /**
   * Stream responses from Anthropic.
   */
  override async *stream(
    messages: LLMMessage[],
    options?: LLMCallOptions
  ): AsyncGenerator<string, void, unknown> {
    const startTime = Date.now();
    this.emitCallStarted(messages, options?.tools);

    try {
      const { formattedMessages, systemMessage } = this.formatMessagesForAnthropic(messages);
      const params = this.prepareParams(formattedMessages, systemMessage, options);
      params.stream = true;

      if (!this.apiKey) {
        throw new LLMCallError(
          'Anthropic API key is required',
          'anthropic',
          this.model
        );
      }

      const response = await fetch(`${this.getBaseUrl()}/messages`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(params),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Anthropic API error: ${response.status} - ${truncateForError(error)}`);
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

            try {
              const event: AnthropicStreamEvent = JSON.parse(data);

              if (event.type === 'content_block_delta' && event.delta?.text) {
                const text = event.delta.text;
                fullContent += text;
                this.emitStreamChunk(text, chunkIndex++);
                yield text;
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
      throw new LLMCallError(
        `Anthropic streaming failed: ${errorMsg}`,
        'anthropic',
        this.model,
        error
      );
    }
  }

  // ==================== Private Methods ====================

  private getBaseUrl(): string {
    return this.baseUrl ?? ANTHROPIC_DEFAULT_BASE_URL;
  }

  private getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'x-api-key': this.apiKey ?? '',
      'anthropic-version': '2023-06-01',
    };
  }

  /**
   * Format messages for Anthropic API.
   *
   * Anthropic has specific requirements:
   * - System messages are separate from conversation
   * - Messages must alternate between user and assistant
   * - First message must be from user
   */
  /**
   * Extract caller-supplied previous-turn thinking blocks from request metadata.
   *
   * CRIT-1 fix: previously cached on `this.previousThinkingBlocks` (instance
   * state). Now sourced per-call from `options.metadata` so that pooled
   * providers cannot leak one tenant's chain-of-thought into another's prompt.
   *
   * Defensive: only accepts an array of objects with the expected
   * Anthropic content-block shape. Unknown shapes are dropped silently
   * (a malformed metadata field must not become a prompt-injection vector).
   */
  private extractPreviousThinkingBlocks(
    options?: LLMCallOptions,
  ): AnthropicContentBlock[] {
    const raw = options?.metadata?.[ANTHROPIC_PREVIOUS_THINKING_BLOCKS_KEY];
    if (!Array.isArray(raw)) return [];

    const out: AnthropicContentBlock[] = [];
    for (const item of raw) {
      if (item && typeof item === 'object') {
        const candidate = item as { type?: unknown };
        if (
          candidate.type === 'thinking' ||
          candidate.type === 'redacted_thinking'
        ) {
          out.push(item as AnthropicContentBlock);
        }
      }
    }
    return out;
  }

  private formatMessagesForAnthropic(
    messages: LLMMessage[],
    previousThinkingBlocks: AnthropicContentBlock[] = [],
  ): {
    formattedMessages: AnthropicMessage[];
    systemMessage: string | null;
  } {
    const formattedMessages: AnthropicMessage[] = [];
    let systemMessage: string | null = null;

    for (const message of messages) {
      if (message.role === 'system') {
        // Combine system messages
        if (systemMessage) {
          systemMessage += `\n\n${message.content}`;
        } else {
          systemMessage = typeof message.content === 'string' ? message.content : '';
        }
      } else if (message.role === 'tool') {
        // Convert tool response to user message with tool_result content
        formattedMessages.push({
          role: 'user',
          content: [
            {
              type: 'tool_result',
              ...(message.toolCallId !== undefined && { tool_use_id: message.toolCallId }),
              content: typeof message.content === 'string' ? message.content : '',
            },
          ],
        });
      } else {
        const role = message.role === 'user' ? 'user' : 'assistant';
        const content = typeof message.content === 'string' ? message.content : '';

        // For assistant messages with thinking enabled, include caller-supplied
        // thinking blocks (per-call only — no instance state per CRIT-1 fix).
        if (role === 'assistant' && this.thinking && previousThinkingBlocks.length > 0) {
          formattedMessages.push({
            role,
            content: [
              ...previousThinkingBlocks,
              { type: 'text', text: content },
            ],
          });
        } else {
          formattedMessages.push({ role, content });
        }
      }
    }

    // H-11 (EVID-059): Anthropic requires the conversation to start with a
    // `user` turn. Previously the provider silently fabricated `{role:'user',
    // content:'Hello'}` when (a) the transformed array was empty, or (b) the
    // first message was an assistant turn. The model then "saw" content the
    // caller never supplied — unacceptable for regulated / audited domains and
    // a silent source of hallucinated context elsewhere. Fail loud instead;
    // callers must hand us a real opening user turn.
    if (formattedMessages.length === 0 || formattedMessages[0]!.role !== 'user') {
      throw new Error(
        'AnthropicProvider: empty or assistant-led conversation — ' +
          'caller must supply at least one user message as the first turn',
      );
    }

    return { formattedMessages, systemMessage };
  }

  private prepareParams(
    messages: AnthropicMessage[],
    systemMessage: string | null,
    options?: LLMCallOptions
  ): Record<string, unknown> {
    const params: Record<string, unknown> = {
      model: this.model,
      messages,
      max_tokens: this.maxTokens,
    };

    // Add system message if present
    if (systemMessage) {
      params.system = systemMessage;
    }

    // Temperature
    if (this.temperature !== undefined) {
      params.temperature = this.temperature;
    }

    // Top-p
    if (this.topP !== undefined) {
      params.top_p = this.topP;
    }

    // Top-k
    if (this.topK !== undefined) {
      params.top_k = this.topK;
    }

    // Stop sequences
    if (this.stop.length > 0) {
      params.stop_sequences = this.stop;
    }

    // Tools
    if (options?.tools) {
      params.tools = this.convertTools(options.tools);
    }

    // Extended thinking
    if (this.thinking) {
      params.thinking = this.thinking;
    }

    return params;
  }

  private convertTools(tools: LLMTool[]): AnthropicTool[] {
    return tools.map((tool) => ({
      name: tool.function.name,
      description: tool.function.description,
      input_schema: tool.function.parameters,
    }));
  }

  private async makeRequest(params: Record<string, unknown>): Promise<AnthropicCompletion> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.getBaseUrl()}/messages`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(params),
        signal: controller.signal,
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Anthropic API error: ${response.status} - ${truncateForError(error)}`);
      }

      return (await response.json()) as AnthropicCompletion;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private mapStopReason(reason: string): Exclude<LLMResponse['finishReason'], undefined> {
    switch (reason) {
      case 'end_turn':
      case 'stop_sequence':
        return 'stop';
      case 'max_tokens':
        return 'length';
      case 'tool_use':
        return 'tool_calls';
      default:
        return 'stop';
    }
  }

  private isContextLengthError(error: unknown): boolean {
    if (error instanceof Error) {
      const msg = error.message.toLowerCase();
      return (
        msg.includes('context_length') ||
        msg.includes('token') ||
        msg.includes('too long')
      );
    }
    return false;
  }
}
