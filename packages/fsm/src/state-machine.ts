/**
 * @fileoverview StateMachine — the main FSM class
 *
 * Generic, immutable state machine with history tracking, event handlers,
 * snapshot/restore, and category predicates.
 *
 * Design decisions extracted from existing codebase:
 * - `JobStateMachine` (packages/queue): snapshot/restore, handler pattern, history tracking
 * - `StepRunStateMachine` (packages/etl): append-only store, modifier pattern
 * - `TaskManager` (packages/a2a): event emitter pattern with unsubscribe
 *
 * @module @gertsai/fsm
 */

import type {
  StateValue,
  TransitionMap,
  TransitionResult,
  StateTransitionRecord,
  StateMachineSnapshot,
  StateChangeHandler,
  StateMachineConfig,
} from './types';
import { createTransitionMapFromConfig } from './transition-map';
import { InvalidTransitionError, UnknownStateError } from './errors';
import {
  isValidTransition,
  getValidTransitions,
  isTerminalState,
  createStatePredicate,
} from './utils';

/**
 * Generic, immutable state machine with history tracking and event handlers.
 *
 * @typeParam S - Union of string literal state values
 *
 * @example
 * ```typescript
 * type JobState = 'pending' | 'running' | 'succeeded' | 'failed';
 *
 * const machine = new StateMachine<JobState>({
 *   initialState: 'pending',
 *   transitions: {
 *     pending: ['running'],
 *     running: ['succeeded', 'failed'],
 *     succeeded: [],
 *     failed: ['pending'], // retry
 *   },
 *   terminalStates: ['succeeded'],
 *   categories: { active: ['pending', 'running'] },
 * });
 *
 * machine.transitionTo('running'); // OK
 * machine.transitionTo('pending'); // throws InvalidTransitionError
 * ```
 */
export class StateMachine<S extends StateValue = string> {
  private _state: S;
  private readonly _initialState: S;
  private _history: StateTransitionRecord<S>[];
  private readonly _handlers: Set<StateChangeHandler<S>>;
  private readonly _map: TransitionMap<S>;
  private readonly _categoryPredicates: ReadonlyMap<string, (state: S) => boolean>;
  private readonly _createdAt: number;

  /**
   * Create a new StateMachine from configuration.
   *
   * @param config - State machine configuration
   * @throws {TerminalStateViolationError} If a terminal state has outgoing transitions
   * @throws {UnknownStateError} If initial state or any referenced state is unknown
   */
  constructor(config: StateMachineConfig<S>) {
    this._map = createTransitionMapFromConfig(config);

    // Validate initial state is known
    if (!this._map.states.has(config.initialState)) {
      throw new UnknownStateError(config.initialState, Array.from(this._map.states));
    }

    this._state = config.initialState;
    this._initialState = config.initialState;
    this._history = [];
    this._handlers = new Set();
    this._createdAt = Date.now();

    // Build category predicates
    const predicates = new Map<string, (state: S) => boolean>();
    if (config.categories) {
      for (const [name, states] of Object.entries(config.categories) as [
        string,
        readonly S[] | ReadonlySet<S>,
      ][]) {
        predicates.set(name, createStatePredicate(states));
      }
    }
    this._categoryPredicates = predicates;
  }

  /** Current state of the machine */
  get state(): S {
    return this._state;
  }

  /** Full transition history (immutable view) */
  get history(): readonly StateTransitionRecord<S>[] {
    return this._history;
  }

  /** Whether the current state is terminal */
  get isTerminal(): boolean {
    return isTerminalState(this._map, this._state);
  }

  /** Valid transitions from the current state */
  get validTransitions(): readonly S[] {
    return getValidTransitions(this._map, this._state);
  }

  /** The underlying transition map */
  get transitionMap(): TransitionMap<S> {
    return this._map;
  }

  /**
   * Check if a transition to the target state is valid from the current state.
   *
   * @param to - Target state
   * @returns `true` if the transition is allowed
   */
  canTransitionTo(to: S): boolean {
    return isValidTransition(this._map, this._state, to);
  }

