/**
 * @gertsai/core - Actuator Interfaces
 *
 * The Actuator pattern decouples logical steps (JSON schema) from physical execution (code).
 * This is the "Node Bridge" - connecting flow definitions to actual business logic.
 *
 * @see research/architecture/13-execution-engine-spec.md Section 6.2, 7
 */

import type { GertsConnectionType } from './connections';

/**
 * Validation result from actuator input validation
 */
export interface ValidationResult {
  valid: boolean;
  errors?: string[];
}

/**
 * Successful execution result
 */
export interface ActuatorSuccess<T> {
  status: 'success';
  /** Primary output value */
  output: T;
  /** Multiple output handles (for nodes with multiple outputs) */
  outputs?: Record<string, unknown>;
  /** Execution duration in milliseconds */
  duration: number;
}

/**
 * Suspended execution result (for Human-in-the-Loop)
 */
export interface ActuatorSuspended {
  status: 'suspended';
  /** Reason for suspension */
  reason: string;
  /** Data to preserve during suspension */
  suspendData: unknown;
}

/**
 * Failed execution result
 */
export interface ActuatorFailed {
  status: 'failed';
  /** The error that caused failure */
  error: Error;
}

/**
 * Union type of all possible actuator results
 */
export type ActuatorResult<T> = ActuatorSuccess<T> | ActuatorSuspended | ActuatorFailed;

/**
 * Execution context passed to actuators.
 * Provides access to kernel services, state, and utilities.
 *
 * This is a minimal interface intended for downstream flow runtimes to extend.
 */
export interface ExecutionContext {
  /** Get input data for current step */
  getInput(): unknown;

  /** Get flow variable by name */
  getVariable(name: string): unknown;

  /** Get all flow variables */
  getVariables(): Record<string, unknown>;

  /** Get output from a previous step */
  getStepOutput(stepId: string, runIndex?: number): unknown;

  /** Get a tool by name (with permission check) */
  getTool(name: string): unknown;

  /** Get credential from secure store */
  getCredential(name: string): string;

  /** Get step configuration */
  getStepConfig<T>(): T;

  /** Trigger suspension (throws SuspendRequest) */
  suspend(reason: string, data?: unknown): never;

  /** Report progress (for long-running operations) */
  reportProgress?(progress: ExecutionProgress): void;
}

/**
 * Progress information for long-running operations
 */
export interface ExecutionProgress {
  /** Percentage complete (0-100) */
  percentComplete?: number;
  /** Current step description */
  currentStep?: string;
  /** Items processed */
  itemsProcessed?: number;
  /** Total items to process */
  totalItems?: number;
  /** Custom metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Base interface for all step actuators.
 *
 * Actuators are the bridge between declarative flow definitions
 * and imperative execution logic.
 *
 * @typeParam Input - The type of input the actuator expects
 * @typeParam Output - The type of output the actuator produces
 *
 * @example
 * ```typescript
 * class HttpActuator implements StepActuator<HttpInput, HttpOutput> {
 *   readonly type = 'http';
 *
 *   async execute(input: HttpInput, context: ExecutionContext) {
 *     const response = await fetch(input.url, input.options);
 *     return {
 *       status: 'success',
 *       output: await response.json(),
 *       duration: Date.now() - startTime
 *     };
 *   }
 * }
 * ```
 */
export interface StepActuator<Input = unknown, Output = unknown> {
  /** Unique type identifier for this actuator */
  readonly type: string;

  /**
   * Execute the actuator logic
   *
   * @param input - Resolved input data for the step
   * @param context - Execution context with access to services
   * @returns Promise resolving to success, suspended, or failed result
   */
  execute(input: Input, context: ExecutionContext): Promise<ActuatorResult<Output>>;

  /**
   * Optional: Validate input before execution
   *
   * @param input - Raw input to validate
   * @returns Validation result with any errors
   */
  validate?(input: Input): ValidationResult;

