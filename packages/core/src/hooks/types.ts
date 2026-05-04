/**
 * @gertsai/core - Hook Types
 * Phase 19: Hooks & Lifecycle
 *
 * Core types for the hooks system merging Agno (decorators, background execution)
 * and CrewAI (global registry, event bus, filtering) patterns.
 *
 * Features:
 * - Pre/post hooks for agents, tools, workflows
 * - Background execution support
 * - Type-safe hook contexts
 * - Priority-based execution ordering
 * - Filter support (agents, tools)
 */

import type { LLMMessage, LLMTool, LLMResponse } from '../llm/types';

// ============================================================================
// Run Input/Output Types
// ============================================================================

/** Input content for agent run */
export interface RunInput {
  /** Main input content (string, object, or array) */
  inputContent: string | object | unknown[];
  /** Optional images */
  images?: ImageInput[];
  /** Optional videos */
  videos?: VideoInput[];
  /** Optional audio files */
  audios?: AudioInput[];
  /** Optional file attachments */
  files?: FileInput[];

  /** Convert input to string representation */
  inputContentString(): string;
  /** Convert to dictionary representation */
  toDict(): Record<string, unknown>;
}

/** Image input */
export interface ImageInput {
  url?: string;
  base64?: string;
  mimeType?: string;
}

/** Video input */
export interface VideoInput {
  url?: string;
  base64?: string;
  mimeType?: string;
}

/** Audio input */
export interface AudioInput {
  url?: string;
  base64?: string;
  mimeType?: string;
}

/** File input */
export interface FileInput {
  name: string;
  content: string | Buffer;
  mimeType?: string;
}

/** Execution context for a run */
export interface RunContext {
  /** Unique run identifier */
  runId: string;
  /** Session identifier */
  sessionId: string;
  /** Optional user identifier */
  userId?: string;
  /** Tenant identifier for multi-tenancy */
  tenantId?: string;

  /** Mutable dependencies - modifications persist */
  dependencies?: Record<string, unknown>;
  /** Knowledge base filters */
  knowledgeFilters?: Record<string, unknown> | FilterExpr[];
  /** Mutable metadata */
  metadata?: Record<string, unknown>;
  /** Mutable session state */
  sessionState?: Record<string, unknown>;
  /** Output schema for structured responses */
  outputSchema?: Record<string, unknown>;
}

/** Filter expression for knowledge base */
export interface FilterExpr {
  field: string;
  operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'contains';
  value: unknown;
}

/** Run status */
export type RunStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'suspended'
  | 'cancelled';

/** Metrics for a run */
export interface RunMetrics {
  /** Duration in milliseconds */
  durationMs: number;
  /** Token usage */
  tokens?: {
    prompt: number;
    completion: number;
    total: number;
  };
  /** Number of iterations */
  iterations?: number;
  /** Number of tool calls */
  toolCalls?: number;
}

/** Tool execution record */
export interface ToolExecution {
  /** Tool name */
  name: string;
  /** Tool arguments */
  arguments: Record<string, unknown>;
  /** Tool result */
  result?: unknown;
  /** Duration in milliseconds */
  durationMs?: number;
  /** Error if failed */
  error?: string;
}

/** Reasoning step */
export interface ReasoningStep {
  /** Step index */
  index: number;
  /** Step content */
  content: string;
  /** Step type */
  type?: 'thought' | 'action' | 'observation';
}

/** Output from an agent run */
export interface RunOutput {
  /** Main content output */
  content: unknown;
  /** All messages in the conversation */
  messages: LLMMessage[];

  /** Media outputs */
  images?: ImageInput[];
  videos?: VideoInput[];
  audios?: AudioInput[];
  responseAudio?: AudioInput;

  /** Execution metadata */
  runId: string;
  sessionId: string;
  agentId: string;
  agentName: string;
  status: RunStatus;
  metrics?: RunMetrics;

  /** Tool execution records */
  tools?: ToolExecution[];

