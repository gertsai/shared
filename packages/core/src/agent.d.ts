/**
 * @gerts/core - Agent Interface
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
     * @param input - User input (string, message, or messages)
     * @param options - Run options
     * @returns Run result with response and status
     */
    run(input: string | any, options?: AgentRunOptions): Promise<AgentRunResult>;
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
    /** LLM model */
    model: any;
    /** Tenant ID */
    tenantId: string;
    /** Tools available to agent */
    tools?: any[];
    /** Enable verbose logging */
    verbose?: boolean;
}
