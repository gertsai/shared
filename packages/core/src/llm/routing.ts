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
import { OpenAIProvider, type OpenAIConfig } from './providers/openai';
import { AnthropicProvider, type AnthropicConfig } from './providers/anthropic';
import type { LLMConfig, LLMProvider } from './types';
import {
  inferProvider as inferProviderFromRegistry,
  getCheapestModel,
  getMostCapableModel,
  getModelInfo,
} from './model-registry';

/** Provider mapping for model prefixes */
const PROVIDER_PREFIXES: Record<string, LLMProvider> = {
  openai: 'openai',
  gpt: 'openai',
  o1: 'openai',
  o3: 'openai',
  anthropic: 'anthropic',
  claude: 'anthropic',
  azure: 'azure',
  azure_openai: 'azure',
  google: 'gemini',
  gemini: 'gemini',
  bedrock: 'bedrock',
  aws: 'bedrock',
  groq: 'groq',
  mistral: 'mistral',
  ollama: 'ollama',
};

/** Supported native providers */
const NATIVE_PROVIDERS = new Set<LLMProvider>(['openai', 'anthropic']);

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
export type ProviderConfig = OpenAIConfig | AnthropicConfig;

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
export class ModelRouter {
  private defaultProvider: LLMProvider;
  private eventBus?: EventBus;
  private fallbacks: Record<LLMProvider, string[]>;
  private costOptimization: boolean;

  constructor(config?: RouterConfig) {
    this.defaultProvider = config?.defaultProvider ?? 'openai';
    this.eventBus = config?.eventBus;
    this.costOptimization = config?.costOptimization ?? false;
    this.fallbacks = config?.fallbacks ?? {
      openai: ['gpt-4o-mini', 'gpt-3.5-turbo'],
      anthropic: ['claude-3-5-haiku-latest', 'claude-3-haiku-20240307'],
      azure: [],
      gemini: [],
      bedrock: [],
      groq: [],
      mistral: [],
      ollama: [],
    };
  }

  /**
   * Create an LLM instance for the given model.
   *
   * @param model - Model name (e.g., 'gpt-4o', 'anthropic/claude-3-5-sonnet')
   * @param config - Additional configuration
   * @returns LLM instance
   */
  create(model: string, config?: Partial<ProviderConfig>): BaseLLM {
    const { provider, modelName } = this.parseModel(model);

    if (!NATIVE_PROVIDERS.has(provider)) {
      throw new Error(
        `Provider '${provider}' is not supported. ` +
          `Supported providers: ${[...NATIVE_PROVIDERS].join(', ')}`
      );
    }

    return this.createProvider(provider, modelName, config);
  }

  /**
   * Create an LLM instance with fallback chain.
   *
   * @param models - Array of model names to try in order
   * @param config - Configuration for all models
   * @returns LLM instance for first available model
   */
  createWithFallback(
    models: string[],
    config?: Partial<ProviderConfig>
  ): BaseLLM {
    if (models.length === 0) {
      throw new Error('At least one model must be specified');
    }

    // Try each model in order
    for (const model of models) {
      try {
        return this.create(model, config);
      } catch {
        // Continue to next model
      }
    }

    // Fall back to default provider's fallback chain
    const fallbackModels = this.fallbacks[this.defaultProvider];
    for (const model of fallbackModels) {
      try {
        return this.create(model, config);
      } catch {
        // Continue to next model
      }
    }

    throw new Error(
      `Failed to create LLM instance. Tried: ${models.join(', ')}`
    );
  }

  /**
   * Infer the provider from a model name.
   *
   * @param model - Model name
   * @returns Inferred provider
   */
  inferProvider(model: string): LLMProvider {
    const { provider } = this.parseModel(model);
    return provider;
  }

