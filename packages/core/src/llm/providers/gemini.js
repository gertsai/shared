"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.GeminiProvider = void 0;
const zod_1 = require("zod");
const base_1 = require("../base");
const model_registry_1 = require("../model-registry");
// ==================== Zod Schemas for API Validation ====================
/** Schema for Gemini API response part */
const GeminiPartSchema = zod_1.z.object({
    text: zod_1.z.string().optional(),
});
/** Schema for Gemini API response candidate */
const GeminiCandidateSchema = zod_1.z.object({
    content: zod_1.z.object({
        parts: zod_1.z.array(GeminiPartSchema).optional(),
    }).optional(),
    finishReason: zod_1.z.string().optional(),
});
/** Schema for Gemini API usage metadata */
const GeminiUsageMetadataSchema = zod_1.z.object({
    promptTokenCount: zod_1.z.number().optional(),
    candidatesTokenCount: zod_1.z.number().optional(),
    totalTokenCount: zod_1.z.number().optional(),
});
/** Schema for full Gemini API response */
const GeminiGenerateResponseSchema = zod_1.z.object({
    candidates: zod_1.z.array(GeminiCandidateSchema).optional(),
    usageMetadata: GeminiUsageMetadataSchema.optional(),
    modelVersion: zod_1.z.string().optional(),
});
/** Schema for Gemini API error response */
const GeminiErrorResponseSchema = zod_1.z.object({
    error: zod_1.z.object({
        code: zod_1.z.number().optional(),
        message: zod_1.z.string().optional(),
        status: zod_1.z.string().optional(),
    }).optional(),
});
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
class GeminiProvider extends base_1.BaseLLM {
    constructor(config, eventBus) {
        super({
            ...config,
            provider: 'gemini',
            apiKey: config.apiKey ?? process.env.GEMINI_API_KEY,
        }, eventBus);
    }
    /**
     * Get Gemini-specific capabilities.
     */
    getCapabilities() {
        return {
            supportsFunctionCalling: false,
            supportsStopWords: true,
            supportsStreaming: false,
            supportsStructuredOutputs: true,
            supportsVision: (0, model_registry_1.supportsVision)(this.model),
        };
    }
    /**
     * Call Gemini generateContent API.
     */
    async call(messages, options) {
        const startTime = Date.now();
        this.emitCallStarted(messages, options?.tools);
        try {
            if (!this.apiKey) {
                throw new base_1.LLMCallError('Gemini API key is required', 'gemini', this.model);
            }
            const { contents, systemInstruction } = this.formatMessagesForGemini(messages);
            const params = this.prepareParams(contents, systemInstruction, options);
            const response = await this.makeRequest(params);
            const content = this.extractText(response);
            const processedContent = this.applyStopWords(content);
            const usage = {
                promptTokens: response.usageMetadata?.promptTokenCount ?? 0,
                completionTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
                totalTokens: response.usageMetadata?.totalTokenCount ?? 0,
            };
            const llmResponse = {
                content: processedContent,
                usage,
                model: response.modelVersion ?? this.model,
                finishReason: this.mapFinishReason(response.candidates?.[0]?.finishReason),
            };
            this.trackTokenUsage(usage);
            this.emitCallCompleted(llmResponse, startTime);
            return llmResponse;
        }
        catch (error) {
            // Re-throw known error types without wrapping
            if (error instanceof base_1.LLMCallError || error instanceof base_1.LLMContextLengthExceededError) {
                throw error;
            }
            const message = error instanceof Error ? error.message : String(error);
            this.emitCallFailed(message, startTime);
            if (this.isContextLengthError(error)) {
                throw new base_1.LLMContextLengthExceededError(message);
            }
            throw new base_1.LLMCallError(message, 'gemini', this.model, error);
        }
    }
    formatMessagesForGemini(messages) {
        const systemParts = [];
        const contents = [];
        for (const message of messages) {
            const text = this.coerceText(message.content);
            if (!text)
                continue;
            if (message.role === 'system') {
                systemParts.push(text);
                continue;
            }
            const role = message.role === 'assistant' ? 'model' : 'user';
            const contentText = message.role === 'tool'
                ? this.formatToolResult(message.name, text)
                : text;
            contents.push({ role, parts: [{ text: contentText }] });
        }
        if (contents.length === 0) {
            contents.push({ role: 'user', parts: [{ text: 'Hello' }] });
        }
        const systemInstruction = systemParts.length > 0
            ? { parts: [{ text: systemParts.join('\n\n') }] }
            : undefined;
        return { contents, systemInstruction };
    }
    prepareParams(contents, systemInstruction, options) {
        const params = { contents };
        if (systemInstruction) {
            params.systemInstruction = systemInstruction;
        }
        const generationConfig = {};
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
            }
            else {
                generationConfig.responseMimeType = 'application/json';
                if (options.responseFormat.type === 'json_schema' &&
                    options.responseFormat.jsonSchema) {
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
    async makeRequest(params) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);
        try {
            const response = await fetch(`${this.getBaseUrl()}/models/${this.model}:generateContent`, {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify(params),
                signal: controller.signal,
            });
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
                }
                catch {
                    // Keep original error text if JSON parsing fails
                }
                throw new Error(`Gemini API error: ${response.status} - ${errorMessage}`);
            }
            const json = await response.json();
            // Validate response with Zod schema
            const validated = GeminiGenerateResponseSchema.safeParse(json);
            if (!validated.success) {
                throw new base_1.LLMCallError(`Invalid Gemini API response: ${validated.error.message}`, 'gemini', this.model);
            }
            return validated.data;
        }
        finally {
            clearTimeout(timeoutId);
        }
    }
    getHeaders() {
        return {
            'Content-Type': 'application/json',
            'x-goog-api-key': this.apiKey ?? '',
        };
    }
    getBaseUrl() {
        return (this.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '');
    }
    extractText(response) {
        const parts = response.candidates?.[0]?.content?.parts ?? [];
        return parts.map((part) => part.text ?? '').join('');
    }
    mapFinishReason(reason) {
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
    static SUPPORTED_BLOCK_TYPES = new Set(['text', 'tool_result']);
    coerceText(content) {
        if (typeof content === 'string') {
            return content;
        }
        const texts = [];
        for (const block of content) {
            if (block.type === 'text' && block.text) {
                texts.push(block.text);
            }
            else if (block.type === 'tool_result' && block.content) {
                texts.push(block.content);
            }
            else if (!GeminiProvider.SUPPORTED_BLOCK_TYPES.has(block.type)) {
                // Explicitly reject unsupported block types
                throw new base_1.LLMCallError(`Unsupported content block type: ${block.type}. Gemini provider only supports: ${[...GeminiProvider.SUPPORTED_BLOCK_TYPES].join(', ')}`, 'gemini', this.model);
            }
            // Empty text/tool_result blocks are silently skipped
        }
        return texts.join('\n');
    }
    formatToolResult(name, text) {
        const toolName = name ? ` (${name})` : '';
        return `Tool result${toolName}: ${text}`;
    }
    isContextLengthError(error) {
        if (error instanceof Error) {
            const msg = error.message.toLowerCase();
            // More specific detection to avoid false positives
            return (msg.includes('maximum context') ||
                msg.includes('context length') ||
                msg.includes('token limit') ||
                msg.includes('exceeds the maximum') ||
                (msg.includes('resource_exhausted') && msg.includes('token')));
        }
        return false;
    }
}
exports.GeminiProvider = GeminiProvider;
//# sourceMappingURL=gemini.js.map