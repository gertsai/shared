"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnthropicProvider = void 0;
const base_1 = require("../base");
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
class AnthropicProvider extends base_1.BaseLLM {
    topP;
    topK;
    thinking;
    previousThinkingBlocks = [];
    constructor(config, eventBus) {
        super({
            ...config,
            provider: 'anthropic',
            apiKey: config.apiKey ?? process.env.ANTHROPIC_API_KEY,
            // Anthropic requires max_tokens, default to 4096
            maxTokens: config.maxTokens ?? 4096,
        }, eventBus);
        this.topP = config.topP;
        this.topK = config.topK;
        this.thinking = config.thinking;
    }
    /**
     * Get Anthropic-specific capabilities.
     */
    getCapabilities() {
        return {
            supportsFunctionCalling: true,
            supportsStopWords: true,
            supportsStreaming: true,
            // Anthropic uses tool-based approach for structured outputs
            supportsStructuredOutputs: false,
            supportsVision: true,
        };
    }
    /**
     * Call Anthropic messages API.
     */
    async call(messages, options) {
        const startTime = Date.now();
        this.emitCallStarted(messages, options?.tools);
        try {
            const { formattedMessages, systemMessage } = this.formatMessagesForAnthropic(messages);
            const params = this.prepareParams(formattedMessages, systemMessage, options);
            if (!this.apiKey) {
                throw new base_1.LLMCallError('Anthropic API key is required', 'anthropic', this.model);
            }
            const response = await this.makeRequest(params);
            // Extract text content
            const textBlocks = response.content.filter((block) => block.type === 'text');
            const content = textBlocks.map((block) => block.text ?? '').join('');
            const processedContent = this.applyStopWords(content);
            // Store thinking blocks for multi-turn conversations
            const thinkingBlocks = response.content.filter((block) => block.type === 'thinking' || block.type === 'redacted_thinking');
            if (thinkingBlocks.length > 0) {
                this.previousThinkingBlocks = thinkingBlocks;
            }
            const usage = {
                promptTokens: response.usage.input_tokens,
                completionTokens: response.usage.output_tokens,
                totalTokens: response.usage.input_tokens + response.usage.output_tokens,
            };
            this.trackTokenUsage(usage);
            // Extract tool use blocks
            const toolUseBlocks = response.content.filter((block) => block.type === 'tool_use');
            const llmResponse = {
                content: processedContent,
                usage,
                model: response.model,
                finishReason: this.mapStopReason(response.stop_reason),
                toolCalls: toolUseBlocks.map((block) => ({
                    id: block.id ?? '',
                    type: 'function',
                    function: {
                        name: block.name ?? '',
                        arguments: JSON.stringify(block.input ?? {}),
                    },
                })),
            };
            // Handle tool calls if present and available functions provided
            if (llmResponse.toolCalls && llmResponse.toolCalls.length > 0 && options?.availableFunctions) {
                for (const toolCall of llmResponse.toolCalls) {
                    const args = JSON.parse(toolCall.function.arguments);
                    await this.handleToolExecution(toolCall.function.name, args, options.availableFunctions);
                }
            }
            this.emitCallCompleted(llmResponse, startTime);
            return llmResponse;
        }
        catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            this.emitCallFailed(errorMsg, startTime);
            if (this.isContextLengthError(error)) {
                throw new base_1.LLMCallError(`Context window exceeded for model ${this.model}`, 'anthropic', this.model, error);
            }
            throw new base_1.LLMCallError(`Anthropic API call failed: ${errorMsg}`, 'anthropic', this.model, error);
        }
    }
    /**
     * Stream responses from Anthropic.
     */
    async *stream(messages, options) {
        const startTime = Date.now();
        this.emitCallStarted(messages, options?.tools);
        try {
            const { formattedMessages, systemMessage } = this.formatMessagesForAnthropic(messages);
            const params = this.prepareParams(formattedMessages, systemMessage, options);
            params.stream = true;
            if (!this.apiKey) {
                throw new base_1.LLMCallError('Anthropic API key is required', 'anthropic', this.model);
            }
            const response = await fetch(`${this.getBaseUrl()}/messages`, {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify(params),
            });
            if (!response.ok) {
                const error = await response.text();
                throw new Error(`Anthropic API error: ${response.status} - ${error}`);
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
                if (done)
                    break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() ?? '';
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6);
                        try {
                            const event = JSON.parse(data);
                            if (event.type === 'content_block_delta' && event.delta?.text) {
                                const text = event.delta.text;
                                fullContent += text;
                                this.emitStreamChunk(text, chunkIndex++);
                                yield text;
                            }
                        }
                        catch {
                            // Skip malformed JSON
                        }
                    }
                }
            }
            // Emit completion event with estimated usage
            const llmResponse = {
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
        }
        catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            this.emitCallFailed(errorMsg, startTime);
            throw new base_1.LLMCallError(`Anthropic streaming failed: ${errorMsg}`, 'anthropic', this.model, error);
        }
    }
    // ==================== Private Methods ====================
    getBaseUrl() {
        return this.baseUrl ?? 'https://api.anthropic.com/v1';
    }
    getHeaders() {
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
    formatMessagesForAnthropic(messages) {
        const formattedMessages = [];
        let systemMessage = null;
        for (const message of messages) {
            if (message.role === 'system') {
                // Combine system messages
                if (systemMessage) {
                    systemMessage += `\n\n${message.content}`;
                }
                else {
                    systemMessage = typeof message.content === 'string' ? message.content : '';
                }
            }
            else if (message.role === 'tool') {
                // Convert tool response to user message with tool_result content
                formattedMessages.push({
                    role: 'user',
                    content: [
                        {
                            type: 'tool_result',
                            tool_use_id: message.toolCallId,
                            content: typeof message.content === 'string' ? message.content : '',
                        },
                    ],
                });
            }
            else {
                const role = message.role === 'user' ? 'user' : 'assistant';
                const content = typeof message.content === 'string' ? message.content : '';
                // For assistant messages with thinking enabled, include thinking blocks
                if (role === 'assistant' && this.thinking && this.previousThinkingBlocks.length > 0) {
                    formattedMessages.push({
                        role,
                        content: [
                            ...this.previousThinkingBlocks,
                            { type: 'text', text: content },
                        ],
                    });
                }
                else {
                    formattedMessages.push({ role, content });
                }
            }
        }
        // Ensure first message is from user (Anthropic requirement)
        if (formattedMessages.length === 0) {
            formattedMessages.push({ role: 'user', content: 'Hello' });
        }
        else if (formattedMessages[0].role !== 'user') {
            formattedMessages.unshift({ role: 'user', content: 'Hello' });
        }
        return { formattedMessages, systemMessage };
    }
    prepareParams(messages, systemMessage, options) {
        const params = {
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
    convertTools(tools) {
        return tools.map((tool) => ({
            name: tool.function.name,
            description: tool.function.description,
            input_schema: tool.function.parameters,
        }));
    }
    async makeRequest(params) {
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
                throw new Error(`Anthropic API error: ${response.status} - ${error}`);
            }
            return (await response.json());
        }
        finally {
            clearTimeout(timeoutId);
        }
    }
    mapStopReason(reason) {
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
    isContextLengthError(error) {
        if (error instanceof Error) {
            const msg = error.message.toLowerCase();
            return (msg.includes('context_length') ||
                msg.includes('token') ||
                msg.includes('too long'));
        }
        return false;
    }
}
exports.AnthropicProvider = AnthropicProvider;
//# sourceMappingURL=anthropic.js.map