/**
 * @gerts/core - LLM Model Router
 * Phase 21: LLM Abstraction
 *
 * Factory pattern with smart routing to native providers:
 * - Automatic provider inference from model name
 * - Provider prefix parsing (openai/gpt-4, anthropic/claude-3)
 * - Fallback chain support
 * - Cost optimization routing
 */
import type { EventBus } from '../event-bus';
import { BaseLLM } from './base';
import { type OpenAIConfig } from './providers/openai';
import { type AnthropicConfig } from './providers/anthropic';
import { type GeminiConfig } from './providers/gemini';
import type { LLMProvider } from './types';
/** Router configuration */
export interface RouterConfig {
    /** Default provider if inference fails */
    defaultProvider?: LLMProvider;
    /** Event bus for provider instances */
    eventBus?: EventBus;
    /** Fallback models for each provider */
    fallbacks?: Record<LLMProvider, string[]>;
    /** Cost optimization: prefer cheaper models for simple tasks */
    costOptimization?: boolean;
}
/** Provider-specific configuration union */
export type ProviderConfig = OpenAIConfig | AnthropicConfig | GeminiConfig;
/**
 * Model Router - Factory for creating LLM instances.
 *
 * Uses smart routing to select the appropriate native provider
 * based on model name, with fallback to default provider.
 *
 * @example
 * ```typescript
 * const router = new ModelRouter({ defaultProvider: 'openai' });
 *
 * // Auto-routes to OpenAI
 * const gpt4 = router.create('gpt-4o', { temperature: 0.7 });
 *
 * // Auto-routes to Anthropic
 * const claude = router.create('claude-3-5-sonnet-20241022');
 *
 * // Explicit provider prefix
 * const explicit = router.create('openai/gpt-4o');
 * ```
 */
export declare class ModelRouter {
    private defaultProvider;
    private eventBus?;
    private fallbacks;
    private costOptimization;
    constructor(config?: RouterConfig);
    /**
     * Create an LLM instance for the given model.
     *
     * @param model - Model name (e.g., 'gpt-4o', 'anthropic/claude-3-5-sonnet')
     * @param config - Additional configuration
     * @returns LLM instance
     */
    create(model: string, config?: Partial<ProviderConfig>): BaseLLM;
    /**
     * Create an LLM instance with fallback chain.
     *
     * @param models - Array of model names to try in order
     * @param config - Configuration for all models
     * @returns LLM instance for first available model
     */
    createWithFallback(models: string[], config?: Partial<ProviderConfig>): BaseLLM;
    /**
     * Infer the provider from a model name.
     *
     * @param model - Model name
     * @returns Inferred provider
     */
    inferProvider(model: string): LLMProvider;
    /**
     * Get a cost-optimized model for a given task type.
     *
     * @param taskType - Type of task (simple, complex, creative)
     * @param provider - Preferred provider
     * @returns Recommended model name
     */
    getCostOptimizedModel(taskType: 'simple' | 'complex' | 'creative', provider?: LLMProvider): string;
    /**
     * Get all supported providers.
     */
    getSupportedProviders(): LLMProvider[];
    /**
     * Check if a provider is supported.
     */
    isProviderSupported(provider: LLMProvider): boolean;
    /**
     * Parse model string into provider and model name.
     *
     * Handles formats:
     * - 'gpt-4o' -> { provider: 'openai', modelName: 'gpt-4o' }
     * - 'openai/gpt-4o' -> { provider: 'openai', modelName: 'gpt-4o' }
     * - 'claude-3-5-sonnet' -> { provider: 'anthropic', modelName: 'claude-3-5-sonnet' }
     */
    private parseModel;
    /**
     * Map a provider prefix to a canonical provider name.
     */
    private mapProviderPrefix;
    /**
     * Infer provider from model name using llm-info registry.
     */
    private inferProviderFromModel;
    /**
     * Create a provider instance.
     */
    private createProvider;
}
/**
 * Get or create the default router instance.
 */
export declare function getDefaultRouter(config?: RouterConfig): ModelRouter;
/**
 * Create an LLM instance using the default router.
 *
 * @example
 * ```typescript
 * const llm = createLLM('gpt-4o', { temperature: 0.7 });
 * const response = await llm.call([{ role: 'user', content: 'Hello!' }]);
 * ```
 */
export declare function createLLM(model: string, config?: Partial<ProviderConfig>): BaseLLM;
/**
 * Create an LLM instance with fallback chain using the default router.
 */
export declare function createLLMWithFallback(models: string[], config?: Partial<ProviderConfig>): BaseLLM;
//# sourceMappingURL=routing.d.ts.map