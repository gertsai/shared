"use strict";
/**
 * @gerts/core - LLM Types
 * Phase 21: LLM Abstraction
 *
 * Core types for LLM integration following CrewAI patterns:
 * - Native SDK priority (OpenAI, Anthropic)
 * - Factory pattern with smart routing
 * - Token usage tracking
 * - Event-driven architecture
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ANTHROPIC_MODELS = exports.OPENAI_MODELS = exports.LLM_CONTEXT_WINDOWS = exports.DEFAULT_CONTEXT_WINDOW_SIZE = exports.CONTEXT_WINDOW_USAGE_RATIO = void 0;
/**
 * Model registry is now provided by llm-info package.
 * Import from './model-registry' for:
 * - getModelInfo(model)
 * - getContextWindowSize(model)
 * - getModelPricing(model)
 * - inferProvider(model)
 * - supportsVision(model)
 * - supportsReasoning(model)
 * - getAllModelNames()
 * - getModelsForProvider(provider)
 *
 * @see https://github.com/paradite/llm-info
 */
// Re-export constants from model-registry for backwards compatibility
var model_registry_1 = require("./model-registry");
Object.defineProperty(exports, "CONTEXT_WINDOW_USAGE_RATIO", { enumerable: true, get: function () { return model_registry_1.CONTEXT_WINDOW_USAGE_RATIO; } });
Object.defineProperty(exports, "DEFAULT_CONTEXT_WINDOW_SIZE", { enumerable: true, get: function () { return model_registry_1.DEFAULT_CONTEXT_WINDOW_SIZE; } });
// Legacy exports for backwards compatibility - use model-registry functions instead
/** @deprecated Use getContextWindowSize() from model-registry instead */
exports.LLM_CONTEXT_WINDOWS = {};
/** @deprecated Use getModelsForProvider('OpenAI') from model-registry instead */
exports.OPENAI_MODELS = new Set();
/** @deprecated Use getModelsForProvider('Anthropic') from model-registry instead */
exports.ANTHROPIC_MODELS = new Set();
//# sourceMappingURL=types.js.map