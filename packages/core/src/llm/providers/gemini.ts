/**
 * @gertsai/core - Gemini LLM Provider
 * Phase 21: LLM Abstraction
 *
 * Native Gemini REST integration with:
 * - JSON response mode
 * - Stop sequences
 * - Token usage tracking
 * - Zod validation for API responses
 *
 * Note: Function calling is not yet wired in this provider.
 */

import { z } from 'zod';
import type { EventBus } from '../../event-bus';
import {
  BaseLLM,
  LLMCallError,
  LLMContextLengthExceededError,
  type LLMCapabilities,
} from '../base';
import { validateBaseUrl } from '../base-url-validator';

const GEMINI_DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
import type {
  LLMConfig,
  LLMMessage,
  LLMResponse,
  LLMCallOptions,
  TokenUsage,
  LLMContentBlock,
  JSONSchemaDefinition,
} from '../types';
import { supportsVision as supportsVisionFromRegistry } from '../model-registry';

// ==================== Zod Schemas for API Validation ====================

/** Schema for Gemini API response part */
const GeminiPartSchema = z.object({
  text: z.string().optional(),
});

/** Schema for Gemini API response candidate */
const GeminiCandidateSchema = z.object({
  content: z.object({
    parts: z.array(GeminiPartSchema).optional(),
  }).optional(),
  finishReason: z.string().optional(),
});

/** Schema for Gemini API usage metadata */
const GeminiUsageMetadataSchema = z.object({
  promptTokenCount: z.number().optional(),
  candidatesTokenCount: z.number().optional(),
  totalTokenCount: z.number().optional(),
});

/** Schema for full Gemini API response */
const GeminiGenerateResponseSchema = z.object({
  candidates: z.array(GeminiCandidateSchema).optional(),
  usageMetadata: GeminiUsageMetadataSchema.optional(),
  modelVersion: z.string().optional(),
});

/** Schema for Gemini API error response */
const GeminiErrorResponseSchema = z.object({
  error: z.object({
    code: z.number().optional(),
    message: z.string().optional(),
    status: z.string().optional(),
  }).optional(),
});

/** Inferred type from Zod schema */
type ValidatedGeminiResponse = z.infer<typeof GeminiGenerateResponseSchema>;

/** Gemini-specific configuration */
export interface GeminiConfig extends LLMConfig {
  /** Gemini API key */
  apiKey?: string;
  /** Base URL for API */
  baseUrl?: string;
}

/** Gemini message format */
interface GeminiContent {
  role: 'user' | 'model';
  parts: Array<{ text: string }>;
}

/** Gemini system instruction format */
interface GeminiSystemInstruction {
  parts: Array<{ text: string }>;
}

/** Gemini generation config */
interface GeminiGenerationConfig {
  temperature?: number;
  topP?: number;
  maxOutputTokens?: number;
  stopSequences?: string[];
  responseMimeType?: 'application/json' | 'text/plain';
  responseSchema?: JSONSchemaDefinition;
}

/** Gemini request payload */
interface GeminiGenerateRequest {
  contents: GeminiContent[];
  systemInstruction?: GeminiSystemInstruction;
  generationConfig?: GeminiGenerationConfig;
}

/** Gemini response payload - use ValidatedGeminiResponse from Zod schema */
type GeminiGenerateResponse = ValidatedGeminiResponse;

/**
 * Gemini LLM Provider using Google Generative Language API.
 *
 * @example
 * ```typescript
 * const gemini = new GeminiProvider({
 *   model: 'gemini-1.5-pro',
 *   apiKey: process.env.GEMINI_API_KEY,
 * });
 *
 * const response = await gemini.call([
 *   { role: 'user', content: 'Hello!' }
 * ]);
 * ```
 */
export class GeminiProvider extends BaseLLM {
  constructor(config: GeminiConfig, eventBus?: EventBus) {
    const resolvedApiKey = config.apiKey ?? process.env.GEMINI_API_KEY;
    // Validate baseUrl BEFORE super() (Wave 12.D-fix per EVID-051 S-3 / CWE-918).
    const validatedBaseUrl = validateBaseUrl(config.baseUrl, GEMINI_DEFAULT_BASE_URL, 'Gemini');
    super(
      {
        ...config,
        provider: 'gemini',
        ...(resolvedApiKey !== undefined && { apiKey: resolvedApiKey }),
        baseUrl: validatedBaseUrl,
      },
      eventBus
    );
  }

