/**
 * @gerts/core - LLM Types
 * Phase 21: LLM Abstraction
 *
 * Core types for LLM integration following CrewAI patterns:
 * - Native SDK priority (OpenAI, Anthropic)
 * - Factory pattern with smart routing
 * - Token usage tracking
 * - Event-driven architecture
 */

// ==================== JSON Schema Types ====================

/** JSON Schema primitive types */
export type JSONSchemaType =
  | 'string'
  | 'number'
  | 'integer'
  | 'boolean'
  | 'object'
  | 'array'
  | 'null';

/** JSON Schema definition (minimal type-safe interface) */
export interface JSONSchemaDefinition {
  /** Schema type */
  type?: JSONSchemaType | JSONSchemaType[];
  /** Schema title */
  title?: string;
  /** Schema description */
  description?: string;
  /** Default value */
  default?: unknown;
  /** Enum values */
  enum?: unknown[];
  /** Const value */
  const?: unknown;

  // String constraints
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  format?: string;

  // Number constraints
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  multipleOf?: number;

  // Array constraints
  items?: JSONSchemaDefinition | JSONSchemaDefinition[];
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;

  // Object constraints
  properties?: Record<string, JSONSchemaDefinition>;
  required?: string[];
  additionalProperties?: boolean | JSONSchemaDefinition;
  patternProperties?: Record<string, JSONSchemaDefinition>;

  // Composition
  allOf?: JSONSchemaDefinition[];
  anyOf?: JSONSchemaDefinition[];
  oneOf?: JSONSchemaDefinition[];
  not?: JSONSchemaDefinition;

  // References
  $ref?: string;
  $defs?: Record<string, JSONSchemaDefinition>;
  definitions?: Record<string, JSONSchemaDefinition>;
}

// ==================== Message Types ====================

/** Message role in LLM conversation */
export type LLMRole = 'system' | 'user' | 'assistant' | 'tool';

/** Single message in LLM conversation */
export interface LLMMessage {
  /** Role of the message sender */
  role: LLMRole;
  /** Content of the message (string or structured) */
  content: string | LLMContentBlock[];
  /** Tool call ID (for tool responses) */
  toolCallId?: string;
  /** Name of the function/tool (for tool calls) */
  name?: string;
}

/** Content block for multi-modal messages */
export interface LLMContentBlock {
  type: 'text' | 'image' | 'tool_use' | 'tool_result';
  text?: string;
  imageUrl?: string;
  toolUseId?: string;
  toolName?: string;
  input?: Record<string, unknown>;
  content?: string;
}

/** Token usage metrics */
export interface TokenUsage {
  /** Total tokens used */
  totalTokens: number;
  /** Tokens used for prompt */
  promptTokens: number;
  /** Tokens used for completion */
  completionTokens: number;
  /** Cached prompt tokens (if applicable) */
  cachedPromptTokens?: number;
}

/** Aggregated usage metrics across multiple calls */
export interface UsageMetrics extends TokenUsage {
  /** Number of successful requests */
  successfulRequests: number;
}

/** LLM response from a call */
export interface LLMResponse {
  /** Generated content */
  content: string;
  /** Token usage information */
  usage: TokenUsage;
  /** Model used for generation */
  model: string;
  /** Finish reason */
  finishReason?: 'stop' | 'length' | 'tool_calls' | 'content_filter';
  /** Tool calls requested by the model */
  toolCalls?: LLMToolCall[];
}

/** Tool call requested by the model */
export interface LLMToolCall {
  /** Unique ID of the tool call */
  id: string;
  /** Type of the tool call */
  type: 'function';
  /** Function details */
  function: {
    /** Name of the function to call */
    name: string;
    /** JSON arguments to pass */
    arguments: string;
  };
}

/** LLM configuration options */
export interface LLMConfig {
  /** Model identifier (e.g., 'gpt-4o', 'claude-3-5-sonnet') */
  model: string;
  /** Sampling temperature (0-2) */
  temperature?: number;
  /** Maximum tokens to generate */
  maxTokens?: number;
  /** Enable streaming responses */
  streaming?: boolean;
  /** Stop sequences */
  stop?: string[];
  /** Top-p sampling */
  topP?: number;
  /** Frequency penalty */
  frequencyPenalty?: number;
  /** Presence penalty */
  presencePenalty?: number;
  /** Seed for reproducibility */
  seed?: number;
  /** Timeout in milliseconds */
  timeout?: number;
  /** Maximum retries on failure */
  maxRetries?: number;
}

