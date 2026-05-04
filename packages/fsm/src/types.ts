/**
 * @fileoverview Core generic types for @gertsai/fsm
 *
 * All types are parameterized by `S extends StateValue` to provide
 * compile-time safety for state machine definitions.
 *
 * @module @gertsai/fsm
 */

// =============================================================================
// BASE TYPES
// =============================================================================

/**
 * Base constraint for state values.
 * All states must be string literals for type safety.
 *
 * @example
 * ```typescript
 * type JobState = 'pending' | 'running' | 'succeeded' | 'failed';
 * // JobState satisfies StateValue
 * ```
 */
export type StateValue = string;

// =============================================================================
// TRANSITION MAP
// =============================================================================

/**
 * Immutable transition map — the core FSM definition.
 * Generic `S` constrains which states are valid.
 *
 * This is the compiled, validated representation of an FSM's topology.
 * Created via `createTransitionMap()` or `createTransitionMapFromConfig()`.
 */
export interface TransitionMap<S extends StateValue = string> {
  /** Map from state to set of valid target states */
  readonly transitions: ReadonlyMap<S, ReadonlySet<S>>;
  /** All known states in this FSM */
  readonly states: ReadonlySet<S>;
  /** States with no outgoing transitions */
  readonly terminalStates: ReadonlySet<S>;
}

// =============================================================================
// TRANSITION RESULT
// =============================================================================

/**
 * Successful transition result.
 */
export interface TransitionSuccess<S extends StateValue = string> {
  readonly success: true;
  readonly from: S;
  readonly to: S;
}

/**
 * Failed transition result with error details.
 */
export interface TransitionFailure<S extends StateValue = string> {
  readonly success: false;
  readonly from: S;
  readonly to: S;
  readonly validTargets: readonly S[];
}

/**
 * Result of a try-transition operation.
 * Discriminated union: check `success` to narrow the type.
 *
 * @example
 * ```typescript
 * const result = machine.tryTransitionTo('running');
 * if (result.success) {
 *   console.log(`Moved to ${result.to}`);
 * } else {
 *   console.log(`Cannot move to ${result.to}, valid: ${result.validTargets}`);
 * }
 * ```
 */
export type TransitionResult<S extends StateValue = string> =
  | TransitionSuccess<S>
  | TransitionFailure<S>;

// =============================================================================
// HISTORY
// =============================================================================

/**
 * Record of a state transition for history tracking.
 */
export interface StateTransitionRecord<S extends StateValue = string> {
  readonly from: S;
  readonly to: S;
  readonly timestamp: number;
  readonly context?: Readonly<Record<string, unknown>>;
}

// =============================================================================
// SNAPSHOT
// =============================================================================

/**
 * Serializable snapshot of a state machine's state.
 * Can be stored in a database or transmitted over the wire.
 */
export interface StateMachineSnapshot<S extends StateValue = string> {
  readonly state: S;
  readonly history: readonly StateTransitionRecord<S>[];
  readonly createdAt: number;
}

// =============================================================================
// HANDLERS
// =============================================================================

/**
 * Handler called on state transitions.
 * Receives the previous state, new state, and optional transition context.
 */
export type StateChangeHandler<S extends StateValue = string> = (
  from: S,
  to: S,
  context?: Readonly<Record<string, unknown>>,
) => void;

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Configuration for creating a StateMachine instance.
 * Accepts both Record and Map formats for transitions.
 *
 * @example
 * ```typescript
 * const config: StateMachineConfig<'idle' | 'running' | 'done'> = {
 *   initialState: 'idle',
 *   transitions: {
 *     idle: ['running'],
 *     running: ['done'],
 *     done: [],
 *   },
 *   terminalStates: ['done'],
 *   categories: {
 *     active: ['running'],
 *   },
 * };
 * ```
 */
export interface StateMachineConfig<S extends StateValue = string> {
  /** The starting state */
  readonly initialState: S;
  /**
   * Transition definitions — which states can transition to which.
   * Record format: `{ 'pending': ['running', 'cancelled'] }`
   * Map format: `new Map([['pending', new Set(['running', 'cancelled'])]])`
   */
  readonly transitions: Readonly<Record<S, readonly S[]>> | ReadonlyMap<S, ReadonlySet<S>>;
  /** States that are considered final (no outgoing transitions) */
  readonly terminalStates: readonly S[] | ReadonlySet<S>;
  /**
   * Optional named groups of states for convenience predicates.
   * @example `{ active: ['running', 'waiting'], retryable: ['failed'] }`
   */
  readonly categories?: Readonly<Record<string, readonly S[] | ReadonlySet<S>>>;
}
