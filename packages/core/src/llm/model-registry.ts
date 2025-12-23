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

import {
  ModelInfoMap,
  AllModels,
  getModelsByProvider as getModelsByProviderAsync,
  type ModelInfo,
  type ModelLike,
  type AI_PROVIDER_TYPE,
} from 'llm-info';

// Re-export types from llm-info for convenience
export type { ModelInfo, ModelLike as Model, AI_PROVIDER_TYPE as Provider };
export { ModelInfoMap, AllModels };
// Note: getModelsByProvider from llm-info is async, use our sync version below

/** Default context window usage ratio (85% to avoid cutoff) */
export const CONTEXT_WINDOW_USAGE_RATIO = 0.85;

/** Default context window size for unknown models */
export const DEFAULT_CONTEXT_WINDOW_SIZE = 8192;

/** Default output token limit */
export const DEFAULT_OUTPUT_TOKEN_LIMIT = 4096;

/**
 * Get model info from the registry.
 *
 * @param model - Model identifier (e.g., 'gpt-4o', 'claude-3-5-sonnet-20241022')
 * @returns ModelInfo or undefined if not found
 */
export function getModelInfo(model: string): ModelInfo | undefined {
  // Direct lookup
  if (model in ModelInfoMap) {
    const info = ModelInfoMap[model as ModelLike];
    if (info) {
      return { ...info, id: model as ModelLike };
    }
  }

  // Try to find by prefix matching for versioned models
  for (const [key, info] of Object.entries(ModelInfoMap)) {
    if (model.startsWith(key) || key.startsWith(model)) {
      return { ...(info as ModelInfo), id: key as ModelLike };
    }
  }

  return undefined;
}

/**
 * Get context window size for a model.
 * Uses 85% of the maximum to avoid cutoff issues.
 *
 * @param model - Model identifier
 * @returns Usable context window size
 */
export function getContextWindowSize(model: string): number {
  const info = getModelInfo(model);
  if (info) {
    return Math.floor(info.contextWindowTokenLimit * CONTEXT_WINDOW_USAGE_RATIO);
  }
  return Math.floor(DEFAULT_CONTEXT_WINDOW_SIZE * CONTEXT_WINDOW_USAGE_RATIO);
}

/**
 * Get output token limit for a model.
 *
 * @param model - Model identifier
 * @returns Maximum output tokens
 */
export function getOutputTokenLimit(model: string): number {
  const info = getModelInfo(model);
  return info?.outputTokenLimit ?? DEFAULT_OUTPUT_TOKEN_LIMIT;
}

/**
 * Get pricing for a model.
 *
 * @param model - Model identifier
 * @returns Pricing per million tokens or undefined
 */
export function getModelPricing(model: string): {
  inputPerMillion: number;
  outputPerMillion: number;
} | undefined {
  const info = getModelInfo(model);
  if (info && info.pricePerMillionInputTokens !== null && info.pricePerMillionOutputTokens !== null) {
    return {
      inputPerMillion: info.pricePerMillionInputTokens,
      outputPerMillion: info.pricePerMillionOutputTokens,
    };
  }
  return undefined;
}

/**
 * Calculate cost for a request.
 *
 * @param model - Model identifier
 * @param inputTokens - Number of input tokens
 * @param outputTokens - Number of output tokens
 * @returns Cost in USD or undefined if pricing not available
 */
export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number
): number | undefined {
  const pricing = getModelPricing(model);
  if (!pricing) return undefined;

  const inputCost = (inputTokens / 1_000_000) * pricing.inputPerMillion;
  const outputCost = (outputTokens / 1_000_000) * pricing.outputPerMillion;

  return inputCost + outputCost;
}

/**
 * Infer provider from model name.
 *
 * @param model - Model identifier
 * @returns Provider name or 'openai' as default
 */
export function inferProvider(model: string): string {
  const info = getModelInfo(model);
  if (info) {
    return info.provider.toLowerCase();
  }

  // Fallback pattern matching
  const modelLower = model.toLowerCase();

  if (modelLower.startsWith('gpt-') || modelLower.startsWith('o1') || modelLower.startsWith('o3')) {
    return 'openai';
  }
  if (modelLower.startsWith('claude-')) {
    return 'anthropic';
  }
  if (modelLower.startsWith('gemini-')) {
    return 'google';
  }
  if (modelLower.startsWith('deepseek-')) {
    return 'deepseek';
  }
  if (modelLower.startsWith('grok-')) {
    return 'xai';
  }

  return 'openai'; // Default fallback
}

/**
 * Check if model supports image input (vision).
 *
 * @param model - Model identifier
 * @returns true if model supports vision
 */
