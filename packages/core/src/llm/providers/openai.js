import { BaseLLM, LLMCallError } from '../base';
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
    organization;
    project;
    reasoningEffort;
    isO1Model;
    constructor(config, eventBus) {
        super({
            ...config,
            provider: 'openai',
            apiKey: config.apiKey ?? process.env.OPENAI_API_KEY,
        }, eventBus);
        this.organization = config.organization;
        this.project = config.project;
        this.reasoningEffort = config.reasoningEffort;
        this.isO1Model = config.model.toLowerCase().includes('o1') ||
            config.model.toLowerCase().includes('o3');
    }
    /**
     * Get OpenAI-specific capabilities.
     */
    getCapabilities() {
        return {
            // O1 models don't support function calling
            supportsFunctionCalling: !this.isO1Model,
            // O1 models don't support stop words
            supportsStopWords: !this.isO1Model,
            supportsStreaming: true,
            supportsStructuredOutputs: true,
            supportsVision: this.model.includes('gpt-4o') || this.model.includes('gpt-4-turbo'),
        };
    }
    /**
     * Call OpenAI chat completion API.
     */
    async call(messages, options) {
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
            const usage = {
                promptTokens: response.usage.prompt_tokens,
                completionTokens: response.usage.completion_tokens,
                totalTokens: response.usage.total_tokens,
            };
            this.trackTokenUsage(usage);
            const llmResponse = {
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
        }
        catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            this.emitCallFailed(errorMsg, startTime);
            if (this.isContextLengthError(error)) {
                throw new LLMCallError(`Context window exceeded for model ${this.model}`, 'openai', this.model, error);
            }
            throw new LLMCallError(`OpenAI API call failed: ${errorMsg}`, 'openai', this.model, error);
        }
    }
    /**
     * Stream responses from OpenAI.
     */
    async *stream(messages, options) {
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
                if (done)
                    break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() ?? '';
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6);
                        if (data === '[DONE]')
                            continue;
                        try {
                            const chunk = JSON.parse(data);
                            const content = chunk.choices[0]?.delta?.content;
                            if (content) {
                                fullContent += content;
                                this.emitStreamChunk(content, chunkIndex++);
                                yield content;
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
            throw new LLMCallError(`OpenAI streaming failed: ${errorMsg}`, 'openai', this.model, error);
        }
    }
    // ==================== Private Methods ====================
    getBaseUrl() {
        return this.baseUrl ?? 'https://api.openai.com/v1';
    }
    getHeaders() {
        const headers = {
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
    formatMessagesForOpenAI(messages) {
        return messages.map((msg) => {
            const formatted = {
                role: msg.role,
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
    prepareParams(messages, options) {
        const params = {
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
            }
            else {
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
            }
            else {
                params.response_format = { type: options.responseFormat.type };
            }
        }
        return params;
    }
    convertTools(tools) {
        return tools.map((tool) => ({
            type: 'function',
            function: {
                name: tool.function.name,
                description: tool.function.description,
                parameters: tool.function.parameters,
            },
        }));
    }
    async makeRequest(params) {
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
            return (await response.json());
        }
        finally {
            clearTimeout(timeoutId);
        }
    }
    mapFinishReason(reason) {
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
    isContextLengthError(error) {
        if (error instanceof Error) {
            const msg = error.message.toLowerCase();
            return (msg.includes('context_length_exceeded') ||
                msg.includes('maximum context length') ||
                msg.includes('tokens'));
        }
        return false;
    }
}
