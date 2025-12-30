/**
 * @gerts/core - Gemini LLM Provider
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
import type { EventBus } from '../../event-bus';
import { BaseLLM, type LLMCapabilities } from '../base';
import type { LLMConfig, LLMMessage, LLMResponse, LLMCallOptions } from '../types';
/** Gemini-specific configuration */
export interface GeminiConfig extends LLMConfig {
    /** Gemini API key */
    apiKey?: string;
    /** Base URL for API */
    baseUrl?: string;
}
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
export declare class GeminiProvider extends BaseLLM {
    constructor(config: GeminiConfig, eventBus?: EventBus);
    /**
     * Get Gemini-specific capabilities.
     */
    getCapabilities(): LLMCapabilities;
    /**
     * Call Gemini generateContent API.
     */
    call(messages: LLMMessage[], options?: LLMCallOptions): Promise<LLMResponse>;
    private formatMessagesForGemini;
    private prepareParams;
    private makeRequest;
    private getHeaders;
    private getBaseUrl;
    private extractText;
    private mapFinishReason;
    /** Supported content block types */
    private static readonly SUPPORTED_BLOCK_TYPES;
    private coerceText;
    private formatToolResult;
    private isContextLengthError;
}
//# sourceMappingURL=gemini.d.ts.map