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
// Legacy constants (deprecated - use model-registry functions instead)
export { LLM_CONTEXT_WINDOWS, OPENAI_MODELS, ANTHROPIC_MODELS, } from './types';
// Base class and errors
export { BaseLLM, LLMContextLengthExceededError, LLMCallError } from './base';
// Providers
export { OpenAIProvider } from './providers/openai';
export { AnthropicProvider } from './providers/anthropic';
export { GeminiProvider } from './providers/gemini';
// Router
export { ModelRouter, getDefaultRouter, createLLM, createLLMWithFallback, } from './routing';
// Model Registry (llm-info integration)
export { ModelInfoMap, AllModels, 
// Utility functions
getModelInfo, getContextWindowSize, getOutputTokenLimit, getModelPricing, calculateCost, inferProvider, supportsVision, supportsReasoning, isRecommendedForCoding, isLegacyModel, getAllModelNames, getModelsForProvider, getModelsForProviderAsync, getModelsByCapability, getCheapestModel, getMostCapableModel, 
// Constants
CONTEXT_WINDOW_USAGE_RATIO, DEFAULT_CONTEXT_WINDOW_SIZE, DEFAULT_OUTPUT_TOKEN_LIMIT, } from './model-registry';
