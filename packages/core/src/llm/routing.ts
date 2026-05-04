/**
 * @gertsai/core - LLM Model Router
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
import { GeminiProvider, type GeminiConfig } from './providers/gemini';
import type { LLMConfig, LLMProvider } from './types';
import {
  inferProvider as inferProviderFromRegistry,
  getCheapestModel,
  getContextWindowSize,
  getModelInfo,
  getMostCapableModel,
  calculateCost,
  type ModelInfo,
  type Provider as AI_PROVIDER_TYPE,
} from './model-registry';
import type {
  LLMRouterSelectionEvent,
  ModelRouterCapabilities,
  ModelRouterCostEstimate,
  ModelRouterOption,
  ModelRouterRequest,
  ModelRouterSelection,
  ModelRouterSelectionResult,
  RouterCapability,
} from './router-types';

/** Supported native providers */
const NATIVE_PROVIDERS = new Set<LLMProvider>(['openai', 'anthropic', 'gemini']);

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
export class ModelRouter {
  private defaultProvider: LLMProvider;
  private eventBus?: EventBus;
  private fallbacks: Record<LLMProvider, string[]>;
  private costOptimization: boolean;

  constructor(config?: RouterConfig) {
    this.defaultProvider = config?.defaultProvider ?? 'openai';
    this.eventBus = config?.eventBus;
    this.costOptimization = config?.costOptimization ?? false;

    // Initialize fallbacks
    if (config?.fallbacks) {
      this.fallbacks = config.fallbacks;
    } else {
      this.fallbacks = {
        openai: [],
        anthropic: [],
        gemini: [],
        azure: [],
        bedrock: [],
        groq: [],
        mistral: [],
        ollama: [],
      };

      // Populate default fallbacks dynamically
      const providers: LLMProvider[] = ['openai', 'anthropic', 'gemini'];
      for (const provider of providers) {
        const aiProvider = this.mapToAiProvider(provider);
        const cheapModel = getCheapestModel(aiProvider);
        if (cheapModel) {
          this.fallbacks[provider].push(cheapModel);
        }
      }
    }
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
          `Supported providers: ${[...NATIVE_PROVIDERS].join(', ')}`,
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
  createWithFallback(models: string[], config?: Partial<ProviderConfig>): BaseLLM {
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
    const fallbackModels = this.fallbacks[this.defaultProvider] || [];
    for (const model of fallbackModels) {
      try {
        return this.create(model, config);
      } catch {
        // Continue to next model
      }
    }

    throw new Error(`Failed to create LLM instance. Tried: ${models.join(', ')}`);
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
    provider: LLMProvider = this.defaultProvider,
  ): string {
    const aiProvider = this.mapToAiProvider(provider);

    // Dynamic selection based on registry
    if (taskType === 'simple') {
      return getCheapestModel(aiProvider) ?? this.getFallbackModel(provider);
    }

    // For complex/creative, prefer most capable
    return getMostCapableModel(aiProvider) ?? this.getFallbackModel(provider);
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

  /**
   * Describe a single model using llm-info metadata.
   *
   * @param model - Model identifier
   * @returns Serialized description
   */
  describeModel(model: string): ModelRouterOption {
    type RouterModelInfo = ModelInfo & { description?: string };
    const info = getModelInfo(model) as RouterModelInfo | undefined;

    // Infer provider using registry logic
    const { provider: inferredProvider } = this.parseModel(model);
    const provider = inferredProvider;

    const contextWindow = getContextWindowSize(model);
    const capabilities = this.buildCapabilities(info);
    const pricing = info
      ? {
          inputPerMillion: info.pricePerMillionInputTokens ?? undefined,
          outputPerMillion: info.pricePerMillionOutputTokens ?? undefined,
        }
      : undefined;
    const costPerMillion = (pricing?.inputPerMillion ?? 0) + (pricing?.outputPerMillion ?? 0);

    return {
      model,
      provider,
      name: info?.name,
      description: info?.description,
      contextWindow,
      capabilities,
      pricing,
      estimatedCostPerMillion: costPerMillion || undefined,
      legacy: info?.legacy ?? false,
    };
  }

  /**
   * List candidate models for a routing request.
   */
  listCandidates(options: ModelRouterRequest = {}): ModelRouterOption[] {
    const providers = new Set<LLMProvider>([
      options.provider ?? this.defaultProvider,
      this.defaultProvider,
    ]);

    const models = new Set<string>();

    providers.forEach((provider) => {
      const aiProvider = this.mapToAiProvider(provider);

      const primary =
        options.taskType === 'simple'
          ? getCheapestModel(aiProvider)
          : getMostCapableModel(aiProvider);
      const secondary =
        options.taskType === 'simple'
          ? getMostCapableModel(aiProvider)
          : getCheapestModel(aiProvider);

      if (primary) models.add(primary);
      if (secondary) models.add(secondary);

      (this.fallbacks[provider] ?? []).forEach((model) => models.add(model));
    });

    if (options.model) {
      models.add(options.model);
    }

    const candidates = Array.from(models)
      .map((model) => this.describeModel(model))
      .filter((option) => this.hasCapabilities(option, options.capabilities ?? []));

    const sorted = candidates.sort((a, b) => {
      if (this.costOptimization) {
        const costA = a.estimatedCostPerMillion ?? Number.POSITIVE_INFINITY;
        const costB = b.estimatedCostPerMillion ?? Number.POSITIVE_INFINITY;
        return costA - costB;
      }
      return b.contextWindow - a.contextWindow;
    });

    return sorted;
  }

  /**
   * Select a model for the given request, emit a router event, and return selection metadata.
   */
  selectModelForTask(request: ModelRouterRequest): ModelRouterSelectionResult {
    const candidates = this.listCandidates(request);
    const fallbackChain = candidates.map((candidate) => candidate.model);
    const selectedModel = request.model ?? candidates[0]?.model ?? this.getDefaultCandidate();

    const selection: ModelRouterSelection = {
      selectedModel,
      provider: this.parseModel(selectedModel).provider ?? this.defaultProvider,
      fallbackChain,
      reason: request.model
        ? 'Model hint provided'
        : `Selected based on ${request.taskType ?? 'general'} task type`,
      taskType: request.taskType,
      candidateCount: candidates.length,
      tenantId: request.tenantId,
      costEstimate: this.estimateCost(
        selectedModel,
        request.inputTokens,
        request.outputTokens,
        request.budgetUsd,
      ),
    };

    this.emitRouterSelection(selection);

    return {
      options: candidates,
      selection,
    };
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

      // Simple mapping for prefixes
      const prefixLower = prefix.toLowerCase();
      let provider: LLMProvider | null = null;

      if (prefixLower === 'openai' || prefixLower === 'gpt' || prefixLower === 'o1')
        provider = 'openai';
      else if (prefixLower === 'anthropic' || prefixLower === 'claude') provider = 'anthropic';
      else if (prefixLower === 'gemini' || prefixLower === 'google') provider = 'gemini';
      else if (prefixLower === 'azure' || prefixLower === 'azure_openai') provider = 'azure';
      else if (prefixLower === 'bedrock' || prefixLower === 'aws') provider = 'bedrock';
      else if (prefixLower === 'groq') provider = 'groq';
      else if (prefixLower === 'mistral') provider = 'mistral';
      else if (prefixLower === 'ollama') provider = 'ollama';

      if (provider) {
        return { provider, modelName };
      }
    }

    // Use registry for inference
    // Note: inferProviderFromRegistry returns 'openai', 'anthropic', 'google' etc.
    const registryProvider = inferProviderFromRegistry(model);
    const provider = this.mapRegistryProviderToLLMProvider(registryProvider);

    return { provider, modelName: model };
  }

  /**
   * Map provider string from llm-info registry to internal LLMProvider type
   */
  private mapRegistryProviderToLLMProvider(registryProvider: string): LLMProvider {
    const p = registryProvider.toLowerCase();
    if (p === 'openai') return 'openai';
    if (p === 'anthropic') return 'anthropic';
    if (p === 'google' || p === 'gemini') return 'gemini';
    if (p === 'azure' || p === 'azure-openai') return 'azure';
    if (p === 'bedrock') return 'bedrock';
    if (p === 'groq') return 'groq';
    if (p === 'mistral') return 'mistral';
    if (p === 'ollama') return 'ollama';

    return this.defaultProvider;
  }

  /**
   * Map LLM provider to llm-info AI provider string.
   */
  private mapToAiProvider(provider: LLMProvider): AI_PROVIDER_TYPE {
    switch (provider) {
      case 'openai':
        return 'openai';
      case 'anthropic':
        return 'anthropic';
      case 'gemini':
        return 'google';
      case 'azure':
        return 'azure-openai';
      case 'bedrock':
        return 'google'; // Bedrock often hosts Anthropic/Mistral, but mapping is complex. Defaulting to safe choice or need update in llm-info
      case 'groq':
        return 'openai'; // Groq often hosts OSS models compatible with OpenAI SDK
      case 'mistral':
        return 'openai'; // Mistral often compatible
      case 'ollama':
        return 'openai'; // Ollama compatible
      default:
        return 'openai';
    }
  }

  /**
   * Build capability snapshot for a model.
   */
  private buildCapabilities(info?: ModelInfo): ModelRouterCapabilities {
    return {
      reasoning: info?.reasoning ?? false,
      coding: info?.recommendedForCoding ?? false,
      writing: info?.recommendedForWriting ?? false,
      vision: info?.supportsImageInput ?? false,
    };
  }

  /**
   * Check if candidate satisfies required capabilities.
   */
  private hasCapabilities(option: ModelRouterOption, capabilities: RouterCapability[]): boolean {
    return capabilities.every((capability) => option.capabilities[capability]);
  }

  /**
   * Estimate cost for a request.
   */
  private estimateCost(
    model: string,
    inputTokens?: number,
    outputTokens?: number,
    budgetUsd?: number,
  ): ModelRouterCostEstimate | undefined {
    if (!inputTokens && !outputTokens && budgetUsd === undefined) {
      return undefined;
    }

    const estimate: ModelRouterCostEstimate = {
      inputTokens,
      outputTokens,
      budgetUsd,
    };

    if ((inputTokens ?? 0) + (outputTokens ?? 0) > 0) {
      estimate.estimatedCostUsd = calculateCost(model, inputTokens ?? 0, outputTokens ?? 0);
    }

    return estimate;
  }

  /**
   * Emit router selection event for telemetry.
   */
  private emitRouterSelection(selection: ModelRouterSelection): void {
    if (!this.eventBus) {
      return;
    }

    const event: LLMRouterSelectionEvent = {
      type: 'llm.router.selection',
      timestamp: new Date(),
      model: selection.selectedModel,
      provider: selection.provider,
      fallbackChain: selection.fallbackChain,
      reason: selection.reason,
      taskType: selection.taskType,
      tenantId: selection.tenantId,
      candidateCount: selection.candidateCount,
      costEstimate: selection.costEstimate,
    };

    this.eventBus.emit('llm.router.selection', event);
  }

  /**
   * Provide a fallback model when no candidates are available.
   */
  private getDefaultCandidate(): string {
    return this.getFallbackModel(this.defaultProvider);
  }

  private getFallbackModel(provider: LLMProvider): string {
    const aiProvider = this.mapToAiProvider(provider);

    // Try to get dynamic fallback from registry
    const capable = getMostCapableModel(aiProvider);
    if (capable) return capable;

    const cheap = getCheapestModel(aiProvider);
    if (cheap) return cheap;

    // Last resort hardcoded fallbacks
    if (provider === 'openai') return 'gpt-4o';
    if (provider === 'anthropic') return 'claude-3-5-sonnet-latest';
    if (provider === 'gemini') return 'gemini-1.5-pro';

    return `${provider}/default`;
  }

  /**
   * Create a provider instance.
   */
  private createProvider(
    provider: LLMProvider,
    model: string,
    config?: Partial<ProviderConfig>,
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

      case 'gemini': {
        const geminiConfig: GeminiConfig = {
          ...baseConfig,
          apiKey: (config as GeminiConfig)?.apiKey,
          baseUrl: (config as GeminiConfig)?.baseUrl,
        };
        return new GeminiProvider(geminiConfig, this.eventBus);
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
export function createLLM(model: string, config?: Partial<ProviderConfig>): BaseLLM {
  return getDefaultRouter().create(model, config);
}

/**
 * Create an LLM instance with fallback chain using the default router.
 */
export function createLLMWithFallback(models: string[], config?: Partial<ProviderConfig>): BaseLLM {
  return getDefaultRouter().createWithFallback(models, config);
}
