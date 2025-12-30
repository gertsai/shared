/**
 * @gerts/core - LLM Model Registry
 * Phase 21: LLM Abstraction
 *
 * Uses llm-info package for up-to-date model information:
 * - Context window limits
 * - Pricing (input/output per million tokens)
 * - Capabilities (vision, reasoning, etc.)
 * - Provider inference
 *
 * @see https://github.com/paradite/llm-info
 */
import { ModelInfoMap, AllModels, type ModelInfo, type ModelLike, type AI_PROVIDER_TYPE } from 'llm-info';
export type { ModelInfo, ModelLike as Model, AI_PROVIDER_TYPE as Provider };
export { ModelInfoMap, AllModels };
/** Default context window usage ratio (85% to avoid cutoff) */
export declare const CONTEXT_WINDOW_USAGE_RATIO = 0.85;
/** Default context window size for unknown models */
export declare const DEFAULT_CONTEXT_WINDOW_SIZE = 8192;
/** Default output token limit */
export declare const DEFAULT_OUTPUT_TOKEN_LIMIT = 4096;
/**
 * Get model info from the registry.
 *
 * @param model - Model identifier (e.g., 'gpt-4o', 'claude-3-5-sonnet-20241022')
 * @returns ModelInfo or undefined if not found
 */
export declare function getModelInfo(model: string): ModelInfo | undefined;
/**
 * Get context window size for a model.
 * Uses 85% of the maximum to avoid cutoff issues.
 *
 * @param model - Model identifier
 * @returns Usable context window size
 */
export declare function getContextWindowSize(model: string): number;
/**
 * Get output token limit for a model.
 *
 * @param model - Model identifier
 * @returns Maximum output tokens
 */
export declare function getOutputTokenLimit(model: string): number;
/**
 * Get pricing for a model.
 *
 * @param model - Model identifier
 * @returns Pricing per million tokens or undefined
 */
export declare function getModelPricing(model: string): {
    inputPerMillion: number;
    outputPerMillion: number;
} | undefined;
/**
 * Calculate cost for a request.
 *
 * @param model - Model identifier
 * @param inputTokens - Number of input tokens
 * @param outputTokens - Number of output tokens
 * @returns Cost in USD or undefined if pricing not available
 */
export declare function calculateCost(model: string, inputTokens: number, outputTokens: number): number | undefined;
/**
 * Infer provider from model name.
 *
 * @param model - Model identifier
 * @returns Provider name or 'openai' as default
 */
export declare function inferProvider(model: string): string;
/**
 * Check if model supports image input (vision).
 *
 * @param model - Model identifier
 * @returns true if model supports vision
 */
export declare function supportsVision(model: string): boolean;
/**
 * Check if model supports reasoning (chain-of-thought).
 *
 * @param model - Model identifier
 * @returns true if model supports reasoning
 */
export declare function supportsReasoning(model: string): boolean;
/**
 * Check if model is recommended for coding tasks.
 *
 * @param model - Model identifier
 * @returns true if recommended for coding
 */
export declare function isRecommendedForCoding(model: string): boolean;
/**
 * Check if model is legacy/deprecated.
 *
 * @param model - Model identifier
 * @returns true if model is legacy
 */
export declare function isLegacyModel(model: string): boolean;
/**
 * Get all available model names.
 *
 * @returns Array of model identifiers
 */
export declare function getAllModelNames(): string[];
/**
 * Get models for a specific provider (synchronous).
 *
 * @param provider - Provider name (e.g., 'OpenAI', 'Anthropic', 'openai', 'anthropic')
 * @returns Array of model identifiers
 */
export declare function getModelsForProvider(provider: string): string[];
/**
 * Get models for a specific provider (async version using llm-info API).
 * Use this for OpenRouter which requires API call.
 *
 * @param provider - Provider type from llm-info
 * @returns Promise with array of ModelInfo
 */
export declare function getModelsForProviderAsync(provider: AI_PROVIDER_TYPE): Promise<ModelInfo[]>;
/**
 * Get models with specific capability.
 *
 * @param capability - Capability to filter by
 * @returns Array of model identifiers
 */
export declare function getModelsByCapability(capability: 'vision' | 'reasoning' | 'coding' | 'writing'): string[];
/**
 * Get the cheapest model for a provider.
 *
 * @param provider - Provider name
 * @returns Cheapest model or undefined
 */
export declare function getCheapestModel(provider: AI_PROVIDER_TYPE): string | undefined;
/**
 * Get the most capable model for a provider.
 * Prioritizes: reasoning > coding > writing > vision > context window
 *
 * @param provider - Provider name
 * @returns Most capable model or undefined
 */
export declare function getMostCapableModel(provider: AI_PROVIDER_TYPE): string | undefined;
//# sourceMappingURL=model-registry.d.ts.map