  /**
   * Get Gemini-specific capabilities.
   */
  override getCapabilities(): LLMCapabilities {
    return {
      supportsFunctionCalling: false,
      supportsStopWords: true,
      supportsStreaming: false,
      supportsVision: supportsVisionFromRegistry(this.model),
      // Gemini supports JSON schema via responseSchema in generationConfig
      supportsNativeStructuredOutputs: false,
      supportsJsonSchemaOutputs: true,
      supportsJsonMode: true,
    };
  }

  /**
   * Call Gemini generateContent API.
   */
  async call(
    messages: LLMMessage[],
    options?: LLMCallOptions
  ): Promise<LLMResponse> {
    const startTime = Date.now();
    this.emitCallStarted(messages, options?.tools);

    try {
      if (!this.apiKey) {
        throw new LLMCallError(
          'Gemini API key is required',
          'gemini',
          this.model
        );
      }

      const { contents, systemInstruction } =
        this.formatMessagesForGemini(messages);
      const params = this.prepareParams(
        contents,
        systemInstruction,
        options
      );

      const response = await this.makeRequest(params);
      const content = this.extractText(response);
      const processedContent = this.applyStopWords(content);

      const usage: TokenUsage = {
        promptTokens: response.usageMetadata?.promptTokenCount ?? 0,
        completionTokens:
          response.usageMetadata?.candidatesTokenCount ?? 0,
        totalTokens: response.usageMetadata?.totalTokenCount ?? 0,
      };

      const mappedFinishReason = this.mapFinishReason(
        response.candidates?.[0]?.finishReason
      );
      const llmResponse: LLMResponse = {
        content: processedContent,
        usage,
        model: response.modelVersion ?? this.model,
        ...(mappedFinishReason !== undefined && { finishReason: mappedFinishReason }),
      };

      this.trackTokenUsage(usage);
      this.emitCallCompleted(llmResponse, startTime);
      return llmResponse;
    } catch (error) {
      // Re-throw known error types without wrapping
      if (error instanceof LLMCallError || error instanceof LLMContextLengthExceededError) {
        throw error;
      }

      const message =
        error instanceof Error ? error.message : String(error);

      this.emitCallFailed(message, startTime);

      if (this.isContextLengthError(error)) {
        throw new LLMContextLengthExceededError(message);
      }

      throw new LLMCallError(message, 'gemini', this.model, error);
    }
  }

  private formatMessagesForGemini(messages: LLMMessage[]): {
    contents: GeminiContent[];
    systemInstruction?: GeminiSystemInstruction;
  } {
    const systemParts: string[] = [];
    const contents: GeminiContent[] = [];

    for (const message of messages) {
      const text = this.coerceText(message.content);
      if (!text) continue;

      if (message.role === 'system') {
        systemParts.push(text);
        continue;
      }

      const role = message.role === 'assistant' ? 'model' : 'user';
      const contentText =
        message.role === 'tool'
          ? this.formatToolResult(message.name, text)
          : text;

      contents.push({ role, parts: [{ text: contentText }] });
    }

    if (contents.length === 0) {
      contents.push({ role: 'user', parts: [{ text: 'Hello' }] });
    }

    const systemInstruction =
      systemParts.length > 0
        ? { parts: [{ text: systemParts.join('\n\n') }] }
        : undefined;

    return {
      contents,
      ...(systemInstruction !== undefined && { systemInstruction }),
    };
  }