  /**
   * Try to transition — returns a discriminated union result without throwing.
   * Use when you want to handle invalid transitions gracefully.
   *
   * @param to - Target state
   * @param context - Optional context for the transition (passed to handlers)
   * @returns TransitionResult with `success: true` or `success: false`
   */
  tryTransitionTo(to: S, context?: Record<string, unknown>): TransitionResult<S> {
    if (!isValidTransition(this._map, this._state, to)) {
      return {
        success: false,
        from: this._state,
        to,
        validTargets: getValidTransitions(this._map, this._state),
      };
    }

    const from = this._state;
    const frozenContext = context ? Object.freeze({ ...context }) : undefined;

    this._state = to;
    this._history.push({
      from,
      to,
      timestamp: Date.now(),
      context: frozenContext,
    });

    this._notifyHandlers(from, to, frozenContext);

    return { success: true, from, to };
  }

  /**
   * Transition to the target state — throws on invalid transition.
   * Use when an invalid transition is a programming error.
   *
   * @param to - Target state
   * @param context - Optional context for the transition (passed to handlers)
   * @returns The new state
   * @throws {InvalidTransitionError} If the transition is not valid
   */
  transitionTo(to: S, context?: Record<string, unknown>): S {
    if (!isValidTransition(this._map, this._state, to)) {
      const validTargets = getValidTransitions(this._map, this._state);
      throw new InvalidTransitionError(this._state, to, validTargets, context);
    }

    const from = this._state;
    const frozenContext = context ? Object.freeze({ ...context }) : undefined;

    this._state = to;
    this._history.push({
      from,
      to,
      timestamp: Date.now(),
      context: frozenContext,
    });

    this._notifyHandlers(from, to, frozenContext);

    return this._state;
  }

  /**
   * Register a state change handler.
   * Handlers are called synchronously after each successful transition.
   *
   * @param handler - Function to call on state changes
   * @returns Unsubscribe function — call to remove the handler
   */
  onStateChange(handler: StateChangeHandler<S>): () => void {
    this._handlers.add(handler);
    return () => {
      this._handlers.delete(handler);
    };
  }

  /**
   * Check if the current state belongs to a named category.
   *
   * @param category - Category name (defined in config.categories)
   * @returns `true` if the current state is in the category, `false` if not or category unknown
   */
  isInCategory(category: string): boolean {
    const predicate = this._categoryPredicates.get(category);
    if (!predicate) {
      return false;
    }
    return predicate(this._state);
  }

  /**
   * Reset the machine to its initial state.
   *
   * @param clearHistory - Whether to clear transition history (default: `true`)
   */
  reset(clearHistory: boolean = true): void {
    this._state = this._initialState;
    if (clearHistory) {
      this._history = [];
    }
  }

  /**
   * Create a serializable snapshot of the current machine state.
   * The snapshot includes current state, history, and creation timestamp.
   */
  snapshot(): StateMachineSnapshot<S> {
    return {
      state: this._state,
      history: [...this._history],
      createdAt: this._createdAt,
    };
  }

  /**
   * Restore machine state from a snapshot.
   * The snapshot's state must be a known state in this machine's transition map.
   *
   * @param snap - Snapshot to restore from
   * @throws {UnknownStateError} If the snapshot's state is not a known state
   */
  restore(snap: StateMachineSnapshot<S>): void {
    if (!this._map.states.has(snap.state)) {
      throw new UnknownStateError(snap.state, Array.from(this._map.states));
    }
    this._state = snap.state;
    this._history = [...snap.history];
  }

  /**
   * Notify all registered handlers of a state change.
   * Errors in handlers are caught and silently ignored to prevent
   * handler failures from breaking the state machine.
   */
  private _notifyHandlers(from: S, to: S, context?: Readonly<Record<string, unknown>>): void {
    for (const handler of this._handlers) {
      try {
        handler(from, to, context);
      } catch {
        // Handlers must not break the state machine
      }
    }
  }
}
