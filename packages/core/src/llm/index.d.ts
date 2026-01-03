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
export type { LLMRole, LLMMessage, LLMContentBlock, TokenUsage, UsageMetrics, LLMResponse, LLMToolCall, LLMConfig, LLMProviderConfig, LLMTool, LLMCallOptions, LLMResponseFormat, LLMProvider, LLMEventType, LLMEvent, LLMCallStartedEvent, LLMCallCompletedEvent, LLMCallFailedEvent, LLMCallStreamedEvent, LLMToolStartedEvent, LLMToolCompletedEvent, LLMToolFailedEvent, } from './types';
export { LLM_CONTEXT_WINDOWS, OPENAI_MODELS, ANTHROPIC_MODELS, } from './types';
export { BaseLLM, LLMContextLengthExceededError, LLMCallError } from './base';
export type { LLMCapabilities } from './base';
export { OpenAIProvider, type OpenAIConfig } from './providers/openai';
export { AnthropicProvider, type AnthropicConfig, type AnthropicThinkingConfig } from './providers/anthropic';
export { GeminiProvider, type GeminiConfig } from './providers/gemini';
export { ModelRouter, type RouterConfig, type ProviderConfig, getDefaultRouter, createLLM, createLLMWithFallback, } from './routing';
export { type ModelInfo, type Model, type Provider, ModelInfoMap, AllModels, getModelInfo, getContextWindowSize, getOutputTokenLimit, getModelPricing, calculateCost, inferProvider, supportsVision, supportsReasoning, isRecommendedForCoding, isLegacyModel, getAllModelNames, getModelsForProvider, getModelsForProviderAsync, getModelsByCapability, getCheapestModel, getMostCapableModel, CONTEXT_WINDOW_USAGE_RATIO, DEFAULT_CONTEXT_WINDOW_SIZE, DEFAULT_OUTPUT_TOKEN_LIMIT, } from './model-registry';
//# sourceMappingURL=index.d.ts.map