  /**
   * Get a cost-optimized model for a given task type.
   *
   * @param taskType - Type of task (simple, complex, creative)
   * @param provider - Preferred provider
   * @returns Recommended model name
   */
  getCostOptimizedModel(
    taskType: 'simple' | 'complex' | 'creative',
    provider: LLMProvider = this.defaultProvider
  ): string {
    const modelMap: Record<LLMProvider, Record<string, string>> = {
      openai: {
        simple: 'gpt-4o-mini',
        complex: 'gpt-4o',
        creative: 'gpt-4o',
      },
      anthropic: {
        simple: 'claude-3-5-haiku-latest',
        complex: 'claude-3-5-sonnet-latest',
        creative: 'claude-3-5-sonnet-latest',
      },
      azure: {
        simple: 'gpt-4o-mini',
        complex: 'gpt-4o',
        creative: 'gpt-4o',
      },
      gemini: {
        simple: 'gemini-1.5-flash',
        complex: 'gemini-1.5-pro',
        creative: 'gemini-1.5-pro',
      },
      bedrock: {
        simple: 'us.anthropic.claude-3-5-haiku-20241022-v1:0',
        complex: 'us.anthropic.claude-3-5-sonnet-20241022-v2:0',
        creative: 'us.anthropic.claude-3-5-sonnet-20241022-v2:0',
      },
      groq: {
        simple: 'mixtral-8x7b-32768',
        complex: 'mixtral-8x7b-32768',
        creative: 'mixtral-8x7b-32768',
      },
      mistral: {
        simple: 'mistral-small',
        complex: 'mistral-large',
        creative: 'mistral-large',
      },
      ollama: {
        simple: 'llama3',
        complex: 'llama3',
        creative: 'llama3',
      },
    };

    return modelMap[provider]?.[taskType] ?? modelMap.openai[taskType];
  }

  /**
   * Get all supported providers.
   */
  getSupportedProviders(): LLMProvider[] {
    return [...NATIVE_PROVIDERS];
  }

  /**
   * Check if a provider is supported.
   */
  isProviderSupported(provider: LLMProvider): boolean {
    return NATIVE_PROVIDERS.has(provider);
  }

  // ==================== Private Methods ====================

  /**
   * Parse model string into provider and model name.
   *
   * Handles formats:
   * - 'gpt-4o' -> { provider: 'openai', modelName: 'gpt-4o' }
   * - 'openai/gpt-4o' -> { provider: 'openai', modelName: 'gpt-4o' }
   * - 'claude-3-5-sonnet' -> { provider: 'anthropic', modelName: 'claude-3-5-sonnet' }
   */
  private parseModel(model: string): { provider: LLMProvider; modelName: string } {
    if (!model || typeof model !== 'string') {
      throw new Error('Model must be a non-empty string');
    }

    // Check for provider prefix (e.g., 'openai/gpt-4o')
    if (model.includes('/')) {
      const [prefix, ...rest] = model.split('/');
      const modelName = rest.join('/');

      const provider = this.mapProviderPrefix(prefix.toLowerCase());
      if (provider) {
        return { provider, modelName };
      }
    }

    // Infer provider from model name
    const provider = this.inferProviderFromModel(model);
    return { provider, modelName: model };
  }

  /**
   * Map a provider prefix to a canonical provider name.
   */
  private mapProviderPrefix(prefix: string): LLMProvider | null {
    return PROVIDER_PREFIXES[prefix] ?? null;
  }

