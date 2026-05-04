/**
 * @fileoverview Utility functions for working with transition maps
 *
 * Pure functions for querying FSM topology: validity checks,
 * state classification, and predicate factories.
 *
 * @module @gertsai/fsm
 */

import type { StateValue, TransitionMap } from './types';
import { InvalidTransitionError, UnknownStateError } from './errors';

/**
 * Check if a transition from one state to another is valid.
 *
 * @param map - The transition map to check against
 * @param from - Source state
 * @param to - Target state
 * @returns `true` if the transition is defined in the map
 */
export function isValidTransition<S extends StateValue>(
  map: TransitionMap<S>,
  from: S,
  to: S,
): boolean {
  const targets = map.transitions.get(from);
  if (!targets) {
    return false;
  }
  return targets.has(to);
}

/**
 * Get all valid target states from a given state.
 *
 * @param map - The transition map to query
 * @param from - Source state
 * @returns Array of valid target states (empty for terminal/unknown states)
 */
export function getValidTransitions<S extends StateValue>(
  map: TransitionMap<S>,
  from: S,
): readonly S[] {
  const targets = map.transitions.get(from);
  if (!targets) {
    return [];
  }
  return Array.from(targets);
}

/**
 * Check if a state is terminal (has no outgoing transitions).
 *
 * @param map - The transition map to check against
 * @param state - The state to check
 * @returns `true` if the state is in the terminal states set
 */
export function isTerminalState<S extends StateValue>(map: TransitionMap<S>, state: S): boolean {
  return map.terminalStates.has(state);
}

/**
 * Check if a state is known (exists in the transition map).
 *
 * @param map - The transition map to check against
 * @param state - The state to check
 * @returns `true` if the state is defined in the map
 */
export function isKnownState<S extends StateValue>(map: TransitionMap<S>, state: S): boolean {
  return map.states.has(state);
}

/**
 * Assert that a transition is valid. Throws if not.
 * Use when an invalid transition is a programming error.
 *
 * @param map - The transition map to validate against
 * @param from - Source state
 * @param to - Target state
 * @param context - Optional context for the error
 *
 * @throws {UnknownStateError} If `from` is not a known state
 * @throws {InvalidTransitionError} If the transition is not valid
 */
export function assertValidTransition<S extends StateValue>(
  map: TransitionMap<S>,
  from: S,
  to: S,
  context?: Record<string, unknown>,
): void {
  if (!map.states.has(from)) {
    throw new UnknownStateError(from, Array.from(map.states));
  }

  if (!isValidTransition(map, from, to)) {
    const validTargets = getValidTransitions(map, from);
    throw new InvalidTransitionError(from, to, validTargets, context);
  }
}

/**
 * Factory for creating state predicate functions from a set/array of states.
 *
 * @param states - Set or array of states to match against
 * @returns A predicate function that returns `true` if the given state is in the set
 *
 * @example
 * ```typescript
 * const isActive = createStatePredicate(new Set(['running', 'waiting']));
 * isActive('running'); // true
 * isActive('idle');    // false
 * ```
 */
export function createStatePredicate<S extends StateValue>(
  states: ReadonlySet<S> | readonly S[],
): (state: S) => boolean {
  const stateSet: ReadonlySet<S> = states instanceof Set ? states : new Set(states);
  return (state: S): boolean => stateSet.has(state);
}

/**
 * Creates multiple named predicates from a categories object.
 *
 * @param categories - Map of category names to sets/arrays of states
 * @returns Object with the same keys, where each value is a predicate function
 *
 * @example
 * ```typescript
 * const { isActive, isRetryable } = createStatePredicates({
 *   isActive: ['running', 'waiting'],
 *   isRetryable: ['failed'],
 * });
 *
 * isActive('running');    // true
 * isRetryable('failed');  // true
 * ```
 */
export function createStatePredicates<S extends StateValue, K extends string>(
  categories: Readonly<Record<K, ReadonlySet<S> | readonly S[]>>,
): Readonly<Record<K, (state: S) => boolean>> {
  const result: Record<string, (state: S) => boolean> = {};
  for (const key of Object.keys(categories) as K[]) {
    result[key] = createStatePredicate(categories[key]);
  }
  return result as Record<K, (state: S) => boolean>;
}
