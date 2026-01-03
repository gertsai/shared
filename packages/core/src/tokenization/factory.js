"use strict";
/**
 * @gerts/core - Tokenizer Factory
 *
 * Central factory for creating tokenizers.
 * Auto-detects provider from model name and returns appropriate tokenizer.
 *
 * Features:
 * - Model-aware tokenizer selection
 * - Singleton management for efficiency
 * - Optional caching layer
 * - Provider-specific fallbacks
 *
 * @example
 * ```typescript
 * // Auto-detect tokenizer for model
 * const tokenizer = TokenizerFactory.forModel('gpt-4o');
 * const result = await tokenizer.countTokens('Hello, world!');
 *
 * // Get cached tokenizer (singleton)
 * const cached = TokenizerFactory.getCached('claude-3-5-sonnet');
 *
 * // Quick token counting
 * const count = await TokenizerFactory.countTokens('Hello!', 'gpt-4o');
 * ```
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TokenizerFactory = void 0;
exports.countTokens = countTokens;
exports.getTokenizer = getTokenizer;
exports.getCachedTokenizer = getCachedTokenizer;
const types_js_1 = require("./types.js");
const tiktoken_js_1 = require("./tokenizers/tiktoken.js");
const estimation_js_1 = require("./tokenizers/estimation.js");
const cached_js_1 = require("./tokenizers/cached.js");
const model_registry_js_1 = require("../llm/model-registry.js");
/**
 * TokenizerFactory - create tokenizers for any model.
 *
 * Auto-detects provider and returns appropriate tokenizer:
 * - OpenAI models → TiktokenTokenizer (exact)
 * - Claude/Gemini models → EstimationTokenizer (with multiplier)
 * - Unknown models → EstimationTokenizer (base)
 *
 * All tokenizers can be wrapped with caching for performance.
 */
