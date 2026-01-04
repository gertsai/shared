"use strict";
/**
 * @gerts/core - LLM Module
 * Phase 21: LLM Abstraction
 *
 * Exports:
 * - Types for LLM operations
 * - BaseLLM abstract class
 * - Native providers (OpenAI, Anthropic)
 * - ModelRouter factory with smart routing
 * - Model registry (llm-info integration)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_OUTPUT_TOKEN_LIMIT = exports.DEFAULT_CONTEXT_WINDOW_SIZE = exports.CONTEXT_WINDOW_USAGE_RATIO = exports.getMostCapableModel = exports.getCheapestModel = exports.getModelsByCapability = exports.getModelsForProviderAsync = exports.getModelsForProvider = exports.getAllModelNames = exports.isLegacyModel = exports.isRecommendedForCoding = exports.supportsReasoning = exports.supportsVision = exports.inferProvider = exports.calculateCost = exports.getModelPricing = exports.getOutputTokenLimit = exports.getContextWindowSize = exports.getModelInfo = exports.AllModels = exports.ModelInfoMap = exports.createLLMWithFallback = exports.createLLM = exports.getDefaultRouter = exports.ModelRouter = exports.GeminiProvider = exports.AnthropicProvider = exports.OpenAIProvider = exports.LLMCallError = exports.LLMContextLengthExceededError = exports.BaseLLM = exports.ANTHROPIC_MODELS = exports.OPENAI_MODELS = exports.LLM_CONTEXT_WINDOWS = void 0;
// Legacy constants (deprecated - use model-registry functions instead)
var types_1 = require("./types");
Object.defineProperty(exports, "LLM_CONTEXT_WINDOWS", { enumerable: true, get: function () { return types_1.LLM_CONTEXT_WINDOWS; } });
Object.defineProperty(exports, "OPENAI_MODELS", { enumerable: true, get: function () { return types_1.OPENAI_MODELS; } });
Object.defineProperty(exports, "ANTHROPIC_MODELS", { enumerable: true, get: function () { return types_1.ANTHROPIC_MODELS; } });
// Base class and errors
var base_1 = require("./base");
Object.defineProperty(exports, "BaseLLM", { enumerable: true, get: function () { return base_1.BaseLLM; } });
Object.defineProperty(exports, "LLMContextLengthExceededError", { enumerable: true, get: function () { return base_1.LLMContextLengthExceededError; } });
Object.defineProperty(exports, "LLMCallError", { enumerable: true, get: function () { return base_1.LLMCallError; } });
// Providers
var openai_1 = require("./providers/openai");
Object.defineProperty(exports, "OpenAIProvider", { enumerable: true, get: function () { return openai_1.OpenAIProvider; } });
var anthropic_1 = require("./providers/anthropic");
Object.defineProperty(exports, "AnthropicProvider", { enumerable: true, get: function () { return anthropic_1.AnthropicProvider; } });
var gemini_1 = require("./providers/gemini");
Object.defineProperty(exports, "GeminiProvider", { enumerable: true, get: function () { return gemini_1.GeminiProvider; } });
// Router
var routing_1 = require("./routing");
Object.defineProperty(exports, "ModelRouter", { enumerable: true, get: function () { return routing_1.ModelRouter; } });
Object.defineProperty(exports, "getDefaultRouter", { enumerable: true, get: function () { return routing_1.getDefaultRouter; } });
Object.defineProperty(exports, "createLLM", { enumerable: true, get: function () { return routing_1.createLLM; } });
Object.defineProperty(exports, "createLLMWithFallback", { enumerable: true, get: function () { return routing_1.createLLMWithFallback; } });
// Model Registry (llm-info integration)
var model_registry_1 = require("./model-registry");
Object.defineProperty(exports, "ModelInfoMap", { enumerable: true, get: function () { return model_registry_1.ModelInfoMap; } });
Object.defineProperty(exports, "AllModels", { enumerable: true, get: function () { return model_registry_1.AllModels; } });
// Utility functions
Object.defineProperty(exports, "getModelInfo", { enumerable: true, get: function () { return model_registry_1.getModelInfo; } });
Object.defineProperty(exports, "getContextWindowSize", { enumerable: true, get: function () { return model_registry_1.getContextWindowSize; } });
Object.defineProperty(exports, "getOutputTokenLimit", { enumerable: true, get: function () { return model_registry_1.getOutputTokenLimit; } });
Object.defineProperty(exports, "getModelPricing", { enumerable: true, get: function () { return model_registry_1.getModelPricing; } });
Object.defineProperty(exports, "calculateCost", { enumerable: true, get: function () { return model_registry_1.calculateCost; } });
Object.defineProperty(exports, "inferProvider", { enumerable: true, get: function () { return model_registry_1.inferProvider; } });
Object.defineProperty(exports, "supportsVision", { enumerable: true, get: function () { return model_registry_1.supportsVision; } });
Object.defineProperty(exports, "supportsReasoning", { enumerable: true, get: function () { return model_registry_1.supportsReasoning; } });
Object.defineProperty(exports, "isRecommendedForCoding", { enumerable: true, get: function () { return model_registry_1.isRecommendedForCoding; } });
Object.defineProperty(exports, "isLegacyModel", { enumerable: true, get: function () { return model_registry_1.isLegacyModel; } });
Object.defineProperty(exports, "getAllModelNames", { enumerable: true, get: function () { return model_registry_1.getAllModelNames; } });
Object.defineProperty(exports, "getModelsForProvider", { enumerable: true, get: function () { return model_registry_1.getModelsForProvider; } });
Object.defineProperty(exports, "getModelsForProviderAsync", { enumerable: true, get: function () { return model_registry_1.getModelsForProviderAsync; } });
Object.defineProperty(exports, "getModelsByCapability", { enumerable: true, get: function () { return model_registry_1.getModelsByCapability; } });
Object.defineProperty(exports, "getCheapestModel", { enumerable: true, get: function () { return model_registry_1.getCheapestModel; } });
Object.defineProperty(exports, "getMostCapableModel", { enumerable: true, get: function () { return model_registry_1.getMostCapableModel; } });
// Constants
Object.defineProperty(exports, "CONTEXT_WINDOW_USAGE_RATIO", { enumerable: true, get: function () { return model_registry_1.CONTEXT_WINDOW_USAGE_RATIO; } });
Object.defineProperty(exports, "DEFAULT_CONTEXT_WINDOW_SIZE", { enumerable: true, get: function () { return model_registry_1.DEFAULT_CONTEXT_WINDOW_SIZE; } });
Object.defineProperty(exports, "DEFAULT_OUTPUT_TOKEN_LIMIT", { enumerable: true, get: function () { return model_registry_1.DEFAULT_OUTPUT_TOKEN_LIMIT; } });