  /**
   * Optional: Cleanup after execution (success or failure)
   *
   * @param context - Execution context
   */
  cleanup?(context: ExecutionContext): Promise<void>;
}

/**
 * Extended actuator interface for AI-aware components.
 *
 * AI actuators can supply components to other nodes (like LLM providers,
 * memory systems, retrievers) using the supplyComponent pattern.
 *
 * @typeParam Input - The type of input the actuator expects
 * @typeParam Output - The type of output the actuator produces
 * @typeParam SupplyType - The type of component this actuator supplies
 *
 * @example
 * ```typescript
 * class EmbeddingActuator implements AIActuator<EmbeddingInput, void, EmbeddingProvider> {
 *   readonly type = 'embedding';
 *   readonly aiConnectionType = GertsConnectionTypes.AiEmbedding;
 *
 *   async execute(input, context) {
 *     return { status: 'success', output: undefined, duration: 0 };
 *   }
 *
 *   async supplyComponent(context): Promise<EmbeddingProvider> {
 *     const config = context.getStepConfig<EmbeddingConfig>();
 *     return createEmbeddingProvider({
 *       model: config.model,
 *       dimensions: config.dimensions
 *     });
 *   }
 * }
 * ```
 */
export interface AIActuator<Input = unknown, Output = unknown, SupplyType = never>
  extends StepActuator<Input, Output> {
  /**
   * Connection type this actuator provides as output.
   * Used for type-safe wiring of AI components.
   */
  aiConnectionType?: GertsConnectionType;

  /**
   * Connection types this actuator accepts as inputs.
   * Used for validating connections in the flow editor.
   */
  acceptsConnectionTypes?: GertsConnectionType[];

  /**
   * Supply a component to connected nodes.
   *
   * This is the n8n supplyData() pattern - nodes like Embedding,
   * LanguageModel, Memory don't execute directly but instead
   * provide a configured component to their parent node.
   *
   * @param context - Execution context
   * @returns The component instance (e.g., EmbeddingProvider, LanguageModel)
   */
  supplyComponent?(context: ExecutionContext): Promise<SupplyType>;
}

/**
 * Type guard to check if an actuator is an AI actuator
 */
export function isAIActuator<I, O, S>(
  actuator: StepActuator<I, O>
): actuator is AIActuator<I, O, S> {
  return 'aiConnectionType' in actuator || 'supplyComponent' in actuator;
}

/**
 * Type guard to check if an actuator can supply components
 */
export function canSupplyComponent<I, O, S>(
  actuator: StepActuator<I, O>
): actuator is AIActuator<I, O, S> & Required<Pick<AIActuator<I, O, S>, 'supplyComponent'>> {
  return isAIActuator(actuator) && typeof actuator.supplyComponent === 'function';
}

/**
 * Helper type to extract the supply type from an AI actuator
 */
export type ExtractSupplyType<T> = T extends AIActuator<unknown, unknown, infer S> ? S : never;

/**
 * Helper type to extract the output type from an actuator
 */
export type ExtractOutputType<T> = T extends StepActuator<unknown, infer O> ? O : never;

/**
 * Helper type to extract the input type from an actuator
 */
export type ExtractInputType<T> = T extends StepActuator<infer I, unknown> ? I : never;

/**
 * Registry of actuator types for type-safe lookup
 */
export type ActuatorRegistry = Map<string, StepActuator>;

/**
 * Factory function type for creating actuators
 */
export type ActuatorFactory<T extends StepActuator = StepActuator> = () => T;

/**
 * Configuration for actuator registration
 */
export interface ActuatorRegistration<T extends StepActuator = StepActuator> {
  /** Unique type identifier */
  type: string;
  /** Factory function to create the actuator */
  factory: ActuatorFactory<T>;
  /** Optional description */
  description?: string;
  /** Optional category for grouping */
  category?: 'ai' | 'graph' | 'transform' | 'control' | 'io' | 'utility';
}
