/**
 * @fileoverview Transition map creation and validation
 *
 * The transition map is the compiled, immutable representation of an FSM's
 * topology. Construction validates invariants that catch common bugs:
 *
 * - Terminal states MUST NOT have outgoing transitions (catches Bug #1)
 * - All target states must be known states
 * - Initial state must be a known state
 *
 * @module @gertsai/fsm
 */

import type { StateValue, TransitionMap, StateMachineConfig } from './types';
import { TerminalStateViolationError, UnknownStateError } from './errors';

/**
 * Creates an immutable TransitionMap from a Record-based definition.
 *
 * Validates that:
 * 1. All target states referenced in transitions are defined as keys
 * 2. Terminal states have empty transition arrays (catches Bug #1)
 * 3. All terminal states are known states
 *
 * @param transitions - Map of state to array of valid target states
 * @param terminalStates - States with no outgoing transitions
 * @returns Validated, immutable TransitionMap
 *
 * @throws {TerminalStateViolationError} If a terminal state has outgoing transitions
 * @throws {UnknownStateError} If a target state or terminal state is not a known state
 *
 * @example
 * ```typescript
 * type JobState = 'pending' | 'running' | 'succeeded' | 'failed';
 *
 * const map = createTransitionMap<JobState>(
 *   {
 *     pending: ['running'],
 *     running: ['succeeded', 'failed'],
 *     succeeded: [],
 *     failed: ['pending'], // retry
 *   },
 *   ['succeeded'],
 * );
 * ```
 */
export function createTransitionMap<S extends StateValue>(
  transitions: Readonly<Record<S, readonly S[]>>,
  terminalStates: readonly S[],
): TransitionMap<S> {
  const stateKeys = Object.keys(transitions) as S[];
  const allStates = new Set<S>(stateKeys);
  const terminalSet = new Set<S>(terminalStates);

  // Validate: terminal states must be known states
  for (const ts of terminalStates) {
    if (!allStates.has(ts)) {
      throw new UnknownStateError(ts, stateKeys);
    }
  }

  // Validate: all target states must be known states
  for (const from of stateKeys) {
    const targets = transitions[from];
    for (const to of targets) {
      if (!allStates.has(to)) {
        throw new UnknownStateError(to, stateKeys);
      }
    }
  }

  // Validate: terminal states MUST NOT have outgoing transitions (Bug #1 catcher)
  for (const ts of terminalStates) {
    const targets = transitions[ts];
    if (targets && targets.length > 0) {
      throw new TerminalStateViolationError(ts, targets);
    }
  }

  // Build immutable Map<S, ReadonlySet<S>>
  const transitionMap = new Map<S, ReadonlySet<S>>();
  for (const from of stateKeys) {
    transitionMap.set(from, new Set<S>(transitions[from]));
  }

  return Object.freeze({
    transitions: transitionMap,
    states: allStates,
    terminalStates: terminalSet,
  });
}

/**
 * Normalizes a value that can be either an array or a Set into a Set.
 */
function toSet<S extends StateValue>(value: readonly S[] | ReadonlySet<S>): ReadonlySet<S> {
  if (value instanceof Set) {
    return value;
  }
  return new Set<S>(value);
}

/**
 * Creates a TransitionMap from a StateMachineConfig.
 * Normalizes both Record and Map formats for transitions.
 *
 * @param config - Full state machine configuration
 * @returns Validated, immutable TransitionMap
 *
 * @throws {TerminalStateViolationError} If a terminal state has outgoing transitions
 * @throws {UnknownStateError} If a target state or terminal state is not a known state
 */
export function createTransitionMapFromConfig<S extends StateValue>(
  config: StateMachineConfig<S>,
): TransitionMap<S> {
  const terminalSet = toSet(config.terminalStates);

  if (config.transitions instanceof Map) {
    // Convert Map format to Record format for unified validation
    const record: Record<string, readonly S[]> = {};
    for (const [state, targets] of config.transitions) {
      record[state] = Array.from(targets);
    }

    return createTransitionMap(record as Record<S, readonly S[]>, Array.from(terminalSet));
  }

  // TypeScript cannot narrow union after instanceof Map check in if-branch,
  // so we assert the Record type here (Map was handled above).
  const recordTransitions = config.transitions as Readonly<Record<S, readonly S[]>>;
  return createTransitionMap(recordTransitions, Array.from(terminalSet));
}