  /** Reasoning steps */
  reasoningSteps?: ReasoningStep[];

  /** Input context (read-only) */
  input?: RunInput;
}

// ============================================================================
// Function Call Types
// ============================================================================

/** Function/tool call request */
export interface FunctionCall {
  /** Function definition */
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
  /** Arguments to pass (mutable in pre-hooks) */
  arguments: Record<string, unknown>;
  /** Result (only set in post-hooks) */
  result?: unknown;
}

// ============================================================================
// Hook Parameter Types
// ============================================================================

/** Parameters passed to pre-hooks */
export interface PreHookParams {
  /** Input to the agent run */
  runInput: RunInput;
  /** Execution context */
  runContext: RunContext;
  /** Optional agent reference */
  agent?: unknown;
  /** Optional session reference */
  session?: unknown;
  /** Mutable dependencies */
  dependencies?: Record<string, unknown>;
  /** Mutable metadata */
  metadata?: Record<string, unknown>;
  /** Mutable session state */
  sessionState?: Record<string, unknown>;
  /** Index signature for compatibility with Record<string, unknown> */
  [key: string]: unknown;
}

/** Parameters passed to post-hooks */
export interface PostHookParams {
  /** Output from the agent run */
  runOutput: RunOutput;
  /** Execution context */
  runContext: RunContext;
  /** Optional agent reference */
  agent?: unknown;
  /** Optional session reference */
  session?: unknown;
  /** Mutable dependencies */
  dependencies?: Record<string, unknown>;
  /** Mutable metadata */
  metadata?: Record<string, unknown>;
  /** Mutable session state */
  sessionState?: Record<string, unknown>;
  /** Index signature for compatibility with Record<string, unknown> */
  [key: string]: unknown;
}

// ============================================================================
// Hook Function Types
// ============================================================================

/**
 * Pre-hook function type.
 * Executes before agent processes input.
 * Can modify: runInput, runContext, sessionState, dependencies, metadata
 * Can block: Yes (throw InputCheckError)
 */
export type PreHook = (params: PreHookParams) => void | Promise<void>;

/**
 * Post-hook function type.
 * Executes after agent generates output.
 * Can modify: runOutput.content, runOutput metadata
 * Can block: Yes (throw OutputCheckError)
 */
export type PostHook = (params: PostHookParams) => void | Promise<void>;

/**
 * Tool pre-hook function type.
 * Executes before tool is called.
 * Can modify: toolInput (mutable arguments)
 * Can block: Yes (return false)
 * @returns false to block execution, null to continue
 */
export type ToolPreHook = (
  fc: FunctionCall
) => boolean | null | Promise<boolean | null>;

/**
 * Tool post-hook function type.
 * Executes after tool returns result.
 * Can modify: Return modified result string
 * @returns Modified result or null to keep original
 */
export type ToolPostHook = (
  fc: FunctionCall
) => string | null | Promise<string | null>;

/**
 * LLM pre-hook function type (for global registry).
 * Executes before LLM call.
 * @returns false to block execution, null to continue
 */
export type BeforeLLMHook = (
  context: LLMCallHookContext
) => boolean | null | Promise<boolean | null>;

/**
 * LLM post-hook function type (for global registry).
 * Executes after LLM call.
 * @returns Modified response or null to keep original
 */
export type AfterLLMHook = (
  context: LLMCallHookContext
) => string | null | Promise<string | null>;

/**
 * Tool pre-hook for global registry.
 * @returns false to block execution, null to continue
 */
export type BeforeToolHook = (
  context: ToolCallHookContext
) => boolean | null | Promise<boolean | null>;

/**
 * Tool post-hook for global registry.
 * @returns Modified result or null to keep original
 */
export type AfterToolHook = (
  context: ToolCallHookContext
) => string | null | Promise<string | null>;

// ============================================================================
// Hook Context Types (for global registry)
// ============================================================================

