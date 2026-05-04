import type { LLMEvent, LLMProvider } from './types';

/** Task types used for routing decisions */
export type RouterTaskType = 'simple' | 'complex' | 'creative';

/** Capability flags available on models */
export type RouterCapability = 'vision' | 'reasoning' | 'coding' | 'writing';

/** Capability map describing what a model can do */
export interface ModelRouterCapabilities {
  vision: boolean;
  reasoning: boolean;
  coding: boolean;
  writing: boolean;
}

/** Raw pricing metadata for a model */
export interface ModelRouterPricing {
  /** Input price per million tokens (USD) */
  inputPerMillion?: number;
  /** Output price per million tokens (USD) */
  outputPerMillion?: number;
}

/** Estimated cost for a single request */
export interface ModelRouterCostEstimate {
  /** Tokens used on the prompt */
  inputTokens?: number;
  /** Tokens generated in the completion */
  outputTokens?: number;
  /** Estimated cost (USD) */
  estimatedCostUsd?: number;
  /** Budget constraint provided by the caller */
  budgetUsd?: number;
}

/** Serialized description of a single model candidate */
export interface ModelRouterOption {
  model: string;
  provider: LLMProvider;
  name?: string;
  description?: string;
  contextWindow: number;
  capabilities: ModelRouterCapabilities;
  pricing?: ModelRouterPricing;
  estimatedCostPerMillion?: number;
  legacy?: boolean;
}

/** Selection that the router made for the caller */
export interface ModelRouterSelection {
  selectedModel: string;
  provider: LLMProvider;
  fallbackChain: string[];
  reason: string;
  taskType?: RouterTaskType;
  costEstimate?: ModelRouterCostEstimate;
  tenantId?: string;
  candidateCount: number;
}

/** Request object used by the router API */
export interface ModelRouterRequest {
  /** Optional hint for the exact model name */
  model?: string;
  /** Provider override (openai/anthropic/gemini) */
  provider?: LLMProvider;
  /** Task type for cost/capabilities estimation */
  taskType?: RouterTaskType;
  /** Budget in USD (optional) */
  budgetUsd?: number;
  /** Required capabilities */
  capabilities?: RouterCapability[];
  /** Optional tokens used to estimate cost */
  inputTokens?: number;
  outputTokens?: number;
  /** Tenant hint for telemetry */
  tenantId?: string;
}

/** Router response payload */
export interface ModelRouterResponse {
  options: ModelRouterOption[];
  selection: ModelRouterSelection;
}

/** Result returned by the router helper */
export interface ModelRouterSelectionResult {
  options: ModelRouterOption[];
  selection: ModelRouterSelection;
}

/** Event emitted when the router makes a selection */
export interface LLMRouterSelectionEvent extends LLMEvent {
  type: 'llm.router.selection';
  provider: LLMProvider;
  fallbackChain: string[];
  reason: string;
  taskType?: RouterTaskType;
  tenantId?: string;
  candidateCount: number;
  costEstimate?: ModelRouterCostEstimate;
}
