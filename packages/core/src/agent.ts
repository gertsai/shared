/**
 * @gertsai/core - Agent Interface
 *
 * Core interface for agent implementations to avoid circular dependencies.
 * This interface defines the contract that all agent implementations must follow.
 *
 * Used for dependency injection pattern in multi-agent orchestration.
 */

/**
 * Result of agent execution.
 */
export interface AgentRunResult {
  /** Status of the run */
  readonly status: 'completed' | 'failed' | 'timeout' | 'cancelled';

  /** Output content */
  readonly content: string;

  /** Session ID */
  readonly sessionId: string;

  /** Error message if failed */
  readonly error?: string;
}

/**
 * Options for agent execution.
 */
export interface AgentRunOptions {
  /** Session ID to use or resume */
  sessionId?: string;

  /** Maximum iterations for reasoning loops */
  maxIterations?: number;

  /** Execution timeout in milliseconds */
  timeout?: number;

  /** Session state to merge */
  sessionState?: Record<string, unknown>;
}

/**
 * Core interface for agent implementations.
 *
 * This interface abstracts the agent implementation details to prevent
 * circular dependencies between packages.
 *
 * @example
 * ```typescript
 * const agent: IAgent = createAgent({
 *   role: 'Research Assistant',
 *   goal: 'Help users find information',
 *   tenantId: 'tenant-123',
 * });
 *
 * const result = await agent.run('What is GraphRAG?');
 * console.log(result.content);
 * ```
 */
export interface IAgent {
  /**
   * Get the agent's unique identifier.
   */
  getId(): string;

  /**
   * Get the agent's role.
   */
  getRole(): string;

  /**
   * Get the agent's goal.
   */
  getGoal(): string;

  /**
   * Execute the agent with input.
   *
   * @param input - User input (string, message, or messages — narrow via `typeof` / schema check)
   * @param options - Run options
   * @returns Run result with response and status
   */
  run(input: string | unknown, options?: AgentRunOptions): Promise<AgentRunResult>;

  /**
   * Tenant ID for multi-tenancy isolation.
   */
  readonly tenantId: string;
}

/**
 * Factory function type for creating agents.
 *
 * Used for dependency injection to avoid circular dependencies.
 */
export type AgentFactory = (config: AgentFactoryConfig) => IAgent;

/**
 * Minimum structural shape consumed from a `BaseLLM`-style LLM instance
 * (Wave 12.D-fix per FR-016).
 *
 * Replicated locally to keep `AgentFactoryConfig` type-safe without
 * a circular dep on the `llm/` module. Concrete provider classes
 * (`OpenAIProvider`, `AnthropicProvider`, `GeminiProvider`, etc.) satisfy
 * this via structural typing — both `provider` and `model` are
 * `readonly` public fields on the abstract `BaseLLM`.
 */
export interface IBaseLLM {
  /** Provider name, e.g. 'openai' | 'anthropic' | 'gemini' */
  readonly provider: string;
  /** Model identifier, e.g. 'gpt-4o' | 'claude-3-5-sonnet-20241022' */
  readonly model: string;
}

/**
 * Minimum structural shape for agent tools (Wave 12.D-fix per FR-016).
 *
 * Concrete tool classes from `@gertsai/agents` / consumer packages satisfy
 * this structurally — every tool has at least a `name`. The optional
 * `description` mirrors `LLMTool.function.description` semantics.
 */
export interface ITool {
  /** Tool name (used for routing / registration) */
  readonly name: string;
  /** Optional human-readable description */
  readonly description?: string;
}

/**
 * Configuration for agent factory.
 *
 * Minimal configuration needed to create an agent.
 */
export interface AgentFactoryConfig {
  /** Agent role */
  role: string;

  /** Agent goal */
  goal: string;

  /** Agent backstory */
  backstory: string;

  /** LLM model (structural — BaseLLM-shape, no circular dep) */
  model: IBaseLLM;

  /** Tenant ID */
  tenantId: string;

  /** Tools available to agent (structural — readonly to discourage in-place mutation) */
  tools?: readonly ITool[];

  /** Enable verbose logging */
  verbose?: boolean;
}