/** Context passed to LLM hooks */
export interface LLMCallHookContext {
  /** Executor reference */
  executor?: unknown;
  /** Messages to send to LLM (mutable in pre-hooks) */
  messages: LLMMessage[];
  /** LLM instance */
  llm: unknown;
  /** Current iteration count */
  iterations: number;

  /** Agent reference */
  agent?: unknown;
  /** Task reference */
  task?: unknown;
  /** Workflow reference */
  workflow?: unknown;

  /** Response (only in after hooks) */
  response?: string;
  /** Tools available */
  tools?: LLMTool[];

  /** Request human input during hook execution */
  requestHumanInput?(
    prompt: string,
    defaultMessage?: string
  ): Promise<string>;
}

/** Context passed to tool hooks */
export interface ToolCallHookContext {
  /** Tool name */
  toolName: string;
  /** Tool input arguments (mutable in pre-hooks) */
  toolInput: Record<string, unknown>;
  /** Tool reference */
  tool: unknown;

  /** Agent reference */
  agent?: unknown;
  /** Task reference */
  task?: unknown;
  /** Workflow reference */
  workflow?: unknown;

  /** Tool result (only in after hooks) */
  toolResult?: string;

  /** Request human input for tool approval */
  requestHumanInput?(
    prompt: string,
    defaultMessage?: string
  ): Promise<string>;
}

// ============================================================================
// Hook-Like Objects (Guardrails, Evaluators)
// ============================================================================

/** Guardrail interface for input/output validation */
export interface Guardrail {
  /** Guardrail name */
  name: string;
  /** Check method that throws on violation */
  check(params: PreHookParams | PostHookParams): void | Promise<void>;
}

/** Evaluator interface for pre/post checks */
export interface Evaluator {
  /** Evaluator name */
  name: string;
  /** Pre-check (optional) */
  preCheck?(params: PreHookParams): void | Promise<void>;
  /** Post-check (optional) */
  postCheck?(params: PostHookParams): void | Promise<void>;
}

/** Union type for hook-like objects */
export type HookLike = PreHook | PostHook | Guardrail | Evaluator;

// ============================================================================
// Hook Metadata
// ============================================================================

/** Metadata attached to hook functions */
export interface HookMetadata {
  /** Hook name */
  name: string;
  /** Run in background (non-blocking) */
  runInBackground?: boolean;
  /** Filter to specific agents */
  filterAgents?: string[];
  /** Filter to specific tools */
  filterTools?: string[];
  /** Priority (higher = earlier execution) */
  priority?: number;
}

/** Hook filter configuration */
export interface HookFilters {
  /** Filter by agent name/role */
  agents?: string[];
  /** Filter by tool name */
  tools?: string[];
}

// ============================================================================
// Check Trigger & Errors
// ============================================================================

/** Trigger reason for check errors */
export enum CheckTrigger {
  INPUT_NOT_ALLOWED = 'input_not_allowed',
  OUTPUT_NOT_ALLOWED = 'output_not_allowed',
  OFF_TOPIC = 'off_topic',
  PII_DETECTED = 'pii_detected',
  PROMPT_INJECTION = 'prompt_injection',
  UNSAFE_CONTENT = 'unsafe_content',
  QUOTA_EXCEEDED = 'quota_exceeded',
  TOOL_BLOCKED = 'tool_blocked',
  VALIDATION_FAILED = 'validation_failed',
}

/** Error thrown by input validation hooks */
export class InputCheckError extends Error {
  constructor(
    message: string,
    public readonly checkTrigger: CheckTrigger
  ) {
    super(message);
    this.name = 'InputCheckError';
    Object.setPrototypeOf(this, InputCheckError.prototype);
  }
}

/** Error thrown by output validation hooks */
export class OutputCheckError extends Error {
  constructor(
    message: string,
    public readonly checkTrigger: CheckTrigger
  ) {
    super(message);
    this.name = 'OutputCheckError';
    Object.setPrototypeOf(this, OutputCheckError.prototype);
  }
}

// ============================================================================
// Workflow Callback Types
// ============================================================================

