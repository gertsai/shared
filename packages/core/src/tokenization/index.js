"use strict";
/**
 * @gerts/core - Tokenization Module
 *
 * Universal tokenization system for multi-model support.
 *
 * Features:
 * - Model-aware tokenizer selection
 * - Provider-specific multipliers (Claude, Gemini, etc.)
 * - LRU cache for performance
 * - Exact counting for OpenAI models (gpt-tokenizer)
 * - Estimation fallback for other providers
 *
 * @example
 * ```typescript
 * import { TokenizerFactory, countTokens } from '@gerts/core';
 *
 * // Quick counting
 * const count = await countTokens('Hello, world!', 'gpt-4o');
 *
 * // With factory
 * const tokenizer = TokenizerFactory.forModel('claude-3-5-sonnet');
 * const result = await tokenizer.countTokens('Hello, world!');
 *
 * // With caching
 * const cached = TokenizerFactory.getCached('gpt-4o');
 * await cached.countTokens('Repeated text...');
 * console.log(cached.getStats().hitRate);
 * ```
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCachedTokenizer = exports.getTokenizer = exports.countTokens = exports.TokenizerFactory = exports.DEFAULT_CACHE_CONFIG = exports.withCache = exports.CachedTokenizer = exports.DEFAULT_ESTIMATION_CONFIG = exports.createProviderTokenizer = exports.createEstimationTokenizer = exports.EstimationTokenizer = exports.createTiktokenTokenizer = exports.TiktokenTokenizer = exports.getEncodingForModel = exports.DEFAULT_TOKENIZER_FACTORY_CONFIG = exports.MODEL_ENCODINGS = exports.PROVIDER_TOKEN_MULTIPLIERS = void 0;
// Types
var types_js_1 = require("./types.js");
Object.defineProperty(exports, "PROVIDER_TOKEN_MULTIPLIERS", { enumerable: true, get: function () { return types_js_1.PROVIDER_TOKEN_MULTIPLIERS; } });
Object.defineProperty(exports, "MODEL_ENCODINGS", { enumerable: true, get: function () { return types_js_1.MODEL_ENCODINGS; } });
Object.defineProperty(exports, "DEFAULT_TOKENIZER_FACTORY_CONFIG", { enumerable: true, get: function () { return types_js_1.DEFAULT_TOKENIZER_FACTORY_CONFIG; } });
Object.defineProperty(exports, "getEncodingForModel", { enumerable: true, get: function () { return types_js_1.getEncodingForModel; } });
// Tokenizers
var tiktoken_js_1 = require("./tokenizers/tiktoken.js");
Object.defineProperty(exports, "TiktokenTokenizer", { enumerable: true, get: function () { return tiktoken_js_1.TiktokenTokenizer; } });
Object.defineProperty(exports, "createTiktokenTokenizer", { enumerable: true, get: function () { return tiktoken_js_1.createTiktokenTokenizer; } });
var estimation_js_1 = require("./tokenizers/estimation.js");
Object.defineProperty(exports, "EstimationTokenizer", { enumerable: true, get: function () { return estimation_js_1.EstimationTokenizer; } });
Object.defineProperty(exports, "createEstimationTokenizer", { enumerable: true, get: function () { return estimation_js_1.createEstimationTokenizer; } });
Object.defineProperty(exports, "createProviderTokenizer", { enumerable: true, get: function () { return estimation_js_1.createProviderTokenizer; } });
Object.defineProperty(exports, "DEFAULT_ESTIMATION_CONFIG", { enumerable: true, get: function () { return estimation_js_1.DEFAULT_ESTIMATION_CONFIG; } });
var cached_js_1 = require("./tokenizers/cached.js");
Object.defineProperty(exports, "CachedTokenizer", { enumerable: true, get: function () { return cached_js_1.CachedTokenizer; } });
Object.defineProperty(exports, "withCache", { enumerable: true, get: function () { return cached_js_1.withCache; } });
Object.defineProperty(exports, "DEFAULT_CACHE_CONFIG", { enumerable: true, get: function () { return cached_js_1.DEFAULT_CACHE_CONFIG; } });
// Factory (main entry point)
var factory_js_1 = require("./factory.js");
Object.defineProperty(exports, "TokenizerFactory", { enumerable: true, get: function () { return factory_js_1.TokenizerFactory; } });
Object.defineProperty(exports, "countTokens", { enumerable: true, get: function () { return factory_js_1.countTokens; } });
Object.defineProperty(exports, "getTokenizer", { enumerable: true, get: function () { return factory_js_1.getTokenizer; } });
Object.defineProperty(exports, "getCachedTokenizer", { enumerable: true, get: function () { return factory_js_1.getCachedTokenizer; } });
//# sourceMappingURL=index.js.map