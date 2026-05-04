/**
 * @gertsai/core - LLM Module
 * Phase 21: LLM Abstraction
 *
 * Exports:
 * - Types for LLM operations
 * - BaseLLM abstract class
 * - Native providers (OpenAI, Anthropic)
 * - ModelRouter factory with smart routing
 * - Model registry (llm-info integration)
 */

// Types
export type {
  LLMRole,
  LLMMessage,
  LLMContentBlock,
  TokenUsage,
  UsageMetrics,
  LLMResponse,
  LLMToolCall,
  LLMConfig,
  LLMProviderConfig,
  LLMTool,
  LLMCallOptions,
  LLMResponseFormat,
  LLMProvider,
  LLMEventType,
  LLMEvent,
  LLMCallStartedEvent,
  LLMCallCompletedEvent,
  LLMCallFailedEvent,
  LLMCallStreamedEvent,
  LLMToolStartedEvent,
  LLMToolCompletedEvent,
  LLMToolFailedEvent,
  ILLMCallable,
} from './types';
export type {
  LLMRouterSelectionEvent,
  ModelRouterCapabilities,
  ModelRouterCostEstimate,
  ModelRouterOption,
  ModelRouterRequest,
  ModelRouterSelection,
  ModelRouterSelectionResult,
  ModelRouterResponse,
  RouterCapability,
  RouterTaskType,
} from './router-types';

// Legacy constants (deprecated - use model-registry functions instead)
export { LLM_CONTEXT_WINDOWS, OPENAI_MODELS, ANTHROPIC_MODELS } from './types';

// Base class and errors
export { BaseLLM, LLMContextLengthExceededError, LLMCallError } from './base';
export type { LLMCapabilities } from './base';

// Providers
export { OpenAIProvider, type OpenAIConfig } from './providers/openai';
export {
  AnthropicProvider,
  type AnthropicConfig,
  type AnthropicThinkingConfig,
} from './providers/anthropic';
export { GeminiProvider, type GeminiConfig } from './providers/gemini';

// Router
export {
  ModelRouter,
  type RouterConfig,
  type ProviderConfig,
  getDefaultRouter,
  createLLM,
  createLLMWithFallback,
} from './routing';

// Model Registry (llm-info integration)
export {
  // Types from llm-info
  type ModelInfo,
  type Model,
  type Provider,
  ModelInfoMap,
  AllModels,
  // Utility functions
  getModelInfo,
  getContextWindowSize,
  getOutputTokenLimit,
  getModelPricing,
  calculateCost,
  inferProvider,
  supportsVision,
  supportsReasoning,
  isRecommendedForCoding,
  isLegacyModel,
  getAllModelNames,
  getModelsForProvider,
  getModelsForProviderAsync,
  getModelsByCapability,
  getCheapestModel,
  getMostCapableModel,
  // Constants
  CONTEXT_WINDOW_USAGE_RATIO,
  DEFAULT_CONTEXT_WINDOW_SIZE,
  DEFAULT_OUTPUT_TOKEN_LIMIT,
  // @gertsai/llm-costs re-exports (2,600+ models, 100+ providers)
  getLlmCostInfo,
  findLlmCostInfo,
  calculateLlmCost,
  toPerMillion,
  toPerToken,
  getLlmModelsByMode,
  getLlmModelsByProvider,
  filterLlmModels,
  getLlmProvider,
  getAllLlmProviders,
  compareLlmCosts,
  getLlmPricingSummary,
  type LlmCostModelInfo,
  type LlmCostTokenPricing,
  type LlmCostModelCapabilities,
  type LlmCostProviderConfig,
  type LlmCostResult,
  type LlmCostModelFilter,
} from './model-registry';

// Structured Output (Zod → JSON Schema for LiteLLM)
export {
  // Schema conversion
  zodToResponseFormat,
  zodToLLMResponseFormat,
  zodToJsonSchemaLiteLLM,
  // Response format helpers
  jsonMode,
  textMode,
  // Smart fallback
  getStructuredOutputCapabilities,
  getSmartResponseFormat,
  MODEL_STRUCTURED_OUTPUT_CAPABILITIES,
  // JSON extraction fallback
  extractJsonFromText,
  parseStructuredResponse,
  // Types
  type LiteLLMJsonSchema,
  type LiteLLMResponseFormat,
  type ZodToLiteLLMOptions,
  type StructuredOutputCapabilities,
} from './structured-output';