/** Provider-specific configuration */
export interface LLMProviderConfig extends LLMConfig {
  /** API key for the provider */
  apiKey?: string;
  /** Base URL for API requests */
  baseUrl?: string;
  /** Organization ID (OpenAI) */
  organization?: string;
  /** Project ID (OpenAI) */
  project?: string;
}

/** Tool definition for function calling */
export interface LLMTool {
  /** Type of the tool */
  type: 'function';
  /** Function definition */
  function: {
    /** Name of the function */
    name: string;
    /** Description of what the function does */
    description: string;
    /** JSON Schema for the function parameters */
    parameters: JSONSchemaDefinition;
  };
}

/** Options for LLM call */
export interface LLMCallOptions {
  /** Tools available for the model to use */
  tools?: LLMTool[];
  /** Response format schema (for structured outputs) */
  responseFormat?: LLMResponseFormat;
  /** Available function implementations */
  availableFunctions?: Record<string, (...args: unknown[]) => unknown>;
  /** Metadata for the call */
  metadata?: Record<string, unknown>;
  /** Temperature for sampling (0-2, lower = more deterministic) */
  temperature?: number;
  /** Maximum tokens to generate */
  maxTokens?: number;
  /** Top-p sampling (nucleus sampling) */
  topP?: number;
  /** Stop sequences to end generation */
  stopSequences?: string[];
  /** Hint for LLM providers that support prompt caching (Anthropic, Gemini) */
  cacheControl?: { type: 'ephemeral' };
}

/** Response format configuration */
export interface LLMResponseFormat {
  /** Type of response format */
  type: 'text' | 'json_object' | 'json_schema';
  /** JSON schema definition (for json_schema type) */
  jsonSchema?: {
    /** Schema name */
    name: string;
    /** JSON Schema definition */
    schema: JSONSchemaDefinition;
    /** Whether to enforce strict schema validation */
    strict?: boolean;
  };
}

/** LLM provider identifier */
export type LLMProvider =
  | 'openai'
  | 'anthropic'
  | 'azure'
  | 'gemini'
  | 'bedrock'
  | 'groq'
  | 'mistral'
  | 'ollama';

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
export { CONTEXT_WINDOW_USAGE_RATIO, DEFAULT_CONTEXT_WINDOW_SIZE } from './model-registry';

// Legacy exports for backwards compatibility - use model-registry functions instead
/** @deprecated Use getContextWindowSize() from model-registry instead */
export const LLM_CONTEXT_WINDOWS: Record<string, number> = {};

/** @deprecated Use getModelsForProvider('OpenAI') from model-registry instead */
export const OPENAI_MODELS = new Set<string>();

/** @deprecated Use getModelsForProvider('Anthropic') from model-registry instead */
export const ANTHROPIC_MODELS = new Set<string>();

/** Event types for LLM operations */
export type LLMEventType =
  | 'llm.call.started'
  | 'llm.call.completed'
  | 'llm.call.failed'
  | 'llm.call.streamed'
  | 'llm.router.selection'
  | 'llm.tool.started'
  | 'llm.tool.completed'
  | 'llm.tool.failed';

/** Base event for LLM operations */
export interface LLMEvent {
  type: LLMEventType;
  timestamp: Date;
  model: string;
}

/** Event emitted when LLM call starts */
export interface LLMCallStartedEvent extends LLMEvent {
  type: 'llm.call.started';
  messages: LLMMessage[];
  tools?: LLMTool[];
}

/** Event emitted when LLM call completes */
export interface LLMCallCompletedEvent extends LLMEvent {
  type: 'llm.call.completed';
  response: LLMResponse;
  durationMs: number;
}

/** Event emitted when LLM call fails */
export interface LLMCallFailedEvent extends LLMEvent {
  type: 'llm.call.failed';
  error: string;
  durationMs: number;
}

/** Event emitted for streaming chunk */
export interface LLMCallStreamedEvent extends LLMEvent {
  type: 'llm.call.streamed';
  chunk: string;
  index: number;
}

/** Event emitted when tool execution starts */
export interface LLMToolStartedEvent extends LLMEvent {
  type: 'llm.tool.started';
  toolName: string;
  toolArgs: Record<string, unknown>;
}

/** Event emitted when tool execution completes */
export interface LLMToolCompletedEvent extends LLMEvent {
  type: 'llm.tool.completed';
  toolName: string;
  result: unknown;
  durationMs: number;
}

/** Event emitted when tool execution fails */
export interface LLMToolFailedEvent extends LLMEvent {
  type: 'llm.tool.failed';
  toolName: string;
  error: string;
  durationMs: number;
}
