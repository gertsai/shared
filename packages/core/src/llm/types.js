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
export { CONTEXT_WINDOW_USAGE_RATIO, DEFAULT_CONTEXT_WINDOW_SIZE, } from './model-registry';
// Legacy exports for backwards compatibility - use model-registry functions instead
/** @deprecated Use getContextWindowSize() from model-registry instead */
export const LLM_CONTEXT_WINDOWS = {};
/** @deprecated Use getModelsForProvider('OpenAI') from model-registry instead */
export const OPENAI_MODELS = new Set();
/** @deprecated Use getModelsForProvider('Anthropic') from model-registry instead */
export const ANTHROPIC_MODELS = new Set();
