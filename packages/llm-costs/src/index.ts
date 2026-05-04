/**
 * @gerts/llm-costs — LLM Model Costs, Capabilities & Provider Registry
 *
 * Comprehensive database of 2,600+ models from 100+ providers.
 * Data sourced from LiteLLM and normalized for TypeScript consumption.
 *
 * @example
 * ```ts
 * import {
 *   getModel, findModel, calculateCost, toPerMillion,
 *   getModelsByMode, getModelsByProvider, filterModels,
 *   getProvider, compareCosts, getPricingSummary,
 * } from '@gerts/llm-costs';
 *
 * // Get model info
 * const gpt4o = getModel('gpt-4o');
 * console.log(gpt4o?.tokenPricing.input);        // 2.5e-06 (per token)
 * console.log(toPerMillion(gpt4o.tokenPricing.input)); // 2.5 ($2.50/1M)
 *
 * // Calculate cost
 * const cost = calculateCost('gpt-4o', { inputTokens: 15000, outputTokens: 5000 });
 * console.log(cost?.totalCost); // 0.0875
 *
 * // Get all embedding models
 * const embeddings = getModelsByMode('embedding');
 *
 * // Filter models
 * const cheapVision = filterModels({
 *   mode: 'chat',
 *   capability: 'vision',
 *   maxInputCostPerToken: 3e-06,
 * });
 *
 * // Provider info
 * const openai = getProvider('openai');
 * console.log(openai?.endpoints.embeddings); // true
 * ```
 */

// Types
export type {
  ModelMode,
  TokenPricing,
  ImagePricing,
  MediaPricing,
  RerankPricing,
  SearchPricing,
  ModelCapabilities,
  ModelInfo,
  ProviderEndpoints,
  ProviderConfig,
  ModelFilter,
  CostInput,
  CostResult,
} from './types';

export { ONE_MILLION } from './types';

// Model lookup & filtering
export {
  getModel,
  findModel,
  getAllModels,
  getAllModelIds,
  getModelsByProvider,
  getModelsByMode,
  getModelsByCapability,
  filterModels,
  getUniqueProviders,
  getUniqueModes,
  getModelCountByProvider,
  getModelCountByMode,
  getCheapestChatModels,
  getCheapestEmbeddingModels,
  getLargestContextModels,
  getMeta,
} from './models';

// Cost calculations & conversion
export {
  toPerMillion,
  toPerToken,
  formatPrice,
  formatCost,
  calculateCost,
  calculateCostFromPricing,
  compareCosts,
  getPricingSummary,
} from './cost';

// Provider registry
export { PROVIDERS, getProvider, getAllProviders, getProviderKeys } from './providers';