  private prepareParams(
    contents: GeminiContent[],
    systemInstruction: GeminiSystemInstruction | undefined,
    options?: LLMCallOptions
  ): GeminiGenerateRequest {
    const params: GeminiGenerateRequest = { contents };

    if (systemInstruction) {
      params.systemInstruction = systemInstruction;
    }

    const generationConfig: GeminiGenerationConfig = {};

    if (this.temperature !== undefined) {
      generationConfig.temperature = this.temperature;
    }

    if (this.maxTokens !== undefined) {
      generationConfig.maxOutputTokens = this.maxTokens;
    }

    if (this.stop.length > 0) {
      generationConfig.stopSequences = this.stop;
    }

    if (options?.responseFormat) {
      if (options.responseFormat.type === 'text') {
        generationConfig.responseMimeType = 'text/plain';
      } else {
        generationConfig.responseMimeType = 'application/json';
        if (
          options.responseFormat.type === 'json_schema' &&
          options.responseFormat.jsonSchema
        ) {
          generationConfig.responseSchema =
            options.responseFormat.jsonSchema.schema;
        }
      }
    }

    if (Object.keys(generationConfig).length > 0) {
      params.generationConfig = generationConfig;
    }

    return params;
  }

  private async makeRequest(
    params: GeminiGenerateRequest
  ): Promise<GeminiGenerateResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(
        `${this.getBaseUrl()}/models/${this.model}:generateContent`,
        {
          method: 'POST',
          headers: this.getHeaders(),
          body: JSON.stringify(params),
          signal: controller.signal,
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        // Try to parse structured error
        let errorMessage = errorText;
        try {
          const parsed = JSON.parse(errorText);
          const errorParsed = GeminiErrorResponseSchema.safeParse(parsed);
          if (errorParsed.success && errorParsed.data.error?.message) {
            errorMessage = errorParsed.data.error.message;
          }
        } catch {
          // Keep original error text if JSON parsing fails
        }
        throw new Error(
          `Gemini API error: ${response.status} - ${errorMessage}`
        );
      }

      const json = await response.json();

      // Validate response with Zod schema
      const validated = GeminiGenerateResponseSchema.safeParse(json);
      if (!validated.success) {
        throw new LLMCallError(
          `Invalid Gemini API response: ${validated.error.message}`,
          'gemini',
          this.model
        );
      }

      return validated.data;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'x-goog-api-key': this.apiKey ?? '',
    };
  }

  private getBaseUrl(): string {
    return (this.baseUrl ?? GEMINI_DEFAULT_BASE_URL).replace(/\/$/, '');
  }

  private extractText(response: GeminiGenerateResponse): string {
    const parts = response.candidates?.[0]?.content?.parts ?? [];
    return parts.map((part) => part.text ?? '').join('');
  }

  private mapFinishReason(
    reason: string | undefined
  ): LLMResponse['finishReason'] {
    switch (reason) {
      case 'STOP':
        return 'stop';
      case 'MAX_TOKENS':
        return 'length';
      case 'SAFETY':
      case 'RECITATION':
        return 'content_filter';
      default:
        return 'stop';
    }
  }

  /** Supported content block types */
  private static readonly SUPPORTED_BLOCK_TYPES = new Set(['text', 'tool_result']);

  private coerceText(content: string | LLMContentBlock[]): string {
    if (typeof content === 'string') {
      return content;
    }

    const texts: string[] = [];

    for (const block of content) {
      if (block.type === 'text' && block.text) {
        texts.push(block.text);
      } else if (block.type === 'tool_result' && block.content) {
        texts.push(block.content);
      } else if (!GeminiProvider.SUPPORTED_BLOCK_TYPES.has(block.type)) {
        // Explicitly reject unsupported block types
        throw new LLMCallError(
          `Unsupported content block type: ${block.type}. Gemini provider only supports: ${[...GeminiProvider.SUPPORTED_BLOCK_TYPES].join(', ')}`,
          'gemini',
          this.model
        );
      }
      // Empty text/tool_result blocks are silently skipped
    }

    return texts.join('\n');
  }

  private formatToolResult(name: string | undefined, text: string): string {
    const toolName = name ? ` (${name})` : '';
    return `Tool result${toolName}: ${text}`;
  }

  private isContextLengthError(error: unknown): boolean {
    if (error instanceof Error) {
      const msg = error.message.toLowerCase();
      // More specific detection to avoid false positives
      return (
        msg.includes('maximum context') ||
        msg.includes('context length') ||
        msg.includes('token limit') ||
        msg.includes('exceeds the maximum') ||
        (msg.includes('resource_exhausted') && msg.includes('token'))
      );
    }
    return false;
  }
}