class TokenizerFactory {
    static instances = new Map();
    static cachedInstances = new Map();
    static config = types_js_1.DEFAULT_TOKENIZER_FACTORY_CONFIG;
    /**
     * Configure the factory.
     *
     * @param config - Factory configuration
     */
    static configure(config) {
        TokenizerFactory.config = { ...types_js_1.DEFAULT_TOKENIZER_FACTORY_CONFIG, ...config };
    }
    /**
     * Get tokenizer for a model.
     * Auto-detects provider and returns appropriate tokenizer.
     *
     * @param model - Model name (e.g., 'gpt-4o', 'claude-3-5-sonnet')
     * @returns Tokenizer instance (not cached)
     */
    static forModel(model) {
        // Check if we already have an instance
        const existing = TokenizerFactory.instances.get(model);
        if (existing) {
            return existing;
        }
        // Create new tokenizer based on model
        const tokenizer = TokenizerFactory.createTokenizer(model);
        TokenizerFactory.instances.set(model, tokenizer);
        return tokenizer;
    }
    /**
     * Get cached tokenizer for a model.
     * Uses LRU cache wrapper for repeated token counting.
     *
     * @param model - Model name
     * @returns Cached tokenizer instance
     */
    static getCached(model) {
        const existing = TokenizerFactory.cachedInstances.get(model);
        if (existing) {
            return existing;
        }
        const baseTokenizer = TokenizerFactory.forModel(model);
        const cached = new cached_js_1.CachedTokenizer(baseTokenizer, {
            maxSize: TokenizerFactory.config.cacheMaxSize,
            ttlMs: TokenizerFactory.config.cacheTTL,
        });
        TokenizerFactory.cachedInstances.set(model, cached);
        return cached;
    }
    /**
     * Quick token counting helper.
     * Creates or reuses tokenizer for model and counts tokens.
     *
     * @param text - Text to count
     * @param model - Model name (default: 'gpt-4o')
     * @returns Token count result
     */
    static async countTokens(text, model = 'gpt-4o') {
        const tokenizer = TokenizerFactory.config.enableCache
            ? TokenizerFactory.getCached(model)
            : TokenizerFactory.forModel(model);
        return tokenizer.countTokens(text);
    }
    /**
     * Quick token count helper (returns number only).
     *
     * @param text - Text to count
     * @param model - Model name (default: 'gpt-4o')
     * @returns Token count
     */
    static async count(text, model = 'gpt-4o') {
        const result = await TokenizerFactory.countTokens(text, model);
        return result.count;
    }
    /**
     * Get tokenizer for a specific provider.
     *
     * @param provider - Provider name
     * @returns Provider-specific tokenizer
     */
    static forProvider(provider) {
        switch (provider) {
            case 'openai':
                return new tiktoken_js_1.TiktokenTokenizer('gpt-4o');
            case 'anthropic':
                return new estimation_js_1.EstimationTokenizer({ model: 'claude-3-5-sonnet', multiplier: 1.25 });
            case 'google':
                return new estimation_js_1.EstimationTokenizer({ model: 'gemini-1.5-pro', multiplier: 1.1 });
            case 'deepseek':
                return new estimation_js_1.EstimationTokenizer({ model: 'deepseek-chat', multiplier: 1.0 });
            case 'mistral':
                return new estimation_js_1.EstimationTokenizer({ model: 'mistral-large', multiplier: 1.05 });
            case 'llama':
                return new estimation_js_1.EstimationTokenizer({ model: 'llama-3-70b', multiplier: 0.95 });
            case 'xai':
                return new estimation_js_1.EstimationTokenizer({ model: 'grok-2', multiplier: 1.0 });
            default:
                return new estimation_js_1.EstimationTokenizer();
        }
    }
    /**
     * Create OpenAI-compatible tokenizer.
     * Uses TiktokenTokenizer with specified encoding.
     *
     * @param model - Model name (default: 'gpt-4o')
     * @returns TiktokenTokenizer
     */
    static openai(model = 'gpt-4o') {
        return new tiktoken_js_1.TiktokenTokenizer(model);
    }
    /**
     * Create Anthropic estimation tokenizer.
     * Uses 1.25x multiplier for Claude models.
     *
     * @param model - Model name (default: 'claude-3-5-sonnet')
     * @returns EstimationTokenizer
     */
    static anthropic(model = 'claude-3-5-sonnet') {
        return new estimation_js_1.EstimationTokenizer({ model, multiplier: 1.25 });
    }
    /**
     * Create Google estimation tokenizer.
     * Uses 1.1x multiplier for Gemini models.
     *
     * @param model - Model name (default: 'gemini-1.5-pro')
     * @returns EstimationTokenizer
     */
    static google(model = 'gemini-1.5-pro') {
        return new estimation_js_1.EstimationTokenizer({ model, multiplier: 1.1 });
    }
    /**
     * Create estimation tokenizer with custom multiplier.
     *
     * @param multiplier - Custom multiplier (default: 1.0)
     * @returns EstimationTokenizer
     */
    static estimation(multiplier = 1.0) {
        return new estimation_js_1.EstimationTokenizer({ multiplier });
    }
    /**
     * Clear all cached instances.
     * Useful for testing or memory management.
     */
    static clearAll() {
        // Dispose cached tokenizers
        for (const cached of TokenizerFactory.cachedInstances.values()) {
            cached.dispose();
        }
        TokenizerFactory.instances.clear();
        TokenizerFactory.cachedInstances.clear();
    }
    /**
     * Get cache statistics for a model.
     *
     * @param model - Model name
     * @returns Cache stats or undefined if not cached
     */
    static getCacheStats(model) {
        const cached = TokenizerFactory.cachedInstances.get(model);
        if (cached) {
            return cached.getStats();
        }
        return undefined;
    }
    /**
     * Create tokenizer based on model detection.
     */
    static createTokenizer(model) {
        // Check if model uses OpenAI encoding
        const encoding = (0, types_js_1.getEncodingForModel)(model);
        if (encoding) {
            return new tiktoken_js_1.TiktokenTokenizer(model);
        }
        // Infer provider and create estimation tokenizer
        const provider = (0, model_registry_js_1.inferProvider)(model);
        return new estimation_js_1.EstimationTokenizer({ model });
    }
}
exports.TokenizerFactory = TokenizerFactory;
/**
 * Convenience function to count tokens.
 *
 * @param text - Text to count
 * @param model - Model name (default: 'gpt-4o')
 * @returns Token count
 */
async function countTokens(text, model) {
    return TokenizerFactory.count(text, model);
}
/**
 * Convenience function to get tokenizer for model.
 *
 * @param model - Model name
 * @returns Tokenizer instance
 */
function getTokenizer(model) {
    return TokenizerFactory.forModel(model);
}
/**
 * Convenience function to get cached tokenizer.
 *
 * @param model - Model name
 * @returns Cached tokenizer
 */
function getCachedTokenizer(model) {
    return TokenizerFactory.getCached(model);
}
//# sourceMappingURL=factory.js.map