export function supportsVision(model: string): boolean {
  const info = getModelInfo(model);
  return info?.supportsImageInput ?? false;
}

/**
 * Check if model supports reasoning (chain-of-thought).
 *
 * @param model - Model identifier
 * @returns true if model supports reasoning
 */
export function supportsReasoning(model: string): boolean {
  const info = getModelInfo(model);
  return info?.reasoning ?? false;
}

/**
 * Check if model is recommended for coding tasks.
 *
 * @param model - Model identifier
 * @returns true if recommended for coding
 */
export function isRecommendedForCoding(model: string): boolean {
  const info = getModelInfo(model);
  return info?.recommendedForCoding ?? false;
}

/**
 * Check if model is legacy/deprecated.
 *
 * @param model - Model identifier
 * @returns true if model is legacy
 */
export function isLegacyModel(model: string): boolean {
  const info = getModelInfo(model);
  return info?.legacy ?? false;
}

/**
 * Get all available model names.
 *
 * @returns Array of model identifiers
 */
export function getAllModelNames(): string[] {
  return AllModels;
}

/** Provider name mapping (case-insensitive) */
const PROVIDER_ALIASES: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google',
  'azure-openai': 'Azure OpenAI',
  azure: 'Azure OpenAI',
  deepseek: 'DeepSeek',
  xai: 'xAI',
  fireworks: 'Fireworks',
  openrouter: 'OpenRouter',
};

/**
 * Get models for a specific provider (synchronous).
 *
 * @param provider - Provider name (e.g., 'OpenAI', 'Anthropic', 'openai', 'anthropic')
 * @returns Array of model identifiers
 */
export function getModelsForProvider(provider: string): string[] {
  // Normalize provider name
  const normalizedProvider = PROVIDER_ALIASES[provider.toLowerCase()] ?? provider;

  return AllModels.filter((model) => {
    const info = ModelInfoMap[model as ModelLike];
    return info?.provider === normalizedProvider;
  });
}

/**
 * Get models for a specific provider (async version using llm-info API).
 * Use this for OpenRouter which requires API call.
 *
 * @param provider - Provider type from llm-info
 * @returns Promise with array of ModelInfo
 */
export async function getModelsForProviderAsync(provider: AI_PROVIDER_TYPE): Promise<ModelInfo[]> {
  return getModelsByProviderAsync(provider);
}

/**
 * Get models with specific capability.
 *
 * @param capability - Capability to filter by
 * @returns Array of model identifiers
 */
export function getModelsByCapability(
  capability: 'vision' | 'reasoning' | 'coding' | 'writing'
): string[] {
  return AllModels.filter((model) => {
    const info = ModelInfoMap[model as ModelLike];
    switch (capability) {
      case 'vision':
        return info?.supportsImageInput;
      case 'reasoning':
        return info?.reasoning;
      case 'coding':
        return info?.recommendedForCoding;
      case 'writing':
        return info?.recommendedForWriting;
      default:
        return false;
    }
  });
}

/**
 * Get the cheapest model for a provider.
 *
 * @param provider - Provider name
 * @returns Cheapest model or undefined
 */
export function getCheapestModel(provider: AI_PROVIDER_TYPE): string | undefined {
  const models = getModelsForProvider(provider);
  if (models.length === 0) return undefined;

  let cheapest: string | undefined;
  let lowestCost = Infinity;

  for (const model of models) {
    const info = ModelInfoMap[model as ModelLike];
    if (!info || info.legacy) continue;

    const inputPrice = info.pricePerMillionInputTokens ?? 0;
    const outputPrice = info.pricePerMillionOutputTokens ?? 0;
    const cost = inputPrice + outputPrice;
    if (cost < lowestCost) {
      lowestCost = cost;
      cheapest = model;
    }
  }

  return cheapest;
}

/**
 * Get the most capable model for a provider.
 * Prioritizes: reasoning > coding > writing > vision > context window
 *
 * @param provider - Provider name
 * @returns Most capable model or undefined
 */
export function getMostCapableModel(provider: AI_PROVIDER_TYPE): string | undefined {
  const models = getModelsForProvider(provider);
  if (models.length === 0) return undefined;

  let best: string | undefined;
  let bestScore = -1;

  for (const model of models) {
    const info = ModelInfoMap[model as ModelLike];
    if (!info || info.legacy) continue;

    let score = 0;
    if (info.reasoning) score += 100;
    if (info.recommendedForCoding) score += 50;
    if (info.recommendedForWriting) score += 25;
    if (info.supportsImageInput) score += 10;
    // Bonus for large context (normalized to 0-5 points)
    score += Math.min(info.contextWindowTokenLimit / 200000, 5);

    if (score > bestScore) {
      bestScore = score;
      best = model;
    }
  }

  return best;
}
