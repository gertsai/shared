/**
 * Model lookup and filtering utilities.
 *
 * Provides fast access to 2,600+ models with filtering by provider, mode, capabilities.
 * Data loaded once from generated JSON (sync from LiteLLM).
 */

import type { ModelInfo, ModelFilter, ModelMode, ModelCapabilities } from './types';
import rawData from './data/models.json';

// ==================== Data loading ====================

interface RawData {
  _meta: {
    generatedAt: string;
    source: string;
    totalModels: number;
    totalProviders: number;
    byMode: Record<string, number>;
  };
  models: ModelInfo[];
}

const data = rawData as unknown as RawData;

/** Pre-built index: model id → ModelInfo for O(1) lookup */
const modelById = new Map<string, ModelInfo>();

/** Pre-built index: provider → model ids */
const modelsByProvider = new Map<string, string[]>();

/** Pre-built index: mode → model ids */
const modelsByMode = new Map<string, string[]>();

// Build indexes on first load
for (const model of data.models) {
  modelById.set(model.id, model);

  // Provider index
  let provModels = modelsByProvider.get(model.provider);
  if (!provModels) {
    provModels = [];
    modelsByProvider.set(model.provider, provModels);
  }
  provModels.push(model.id);

  // Mode index
  let modeModels = modelsByMode.get(model.mode);
  if (!modeModels) {
    modeModels = [];
    modelsByMode.set(model.mode, modeModels);
  }
  modeModels.push(model.id);
}

// ==================== Metadata ====================

/** Get sync metadata (generation date, totals) */
export function getMeta() {
  return data._meta;
}

// ==================== Single model lookup ====================

/**
 * Get model info by exact ID.
 *
 * @example
 * ```ts
 * const gpt4o = getModel('gpt-4o');
 * console.log(gpt4o?.tokenPricing.input); // 2.5e-06
 * ```
 */
export function getModel(id: string): ModelInfo | undefined {
  return modelById.get(id);
}

/**
 * Get model info with fuzzy matching (prefix/suffix).
 * Falls back to prefix match if exact match not found.
 *
 * @example
 * ```ts
 * const claude = findModel('claude-3-5-sonnet'); // matches claude-3-5-sonnet-20241022
 * ```
 */
export function findModel(query: string): ModelInfo | undefined {
  // Exact match first
  const exact = modelById.get(query);
  if (exact) return exact;

  // Prefix match (query is a prefix of model id)
  for (const [id, model] of modelById) {
    if (id.startsWith(query) || query.startsWith(id)) {
      return model;
    }
  }

  return undefined;
}

// ==================== Bulk queries ====================

/** Get all models (2,600+) */
export function getAllModels(): ModelInfo[] {
  return data.models;
}

/** Get all model IDs */
export function getAllModelIds(): string[] {
  return data.models.map((m) => m.id);
}

/**
 * Get models by provider.
 *
 * @example
 * ```ts
 * const openaiModels = getModelsByProvider('openai');
 * ```
 */
export function getModelsByProvider(provider: string): ModelInfo[] {
  const ids = modelsByProvider.get(provider);
  if (!ids) return [];
  return ids.map((id) => modelById.get(id)!);
}

/**
 * Get models by mode.
 *
 * @example
 * ```ts
 * const embeddings = getModelsByMode('embedding');
 * const chatModels = getModelsByMode('chat');
 * ```
 */
export function getModelsByMode(mode: ModelMode): ModelInfo[] {
  const ids = modelsByMode.get(mode);
  if (!ids) return [];
  return ids.map((id) => modelById.get(id)!);
}

/**
 * Get models by capability.
 *
 * @example
 * ```ts
 * const visionModels = getModelsByCapability('vision');
 * const reasoningModels = getModelsByCapability('reasoning');
 * ```
 */
export function getModelsByCapability(capability: keyof ModelCapabilities): ModelInfo[] {
  return data.models.filter((m) => m.capabilities[capability]);
}

/**
 * Filter models with multiple criteria.
 *
 * @example
 * ```ts
 * const cheapVision = filterModels({
 *   mode: 'chat',
 *   capability: 'vision',
 *   maxInputCostPerToken: 3e-06,
 *   excludeDeprecated: true,
 * });
 * ```
 */
export function filterModels(filter: ModelFilter): ModelInfo[] {
  let result = data.models;

  if (filter.provider) {
    result = result.filter(
      (m) => m.provider === filter.provider || m.provider.startsWith(filter.provider + '-'),
    );
  }

  if (filter.mode) {
    result = result.filter((m) => m.mode === filter.mode);
  }

  if (filter.capability) {
    result = result.filter((m) => m.capabilities[filter.capability!]);
  }

  if (filter.excludeDeprecated) {
    const now = new Date().toISOString().slice(0, 10);
    result = result.filter((m) => !m.deprecationDate || m.deprecationDate > now);
  }

  if (filter.minContextWindow != null) {
    result = result.filter((m) => (m.maxInputTokens ?? 0) >= filter.minContextWindow!);
  }

  if (filter.maxInputCostPerToken != null) {
    result = result.filter((m) => m.tokenPricing.input <= filter.maxInputCostPerToken!);
  }

  return result;
}

// ==================== Aggregation ====================

/** Get unique providers from model data */
export function getUniqueProviders(): string[] {
  return Array.from(modelsByProvider.keys()).sort();
}

/** Get unique modes from model data */
export function getUniqueModes(): ModelMode[] {
  return Array.from(modelsByMode.keys()).sort() as ModelMode[];
}

/** Get model counts by provider */
export function getModelCountByProvider(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const [provider, ids] of modelsByProvider) {
    counts[provider] = ids.length;
  }
  return counts;
}

/** Get model counts by mode */
export function getModelCountByMode(): Record<string, number> {
  return { ...data._meta.byMode };
}

// ==================== Comparison / Sorting ====================

/**
 * Get cheapest chat models across all providers.
 *
 * @param limit - Max results (default 10)
 * @returns Models sorted by input cost (ascending)
 */
export function getCheapestChatModels(limit = 10): ModelInfo[] {
  return data.models
    .filter((m) => m.mode === 'chat' && m.tokenPricing.input > 0)
    .sort((a, b) => a.tokenPricing.input - b.tokenPricing.input)
    .slice(0, limit);
}

/**
 * Get cheapest embedding models.
 *
 * @param limit - Max results (default 10)
 * @returns Models sorted by input cost (ascending)
 */
export function getCheapestEmbeddingModels(limit = 10): ModelInfo[] {
  return data.models
    .filter((m) => m.mode === 'embedding' && m.tokenPricing.input > 0)
    .sort((a, b) => a.tokenPricing.input - b.tokenPricing.input)
    .slice(0, limit);
}

/**
 * Get models with largest context windows.
 *
 * @param limit - Max results (default 10)
 * @returns Models sorted by maxInputTokens (descending)
 */
export function getLargestContextModels(limit = 10): ModelInfo[] {
  return data.models
    .filter((m) => m.maxInputTokens != null && m.maxInputTokens > 0)
    .sort((a, b) => (b.maxInputTokens ?? 0) - (a.maxInputTokens ?? 0))
    .slice(0, limit);
}