  /**
   * Infer provider from model name using llm-info registry.
   */
  private inferProviderFromModel(model: string): LLMProvider {
    // First, try llm-info registry
    const registryProvider = inferProviderFromRegistry(model);

    // Map registry provider names to our LLMProvider type
    const providerMap: Record<string, LLMProvider> = {
      openai: 'openai',
      anthropic: 'anthropic',
      google: 'gemini',
      azure: 'azure',
      bedrock: 'bedrock',
      groq: 'groq',
      mistral: 'mistral',
      ollama: 'ollama',
      deepseek: 'openai', // DeepSeek uses OpenAI-compatible API
      xai: 'openai', // xAI uses OpenAI-compatible API
    };

    const mappedProvider = providerMap[registryProvider];
    if (mappedProvider) {
      return mappedProvider;
    }

    // Fallback to pattern matching for unknown providers
    const modelLower = model.toLowerCase();

    // OpenAI patterns
    if (
      modelLower.startsWith('gpt-') ||
      modelLower.startsWith('o1') ||
      modelLower.startsWith('o3') ||
      modelLower.startsWith('whisper-')
    ) {
      return 'openai';
    }

    // Anthropic patterns
    if (
      modelLower.startsWith('claude-') ||
      modelLower.startsWith('anthropic.')
    ) {
      return 'anthropic';
    }

    // Gemini patterns
    if (
      modelLower.startsWith('gemini-') ||
      modelLower.startsWith('gemma-')
    ) {
      return 'gemini';
    }

    // Bedrock patterns (contain dots)
    if (modelLower.includes('.') && modelLower.includes('anthropic')) {
      return 'bedrock';
    }

    // Default
    return this.defaultProvider;
  }

  /**
   * Create a provider instance.
   */
  private createProvider(
    provider: LLMProvider,
    model: string,
    config?: Partial<ProviderConfig>
  ): BaseLLM {
    const baseConfig: LLMConfig = {
      model,
      temperature: config?.temperature,
      maxTokens: config?.maxTokens,
      streaming: config?.streaming,
      stop: config?.stop,
      topP: config?.topP,
      frequencyPenalty: config?.frequencyPenalty,
      presencePenalty: config?.presencePenalty,
      seed: config?.seed,
      timeout: config?.timeout,
      maxRetries: config?.maxRetries,
    };

    switch (provider) {
      case 'openai': {
        const openaiConfig: OpenAIConfig = {
          ...baseConfig,
          apiKey: (config as OpenAIConfig)?.apiKey,
          baseUrl: (config as OpenAIConfig)?.baseUrl,
          organization: (config as OpenAIConfig)?.organization,
          project: (config as OpenAIConfig)?.project,
          reasoningEffort: (config as OpenAIConfig)?.reasoningEffort,
        };
        return new OpenAIProvider(openaiConfig, this.eventBus);
      }

      case 'anthropic': {
        const anthropicConfig: AnthropicConfig = {
          ...baseConfig,
          apiKey: (config as AnthropicConfig)?.apiKey,
          baseUrl: (config as AnthropicConfig)?.baseUrl,
          topP: (config as AnthropicConfig)?.topP,
          topK: (config as AnthropicConfig)?.topK,
          thinking: (config as AnthropicConfig)?.thinking,
        };
        return new AnthropicProvider(anthropicConfig, this.eventBus);
      }

      default:
        throw new Error(`Provider '${provider}' is not yet implemented`);
    }
  }
}

/**
 * Singleton router instance for convenience.
 */
let defaultRouter: ModelRouter | null = null;

/**
 * Get or create the default router instance.
 */
export function getDefaultRouter(config?: RouterConfig): ModelRouter {
  if (!defaultRouter) {
    defaultRouter = new ModelRouter(config);
  }
  return defaultRouter;
}

/**
 * Create an LLM instance using the default router.
 *
 * @example
 * ```typescript
 * const llm = createLLM('gpt-4o', { temperature: 0.7 });
 * const response = await llm.call([{ role: 'user', content: 'Hello!' }]);
 * ```
 */
export function createLLM(
  model: string,
  config?: Partial<ProviderConfig>
): BaseLLM {
  return getDefaultRouter().create(model, config);
}

/**
 * Create an LLM instance with fallback chain using the default router.
 */
export function createLLMWithFallback(
  models: string[],
  config?: Partial<ProviderConfig>
): BaseLLM {
  return getDefaultRouter().createWithFallback(models, config);
}
