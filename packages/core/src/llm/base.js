import { getContextWindowSize as getContextWindowFromRegistry, supportsVision as supportsVisionFromRegistry, supportsReasoning as supportsReasoningFromRegistry, } from './model-registry';
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
export class BaseLLM {
    /** Model identifier */
    model;
    /** Provider name */
    provider;
    /** Temperature for sampling */
    temperature;
    /** Maximum tokens to generate */
    maxTokens;
    /** Stop sequences */
    stop;
    /** API key */
    apiKey;
    /** Base URL for API */
    baseUrl;
    /** Timeout in milliseconds */
    timeout;
    /** Maximum retries */
    maxRetries;
    /** Event bus for emitting events */
    eventBus;
    /** Internal token usage tracking */
    _tokenUsage = {
        totalTokens: 0,
        promptTokens: 0,
        completionTokens: 0,
        cachedPromptTokens: 0,
        successfulRequests: 0,
    };
    /** Cached context window size */
    _contextWindowSize = 0;
    constructor(config, eventBus) {
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
        }
        else if (typeof config.stop === 'string') {
            this.stop = [config.stop];
        }
        else {
            this.stop = config.stop;
        }
    }
    /**
     * Stream responses from the LLM.
     *
     * @param messages - Array of messages to send
     * @param options - Optional call options
     * @yields String chunks as they arrive
     */
    async *stream(messages, options) {
        // Default implementation: fall back to non-streaming call
        const response = await this.call(messages, options);
        yield response.content;
    }
    /**
     * Get LLM capabilities.
     * Uses llm-info registry for capabilities like vision and reasoning.
     * Override in subclasses for provider-specific capabilities.
     */
    getCapabilities() {
        return {
            supportsFunctionCalling: true,
            supportsStopWords: true,
            supportsStreaming: true,
            supportsStructuredOutputs: false,
            supportsVision: supportsVisionFromRegistry(this.model),
        };
    }
    /**
     * Check if model supports reasoning (chain-of-thought).
     * Uses llm-info registry.
     */
    supportsReasoning() {
        return supportsReasoningFromRegistry(this.model);
    }
    /**
     * Get the context window size for this model.
     * Uses llm-info registry for up-to-date model information.
     * Applies 85% ratio to avoid cutoff issues.
     */
    getContextWindowSize() {
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
    getTokenUsage() {
        return { ...this._tokenUsage };
    }
    /**
     * Reset token usage counters.
     */
    resetTokenUsage() {
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
    applyStopWords(content) {
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
    trackTokenUsage(usage) {
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
    emitCallStarted(messages, tools) {
        if (!this.eventBus)
            return;
        const event = {
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
    emitCallCompleted(response, startTime) {
        if (!this.eventBus)
            return;
        const event = {
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
    emitCallFailed(error, startTime) {
        if (!this.eventBus)
            return;
        const event = {
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
    emitStreamChunk(chunk, index) {
        if (!this.eventBus)
            return;
        const event = {
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
    emitToolStarted(toolName, toolArgs) {
        if (!this.eventBus)
            return;
        const event = {
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
    emitToolCompleted(toolName, result, startTime) {
        if (!this.eventBus)
            return;
        const event = {
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
    emitToolFailed(toolName, error, startTime) {
        if (!this.eventBus)
            return;
        const event = {
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
    async handleToolExecution(toolName, toolArgs, availableFunctions) {
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
        }
        catch (error) {
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
    formatMessages(messages) {
        return messages;
    }
}
/**
 * Error thrown when context window is exceeded.
 */
export class LLMContextLengthExceededError extends Error {
    constructor(message) {
        super(message);
        this.name = 'LLMContextLengthExceededError';
    }
}
/**
 * Error thrown when LLM call fails.
 */
export class LLMCallError extends Error {
    provider;
    model;
    cause;
    constructor(message, provider, model, cause) {
        super(message);
        this.provider = provider;
        this.model = model;
        this.cause = cause;
        this.name = 'LLMCallError';
    }
}
