/**
 * Cost calculation utilities.
 *
 * All prices stored in per-token format (USD).
 * Use toPerMillion() to convert for display.
 */

import type { CostInput, CostResult, ModelInfo, TokenPricing } from './types';
import { ONE_MILLION } from './types';
import { getModel, findModel } from './models';

// ==================== Conversion ====================

/**
 * Convert per-token price to per-million-tokens.
 *
 * @example
 * ```ts
 * toPerMillion(2.5e-06) // → 2.5  ($2.50 per 1M tokens)
 * toPerMillion(1e-05)   // → 10   ($10.00 per 1M tokens)
 * ```
 */
export function toPerMillion(perToken: number): number {
  return perToken * ONE_MILLION;
}

/**
 * Convert per-million-tokens price to per-token.
 *
 * @example
 * ```ts
 * toPerToken(2.5) // → 2.5e-06
 * ```
 */
export function toPerToken(perMillion: number): number {
  return perMillion / ONE_MILLION;
}

/**
 * Format price for display.
 *
 * @example
 * ```ts
 * formatPrice(2.5e-06)    // → "$2.50 / 1M tokens"
 * formatPrice(2.5e-06, 4) // → "$2.5000 / 1M tokens"
 * ```
 */
export function formatPrice(perToken: number, decimals = 2): string {
  const perM = toPerMillion(perToken);
  return `$${perM.toFixed(decimals)} / 1M tokens`;
}

/**
 * Format a cost result for display.
 *
 * @example
 * ```ts
 * formatCost(0.0875) // → "$0.09"
 * formatCost(1.234)  // → "$1.23"
 * ```
 */
export function formatCost(usd: number, decimals = 2): string {
  return `$${usd.toFixed(decimals)}`;
}

// ==================== Cost Calculation ====================

/**
 * Calculate cost from token pricing and usage.
 *
 * @example
 * ```ts
 * const cost = calculateCostFromPricing(
 *   { input: 2.5e-06, output: 1e-05, cacheRead: 1.25e-06 },
 *   { inputTokens: 15000, outputTokens: 5000, cachedTokens: 5000 }
 * );
 * // cost.totalCost → 0.075625
 * ```
 */
export function calculateCostFromPricing(pricing: TokenPricing, usage: CostInput): CostResult {
  const { inputTokens, outputTokens, cachedTokens = 0, reasoningTokens = 0 } = usage;

  // Non-cached input tokens
  const nonCachedInput = Math.max(0, inputTokens - cachedTokens);
  const inputCost = nonCachedInput * pricing.input;

  // Cached input tokens (use cache read price, or 0 if no cache pricing)
  const cacheSavings =
    cachedTokens > 0 && pricing.cacheRead != null
      ? cachedTokens * (pricing.cacheRead - pricing.input) // negative = savings
      : 0;
  const cachedCost =
    cachedTokens > 0 && pricing.cacheRead != null
      ? cachedTokens * pricing.cacheRead
      : cachedTokens * pricing.input;

  // Regular output tokens (non-reasoning)
  const regularOutput = Math.max(0, outputTokens - reasoningTokens);
  const outputCost = regularOutput * pricing.output;

  // Reasoning tokens (use reasoning price if available, else output price)
  const reasoningPrice = pricing.reasoningOutput ?? pricing.output;
  const reasoningCost = reasoningTokens * reasoningPrice;

  const totalCost = inputCost + cachedCost + outputCost + reasoningCost;

  return {
    inputCost: inputCost + cachedCost,
    outputCost,
    cacheSavings,
    reasoningCost,
    totalCost,
    breakdown: {
      inputPerToken: pricing.input,
      outputPerToken: pricing.output,
      ...(pricing.cacheRead != null && { cacheReadPerToken: pricing.cacheRead }),
      ...(pricing.reasoningOutput != null && { reasoningPerToken: pricing.reasoningOutput }),
    },
  };
}

/**
 * Calculate cost for a model by ID.
 *
 * @example
 * ```ts
 * const cost = calculateCost('gpt-4o', { inputTokens: 15000, outputTokens: 5000 });
 * console.log(cost?.totalCost);           // 0.0875
 * console.log(formatCost(cost.totalCost)); // "$0.09"
 * ```
 */
export function calculateCost(modelId: string, usage: CostInput): CostResult | undefined {
  const model = getModel(modelId) ?? findModel(modelId);
  if (!model) return undefined;
  return calculateCostFromPricing(model.tokenPricing, usage);
}

/**
 * Compare costs across multiple models for the same usage.
 *
 * @example
 * ```ts
 * const comparison = compareCosts(
 *   ['gpt-4o', 'claude-3-5-sonnet-20241022', 'gemini-1.5-pro'],
 *   { inputTokens: 100000, outputTokens: 5000 }
 * );
 * // Returns sorted by totalCost (cheapest first)
 * ```
 */
export function compareCosts(
  modelIds: string[],
  usage: CostInput,
): Array<{ modelId: string; model: ModelInfo; cost: CostResult }> {
  const results: Array<{ modelId: string; model: ModelInfo; cost: CostResult }> = [];

  for (const id of modelIds) {
    const model = getModel(id) ?? findModel(id);
    if (!model) continue;
    const cost = calculateCostFromPricing(model.tokenPricing, usage);
    results.push({ modelId: id, model, cost });
  }

  return results.toSorted((a, b) => a.cost.totalCost - b.cost.totalCost);
}

/**
 * Get pricing summary for display (per million tokens).
 *
 * @example
 * ```ts
 * const summary = getPricingSummary('gpt-4o');
 * // {
 * //   inputPerMToken: 2.5,
 * //   outputPerMToken: 10,
 * //   cacheReadPerMToken: 1.25,
 * //   formattedInput: "$2.50 / 1M tokens",
 * //   formattedOutput: "$10.00 / 1M tokens",
 * // }
 * ```
 */
export function getPricingSummary(modelId: string):
  | {
      inputPerMToken: number;
      outputPerMToken: number;
      cacheReadPerMToken?: number;
      cacheWritePerMToken?: number;
      batchInputPerMToken?: number;
      batchOutputPerMToken?: number;
      reasoningOutputPerMToken?: number;
      formattedInput: string;
      formattedOutput: string;
    }
  | undefined {
  const model = getModel(modelId) ?? findModel(modelId);
  if (!model) return undefined;

  const p = model.tokenPricing;
  return {
    inputPerMToken: toPerMillion(p.input),
    outputPerMToken: toPerMillion(p.output),
    ...(p.cacheRead != null && { cacheReadPerMToken: toPerMillion(p.cacheRead) }),
    ...(p.cacheWrite != null && { cacheWritePerMToken: toPerMillion(p.cacheWrite) }),
    ...(p.batchInput != null && { batchInputPerMToken: toPerMillion(p.batchInput) }),
    ...(p.batchOutput != null && { batchOutputPerMToken: toPerMillion(p.batchOutput) }),
    ...(p.reasoningOutput != null && { reasoningOutputPerMToken: toPerMillion(p.reasoningOutput) }),
    formattedInput: formatPrice(p.input),
    formattedOutput: formatPrice(p.output),
  };
}