/** Callback before workflow kickoff */
export type BeforeKickoffCallback = (
  inputs: Record<string, unknown> | null
) => Record<string, unknown> | null | Promise<Record<string, unknown> | null>;

/** Callback after workflow kickoff */
export type AfterKickoffCallback = (
  output: unknown
) => unknown | Promise<unknown>;

/** Step callback (per agent iteration) */
export type StepCallback = (step: StepInfo) => void | Promise<void>;

/** Task callback (per task completion) */
export type TaskCallback = (output: TaskOutput) => void | Promise<void>;

/** Step information */
export interface StepInfo {
  /** Step index */
  index: number;
  /** Agent that executed the step */
  agentName: string;
  /** Input to the step */
  input: unknown;
  /** Output from the step */
  output: unknown;
  /** Duration in milliseconds */
  durationMs: number;
  /** Tool calls made */
  toolCalls?: ToolExecution[];
}

/** Task output */
export interface TaskOutput {
  /** Task name */
  taskName: string;
  /** Task description */
  description: string;
  /** Task output */
  output: unknown;
  /** Agent that executed the task */
  agentName: string;
}

// ============================================================================
// Event Types
// ============================================================================

/** Run event types */
export enum RunEvent {
  // Run lifecycle
  RUN_STARTED = 'run_started',
  RUN_CONTENT = 'run_content',
  RUN_COMPLETED = 'run_completed',
  RUN_ERROR = 'run_error',
  RUN_CANCELLED = 'run_cancelled',
  RUN_PAUSED = 'run_paused',
  RUN_CONTINUED = 'run_continued',

  // Hook events
  PRE_HOOK_STARTED = 'pre_hook_started',
  PRE_HOOK_COMPLETED = 'pre_hook_completed',
  PRE_HOOK_ERROR = 'pre_hook_error',
  POST_HOOK_STARTED = 'post_hook_started',
  POST_HOOK_COMPLETED = 'post_hook_completed',
  POST_HOOK_ERROR = 'post_hook_error',

  // Tool events
  TOOL_CALL_STARTED = 'tool_call_started',
  TOOL_CALL_COMPLETED = 'tool_call_completed',
  TOOL_CALL_ERROR = 'tool_call_error',

  // LLM events
  LLM_CALL_STARTED = 'llm_call_started',
  LLM_CALL_COMPLETED = 'llm_call_completed',
  LLM_CALL_ERROR = 'llm_call_error',

  // Memory events
  MEMORY_UPDATE_STARTED = 'memory_update_started',
  MEMORY_UPDATE_COMPLETED = 'memory_update_completed',

  // Custom event
  CUSTOM_EVENT = 'custom_event',
}

/** Base event interface */
export interface HookEvent {
  /** Event type */
  type: RunEvent | string;
  /** Event timestamp */
  timestamp: Date;
  /** Source fingerprint for tracking */
  sourceFingerprint?: string;
  /** Source type */
  sourceType?: 'workflow' | 'agent' | 'task' | 'tool';
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/** Hook execution event */
export interface HookExecutionEvent extends HookEvent {
  /** Hook name */
  hookName: string;
  /** Hook type */
  hookType: 'pre' | 'post';
  /** Duration in milliseconds */
  durationMs?: number;
  /** Whether hook ran in background */
  isBackground?: boolean;
  /** Error if failed */
  error?: string;
}

// ============================================================================
// Hook Executor Configuration
// ============================================================================

/** Configuration for hook executor */
export interface HookExecutorConfig {
  /** Concurrency for background hooks */
  backgroundConcurrency?: number;
  /** Timeout for background hooks in milliseconds */
  backgroundTimeout?: number;
  /** Whether to deep copy arguments for background hooks */
  deepCopyForBackground?: boolean;
}

/** Keys to deep copy for background hooks */
export const BACKGROUND_HOOK_COPY_KEYS = new Set([
  'runInput',
  'runContext',
  'runOutput',
  'sessionState',
  'dependencies',
  'metadata',
]);
