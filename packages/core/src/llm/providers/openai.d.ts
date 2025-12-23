/**
 * @gerts/core - OpenAI LLM Provider
 * Phase 21: LLM Abstraction
 *
 * Native OpenAI SDK integration with:
 * - Streaming support
 * - Function/tool calling
 * - Structured outputs (JSON schema)
 * - Token usage tracking
 */
import type { EventBus } from '../../event-bus';
import { BaseLLM, type LLMCapabilities } from '../base';
import type { LLMConfig, LLMMessage, LLMResponse, LLMCallOptions } from '../types';
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
export declare class OpenAIProvider extends BaseLLM {
    private organization?;
    private project?;
    private reasoningEffort?;
    private isO1Model;
    constructor(config: OpenAIConfig, eventBus?: EventBus);
    /**
     * Get OpenAI-specific capabilities.
     */
    getCapabilities(): LLMCapabilities;
    /**
     * Call OpenAI chat completion API.
     */
    call(messages: LLMMessage[], options?: LLMCallOptions): Promise<LLMResponse>;
    /**
     * Stream responses from OpenAI.
     */
    stream(messages: LLMMessage[], options?: LLMCallOptions): AsyncGenerator<string, void, unknown>;
    private getBaseUrl;
    private getHeaders;
    private formatMessagesForOpenAI;
    private prepareParams;
    private convertTools;
    private makeRequest;
    private mapFinishReason;
    private isContextLengthError;
}
//# sourceMappingURL=openai.d.ts.map