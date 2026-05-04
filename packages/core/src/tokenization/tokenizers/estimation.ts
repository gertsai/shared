/**
 * @gertsai/core - Estimation Tokenizer
 *
 * Heuristic-based token estimation for models without local tokenizers.
 * Uses provider-specific multipliers to approximate token counts.
 *
 * Based on empirical testing:
 * - Claude uses ~20-30% more tokens than GPT for same text
 * - Gemini uses ~10% more tokens
 * - Llama often uses fewer tokens (smaller vocabulary)
 */

import {
  type IUniversalTokenizer,
  type TokenizerProvider,
  type TokenCountResult,
  type EstimationConfig,
  PROVIDER_TOKEN_MULTIPLIERS,
} from '../types.js';
import { inferProvider } from '../../llm/model-registry.js';

/**
 * Default estimation configuration.
 */
export const DEFAULT_ESTIMATION_CONFIG = {
  charsPerToken: 4,
  model: 'unknown',
} as const;

/**
 * EstimationTokenizer - heuristic-based token estimation.
 *
 * Uses character count and provider-specific multipliers for estimation.
 * Useful for models without local tokenizers (Claude, Gemini, etc.).
 *
 * @example
 * ```typescript
 * // For Claude (uses 1.25x multiplier)
 * const tokenizer = new EstimationTokenizer({ model: 'claude-3-5-sonnet' });
 * const result = await tokenizer.countTokens('Hello, world!');
 * console.log(result); // { count: ~5, method: 'estimated', provider: 'anthropic' }
 * ```
 */
export class EstimationTokenizer implements IUniversalTokenizer {
  readonly provider: TokenizerProvider;
  readonly isExact = false;

  private charsPerToken: number;
  private multiplier: number;
  private model: string;

  constructor(config: EstimationConfig = {}) {
    // Extract values with defaults (but NOT multiplier - we want to auto-detect)
    const charsPerToken = config.charsPerToken ?? DEFAULT_ESTIMATION_CONFIG.charsPerToken;
    const model = config.model ?? DEFAULT_ESTIMATION_CONFIG.model;
    const explicitMultiplier = config.multiplier; // May be undefined

    this.charsPerToken = charsPerToken;
    this.model = model;

    // Auto-detect provider and multiplier from model name
    if (model && model !== 'unknown') {
      const detectedProvider = inferProvider(model) as TokenizerProvider;
      this.provider = detectedProvider in PROVIDER_TOKEN_MULTIPLIERS ? detectedProvider : 'estimation';
      // Use explicit multiplier if provided, otherwise use provider-specific
      this.multiplier = explicitMultiplier ?? PROVIDER_TOKEN_MULTIPLIERS[this.provider] ?? 1.0;
    } else {
      this.provider = 'estimation';
      this.multiplier = explicitMultiplier ?? 1.0;
    }
  }

  /**
   * Count tokens using heuristic estimation.
   *
   * Formula: ceil(length / charsPerToken * multiplier)
   */
  async countTokens(text: string): Promise<TokenCountResult> {
    if (!text) {
      return {
        count: 0,
        method: 'estimated',
        provider: this.provider,
        model: this.model,
      };
    }

    // Base estimation: ~4 characters per token for English
    const baseCount = text.length / this.charsPerToken;

    // Apply provider-specific multiplier
    const adjustedCount = Math.ceil(baseCount * this.multiplier);

    return {
      count: adjustedCount,
      method: 'estimated',
      provider: this.provider,
      model: this.model,
    };
  }

  /**
   * Encode text to pseudo-tokens (estimation only).
   * Returns array of sequential IDs matching estimated count.
   */
  encode(text: string): number[] {
    if (!text) return [];

    const baseCount = text.length / this.charsPerToken;
    const count = Math.ceil(baseCount * this.multiplier);

    return Array.from({ length: count }, (_, i) => i);
  }

  /**
   * Decode is not supported for estimation.
   */
  decode(_tokens: number[]): string {
    return '';
  }

  /**
   * Estimation tokenizer supports all models (fallback).
   */
  supportsModel(_model: string): boolean {
    return true;
  }

  /**
   * Get current multiplier.
   */
  getMultiplier(): number {
    return this.multiplier;
  }

  /**
   * Set custom multiplier.
   */
  setMultiplier(multiplier: number): void {
    this.multiplier = Math.max(0.1, multiplier);
  }
}

/**
 * Create an estimation tokenizer for a model.
 *
 * @param model - Model name (e.g., 'claude-3-5-sonnet', 'gemini-1.5-pro')
 * @returns EstimationTokenizer with provider-specific multiplier
 */
export function createEstimationTokenizer(model?: string): EstimationTokenizer {
  return new EstimationTokenizer({ model });
}

/**
 * Create an estimation tokenizer for a specific provider.
 *
 * @param provider - Provider name
 * @returns EstimationTokenizer with provider-specific multiplier
 */
export function createProviderTokenizer(provider: TokenizerProvider): EstimationTokenizer {
  const multiplier = PROVIDER_TOKEN_MULTIPLIERS[provider] ?? 1.0;
  return new EstimationTokenizer({ multiplier });
}
