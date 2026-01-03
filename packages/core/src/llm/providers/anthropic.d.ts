/**
 * @gerts/core - Anthropic LLM Provider
 * Phase 21: LLM Abstraction
 *
 * Native Anthropic SDK integration with:
 * - Streaming support
 * - Tool use
 * - Extended thinking mode
 * - System message handling (Anthropic-specific)
 */
import type { EventBus } from '../../event-bus';
import { BaseLLM, type LLMCapabilities } from '../base';
import type { LLMConfig, LLMMessage, LLMResponse, LLMCallOptions } from '../types';
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
export declare class AnthropicProvider extends BaseLLM {
    private topP?;
    private topK?;
    private thinking?;
    private previousThinkingBlocks;
    constructor(config: AnthropicConfig, eventBus?: EventBus);
    /**
     * Get Anthropic-specific capabilities.
     */
    getCapabilities(): LLMCapabilities;
    /**
     * Call Anthropic messages API.
     */
    call(messages: LLMMessage[], options?: LLMCallOptions): Promise<LLMResponse>;
    /**
     * Stream responses from Anthropic.
     */
    stream(messages: LLMMessage[], options?: LLMCallOptions): AsyncGenerator<string, void, unknown>;
    private getBaseUrl;
    private getHeaders;
    /**
     * Format messages for Anthropic API.
     *
     * Anthropic has specific requirements:
     * - System messages are separate from conversation
     * - Messages must alternate between user and assistant
     * - First message must be from user
     */
    private formatMessagesForAnthropic;
    private prepareParams;
    private convertTools;
    private makeRequest;
    private mapStopReason;
    private isContextLengthError;
}
//# sourceMappingURL=anthropic.d.ts.map