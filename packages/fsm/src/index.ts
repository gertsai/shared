/**
 * @fileoverview @gerts/fsm — Generic, zero-dependency finite state machine library
 *
 * Provides strongly-typed FSM primitives that unify patterns found across
 * the codebase (queue/job-state, etl/step-run, a2a/task-manager).
 *
 * @module @gerts/fsm
 *
 * @example
 * ```typescript
 * import {
 *   StateMachine,
 *   createTransitionMap,
 *   InvalidTransitionError,
 * } from '@gerts/fsm';
 *
 * type Light = 'red' | 'yellow' | 'green';
 *
 * const machine = new StateMachine<Light>({
 *   initialState: 'red',
 *   transitions: {
 *     red: ['green'],
 *     green: ['yellow'],
 *     yellow: ['red'],
 *   },
 *   terminalStates: [],
 * });
 *
 * machine.transitionTo('green');  // OK
 * machine.transitionTo('red');    // throws InvalidTransitionError
 * ```
 */

// Types
export type {
  StateValue,
  TransitionMap,
  TransitionResult,
  TransitionSuccess,
  TransitionFailure,
  StateTransitionRecord,
  StateMachineSnapshot,
  StateChangeHandler,
  StateMachineConfig,
} from './types';

// Errors
export { InvalidTransitionError, UnknownStateError, TerminalStateViolationError } from './errors';

// Transition map builders
export { createTransitionMap, createTransitionMapFromConfig } from './transition-map';

// Utility functions
export {
  isValidTransition,
  getValidTransitions,
  isTerminalState,
  isKnownState,
  assertValidTransition,
  createStatePredicate,
  createStatePredicates,
} from './utils';

// Core class
export { StateMachine } from './state-machine';

// Store
export { InMemoryStateMachineStore } from './store';
