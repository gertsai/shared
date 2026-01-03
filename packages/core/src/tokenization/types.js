"use strict";
/**
 * @gerts/core - Tokenization Types
 *
 * Universal tokenization interface for multi-model support.
 * Works with OpenAI, Anthropic, Google, and other LLM providers.
 *
 * Design principles:
 * - Async-first (supports API-based tokenizers)
 * - Provider-aware (different tokenizers for different models)
 * - Cacheable (expensive operations are cached)
 * - Extensible (easy to add new providers)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_TOKENIZER_FACTORY_CONFIG = exports.MODEL_ENCODINGS = exports.PROVIDER_TOKEN_MULTIPLIERS = void 0;
exports.getEncodingForModel = getEncodingForModel;
/**
 * Provider-specific token multipliers.
 * Based on empirical testing comparing to GPT-4 tokenizer.
 *
 * Claude uses ~20-30% more tokens than GPT for same text.
 * Gemini uses ~10% more tokens.
 */
exports.PROVIDER_TOKEN_MULTIPLIERS = {
    openai: 1.0,
    anthropic: 1.25, // Claude uses more tokens
    google: 1.1, // Gemini slightly more
    deepseek: 1.0, // DeepSeek similar to OpenAI
    mistral: 1.05, // Mistral slightly more
    llama: 0.95, // Llama often fewer (smaller vocab)
    xai: 1.0, // Grok similar to OpenAI
    estimation: 1.0, // Base estimation
};
/**
 * Model to encoding mapping.
 */
exports.MODEL_ENCODINGS = {
    // GPT-4o family
    'gpt-4o': 'o200k_base',
    'gpt-4o-mini': 'o200k_base',
    // o1/o3 reasoning models
    o1: 'o200k_base',
    'o1-mini': 'o200k_base',
    'o1-preview': 'o200k_base',
    o3: 'o200k_base',
    'o3-mini': 'o200k_base',
    // GPT-4 family
    'gpt-4': 'cl100k_base',
    'gpt-4-turbo': 'cl100k_base',
    'gpt-4-32k': 'cl100k_base',
    // GPT-3.5 family
    'gpt-3.5-turbo': 'cl100k_base',
    // Legacy
    'text-davinci-003': 'p50k_base',
    'text-davinci-002': 'p50k_base',
    davinci: 'r50k_base',
    curie: 'r50k_base',
    babbage: 'r50k_base',
    ada: 'r50k_base',
};
/**
 * Get encoding for a model.
 *
 * @param model - Model name
 * @returns Encoding name or undefined
 */
function getEncodingForModel(model) {
    // Direct lookup
    if (model in exports.MODEL_ENCODINGS) {
        return exports.MODEL_ENCODINGS[model];
    }
    // Prefix matching
    const modelLower = model.toLowerCase();
    if (modelLower.startsWith('gpt-4o') || modelLower.startsWith('o1') || modelLower.startsWith('o3')) {
        return 'o200k_base';
    }
    if (modelLower.startsWith('gpt-4') || modelLower.startsWith('gpt-3.5')) {
        return 'cl100k_base';
    }
    return undefined;
}
/**
 * Default factory configuration.
 */
exports.DEFAULT_TOKENIZER_FACTORY_CONFIG = {
    enableCache: true,
    cacheMaxSize: 1000,
    cacheTTL: 5 * 60 * 1000, // 5 minutes
    defaultProvider: 'estimation',
};
//# sourceMappingURL=types.js.map