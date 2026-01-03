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
import type { LLMConfig, LLMMessage, LLMResponse, LLMCallOptions, LLMTool, TokenUsage, UsageMetrics } from './types';
/** LLM capability flags */
export interface LLMCapabilities {
    /** Supports function/tool calling */
    supportsFunctionCalling: boolean;
    /** Supports stop words/sequences */
    supportsStopWords: boolean;
    /** Supports streaming responses */
    supportsStreaming: boolean;
    /** Supports structured outputs (JSON schema) */
    supportsStructuredOutputs: boolean;
    /** Supports vision/images */
    supportsVision: boolean;
}
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
export declare abstract class BaseLLM {
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
    private _tokenUsage;
    /** Cached context window size */
    private _contextWindowSize;
    constructor(config: LLMConfig & {
        provider: string;
        apiKey?: string;
        baseUrl?: string;
    }, eventBus?: EventBus);
    /**
     * Call the LLM with the given messages.
     *
     * @param messages - Array of messages to send
     * @param options - Optional call options (tools, response format)
     * @returns LLM response with content and usage
     */
    abstract call(messages: LLMMessage[], options?: LLMCallOptions): Promise<LLMResponse>;
    /**
     * Stream responses from the LLM.
     *
     * @param messages - Array of messages to send
     * @param options - Optional call options
     * @yields String chunks as they arrive
     */
    stream(messages: LLMMessage[], options?: LLMCallOptions): AsyncGenerator<string, void, unknown>;
    /**
     * Get LLM capabilities.
     * Uses llm-info registry for capabilities like vision and reasoning.
     * Override in subclasses for provider-specific capabilities.
     */
    getCapabilities(): LLMCapabilities;
    /**
     * Check if model supports reasoning (chain-of-thought).
     * Uses llm-info registry.
     */
    supportsReasoning(): boolean;
    /**
     * Get the context window size for this model.
     * Uses llm-info registry for up-to-date model information.
     * Applies 85% ratio to avoid cutoff issues.
     */
    getContextWindowSize(): number;
    /**
     * Get aggregated token usage metrics.
     */
    getTokenUsage(): UsageMetrics;
    /**
     * Reset token usage counters.
     */
    resetTokenUsage(): void;
    /**
     * Apply stop words to truncate response content.
     * Native providers should call this method to post-process responses.
     *
     * @param content - Raw response content from the LLM
     * @returns Content truncated at the first occurrence of any stop word
     */
    protected applyStopWords(content: string): string;
    /**
     * Track token usage internally.
     *
     * @param usage - Token usage data from API response
     */
    protected trackTokenUsage(usage: TokenUsage): void;
    /**
     * Emit LLM call started event.
     */
    protected emitCallStarted(messages: LLMMessage[], tools?: LLMTool[]): void;
    /**
     * Emit LLM call completed event.
     */
    protected emitCallCompleted(response: LLMResponse, startTime: number): void;
    /**
     * Emit LLM call failed event.
     */
    protected emitCallFailed(error: string, startTime: number): void;
    /**
     * Emit streaming chunk event.
     */
    protected emitStreamChunk(chunk: string, index: number): void;
    /**
     * Emit tool execution started event.
     */
    protected emitToolStarted(toolName: string, toolArgs: Record<string, unknown>): void;
    /**
     * Emit tool execution completed event.
     */
    protected emitToolCompleted(toolName: string, result: unknown, startTime: number): void;
    /**
     * Emit tool execution failed event.
     */
    protected emitToolFailed(toolName: string, error: string, startTime: number): void;
    /**
     * Handle tool execution with event emission.
     *
     * @param toolName - Name of the tool to execute
     * @param toolArgs - Arguments for the tool
     * @param availableFunctions - Map of available function implementations
     * @returns Tool result or undefined if not found
     */
    protected handleToolExecution(toolName: string, toolArgs: Record<string, unknown>, availableFunctions: Record<string, (...args: unknown[]) => unknown>): Promise<string | undefined>;
    /**
     * Format messages for the provider.
     * Override in subclasses if provider requires specific formatting.
     *
     * @param messages - Input messages
     * @returns Formatted messages
     */
    protected formatMessages(messages: LLMMessage[]): LLMMessage[];
}
/**
 * Error thrown when context window is exceeded.
 */
export declare class LLMContextLengthExceededError extends Error {
    constructor(message: string);
}
/**
 * Error thrown when LLM call fails.
 */
export declare class LLMCallError extends Error {
    readonly provider: string;
    readonly model: string;
    readonly cause?: unknown | undefined;
    constructor(message: string, provider: string, model: string, cause?: unknown | undefined);
}
//# sourceMappingURL=base.d.ts.map