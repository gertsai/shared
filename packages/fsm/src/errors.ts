/**
 * @fileoverview FSM error types
 *
 * Strongly-typed errors that preserve the generic state parameter `S`,
 * allowing consumers to inspect `from`, `to`, and `validTargets` with
 * full type safety.
 *
 * @module @gertsai/fsm
 */

import type { StateValue } from './types';

/**
 * Error thrown when an invalid state transition is attempted.
 * Generic parameter `S` preserves the state type for error handling.
 *
 * @example
 * ```typescript
 * try {
 *   machine.transitionTo('invalid');
 * } catch (e) {
 *   if (e instanceof InvalidTransitionError) {
 *     console.log(e.from, e.to, e.validTargets);
 *   }
 * }
 * ```
 */
export class InvalidTransitionError<S extends StateValue = string> extends Error {
  /** The state the machine was in when the transition was attempted */
  readonly from: S;
  /** The target state that was rejected */
  readonly to: S;
  /** Valid target states from the current state */
  readonly validTargets: readonly S[];
  /** Optional context that was passed with the transition attempt */
  readonly context?: Readonly<Record<string, unknown>>;

  constructor(from: S, to: S, validTargets: readonly S[], context?: Record<string, unknown>) {
    const validStr = validTargets.length > 0 ? validTargets.join(', ') : 'none (terminal state)';
    super(`Invalid transition from '${from}' to '${to}'. Valid targets: [${validStr}]`);
    this.name = 'InvalidTransitionError';
    this.from = from;
    this.to = to;
    this.validTargets = validTargets;
    this.context = context ? Object.freeze({ ...context }) : undefined;
  }
}

/**
 * Error thrown when an unknown state is encountered.
 * This means the state is not defined in the transition map.
 */
export class UnknownStateError<S extends StateValue = string> extends Error {
  /** The unknown state that was encountered */
  readonly state: S;
  /** All known states in the FSM */
  readonly knownStates: readonly S[];

  constructor(state: S, knownStates: readonly S[]) {
    super(`Unknown state '${state}'. Known states: [${knownStates.join(', ')}]`);
    this.name = 'UnknownStateError';
    this.state = state;
    this.knownStates = knownStates;
  }
}

/**
 * Error thrown when a terminal state has outgoing transitions defined.
 * This is a configuration error caught at construction time.
 */
export class TerminalStateViolationError<S extends StateValue = string> extends Error {
  /** The terminal state that has outgoing transitions */
  readonly state: S;
  /** The outgoing transitions that were defined (should be empty) */
  readonly outgoingTransitions: readonly S[];

  constructor(state: S, outgoingTransitions: readonly S[]) {
    super(
      `Terminal state '${state}' must not have outgoing transitions, ` +
        `but has: [${outgoingTransitions.join(', ')}]`,
    );
    this.name = 'TerminalStateViolationError';
    this.state = state;
    this.outgoingTransitions = outgoingTransitions;
  }
}
