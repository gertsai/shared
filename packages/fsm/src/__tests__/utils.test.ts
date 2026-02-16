import { describe, it, expect } from 'vitest';
import { createTransitionMap } from '../transition-map';
import {
  isValidTransition,
  getValidTransitions,
  isTerminalState,
  isKnownState,
  assertValidTransition,
  createStatePredicate,
  createStatePredicates,
} from '../utils';
import { InvalidTransitionError, UnknownStateError } from '../errors';

// =============================================================================
// Test fixtures
// =============================================================================

type JobState = 'pending' | 'running' | 'succeeded' | 'failed';

const JOB_MAP = createTransitionMap<JobState>(
  {
    pending: ['running'],
    running: ['succeeded', 'failed'],
    succeeded: [],
    failed: ['pending'],
  },
  ['succeeded'],
);

type Light = 'red' | 'yellow' | 'green';

const LIGHT_MAP = createTransitionMap<Light>(
  { red: ['green'], green: ['yellow'], yellow: ['red'] },
  [],
);

// =============================================================================
// isValidTransition
// =============================================================================

describe('isValidTransition', () => {
  it('should return true for valid transitions', () => {
    expect(isValidTransition(JOB_MAP, 'pending', 'running')).toBe(true);
    expect(isValidTransition(JOB_MAP, 'running', 'succeeded')).toBe(true);
    expect(isValidTransition(JOB_MAP, 'running', 'failed')).toBe(true);
    expect(isValidTransition(JOB_MAP, 'failed', 'pending')).toBe(true);
  });

  it('should return false for invalid transitions', () => {
    expect(isValidTransition(JOB_MAP, 'pending', 'succeeded')).toBe(false);
    expect(isValidTransition(JOB_MAP, 'pending', 'failed')).toBe(false);
    expect(isValidTransition(JOB_MAP, 'succeeded', 'pending')).toBe(false);
    expect(isValidTransition(JOB_MAP, 'succeeded', 'running')).toBe(false);
  });

  it('should return false for unknown source state', () => {
    expect(isValidTransition(JOB_MAP, 'unknown' as JobState, 'running')).toBe(false);
  });

  it('should return false for terminal state transitions', () => {
    expect(isValidTransition(JOB_MAP, 'succeeded', 'pending')).toBe(false);
    expect(isValidTransition(JOB_MAP, 'succeeded', 'running')).toBe(false);
  });

  it('should work with cyclic FSM (traffic light)', () => {
    expect(isValidTransition(LIGHT_MAP, 'red', 'green')).toBe(true);
    expect(isValidTransition(LIGHT_MAP, 'green', 'yellow')).toBe(true);
    expect(isValidTransition(LIGHT_MAP, 'yellow', 'red')).toBe(true);
    expect(isValidTransition(LIGHT_MAP, 'red', 'yellow')).toBe(false);
  });

  it('should handle self-loop transitions', () => {
    type S = 'loop' | 'exit';
    const map = createTransitionMap<S>({ loop: ['loop', 'exit'], exit: [] }, ['exit']);
    expect(isValidTransition(map, 'loop', 'loop')).toBe(true);
  });
});

// =============================================================================
// getValidTransitions
// =============================================================================

describe('getValidTransitions', () => {
  it('should return valid targets for non-terminal state', () => {
    const targets = getValidTransitions(JOB_MAP, 'running');
    expect(targets).toContain('succeeded');
    expect(targets).toContain('failed');
    expect(targets).toHaveLength(2);
  });

  it('should return single target', () => {
    const targets = getValidTransitions(JOB_MAP, 'pending');
    expect(targets).toEqual(['running']);
  });

  it('should return empty array for terminal state', () => {
    const targets = getValidTransitions(JOB_MAP, 'succeeded');
    expect(targets).toEqual([]);
  });

  it('should return empty array for unknown state', () => {
    const targets = getValidTransitions(JOB_MAP, 'unknown' as JobState);
    expect(targets).toEqual([]);
  });

  it('should return all targets for cyclic FSM', () => {
    expect(getValidTransitions(LIGHT_MAP, 'red')).toEqual(['green']);
  });
});

// =============================================================================
// isTerminalState
// =============================================================================

describe('isTerminalState', () => {
  it('should return true for terminal states', () => {
    expect(isTerminalState(JOB_MAP, 'succeeded')).toBe(true);
  });

  it('should return false for non-terminal states', () => {
    expect(isTerminalState(JOB_MAP, 'pending')).toBe(false);
    expect(isTerminalState(JOB_MAP, 'running')).toBe(false);
    expect(isTerminalState(JOB_MAP, 'failed')).toBe(false);
  });

  it('should return false for unknown states', () => {
    expect(isTerminalState(JOB_MAP, 'unknown' as JobState)).toBe(false);
  });

  it('should return false when there are no terminal states', () => {
    expect(isTerminalState(LIGHT_MAP, 'red')).toBe(false);
    expect(isTerminalState(LIGHT_MAP, 'green')).toBe(false);
    expect(isTerminalState(LIGHT_MAP, 'yellow')).toBe(false);
  });
});

// =============================================================================
// isKnownState
// =============================================================================

describe('isKnownState', () => {
  it('should return true for known states', () => {
    expect(isKnownState(JOB_MAP, 'pending')).toBe(true);
    expect(isKnownState(JOB_MAP, 'running')).toBe(true);
    expect(isKnownState(JOB_MAP, 'succeeded')).toBe(true);
    expect(isKnownState(JOB_MAP, 'failed')).toBe(true);
  });

  it('should return false for unknown states', () => {
    expect(isKnownState(JOB_MAP, 'unknown' as JobState)).toBe(false);
    expect(isKnownState(JOB_MAP, '' as JobState)).toBe(false);
  });
});

// =============================================================================
// assertValidTransition
// =============================================================================

describe('assertValidTransition', () => {
  it('should not throw for valid transitions', () => {
    expect(() => assertValidTransition(JOB_MAP, 'pending', 'running')).not.toThrow();
    expect(() => assertValidTransition(JOB_MAP, 'running', 'succeeded')).not.toThrow();
    expect(() => assertValidTransition(JOB_MAP, 'running', 'failed')).not.toThrow();
  });

  it('should throw InvalidTransitionError for invalid transitions', () => {
    expect(() => assertValidTransition(JOB_MAP, 'pending', 'succeeded')).toThrow(
      InvalidTransitionError,
    );
  });

  it('should throw UnknownStateError for unknown source state', () => {
    expect(() => assertValidTransition(JOB_MAP, 'unknown' as JobState, 'running')).toThrow(
      UnknownStateError,
    );
  });

  it('should include context in error', () => {
    const ctx = { jobId: '123' };
    try {
      assertValidTransition(JOB_MAP, 'pending', 'succeeded', ctx);
      expect.fail('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(InvalidTransitionError);
      const err = e as InvalidTransitionError;
      expect(err.context).toEqual({ jobId: '123' });
    }
  });

  it('should include valid targets in error', () => {
    try {
      assertValidTransition(JOB_MAP, 'running', 'pending');
      expect.fail('Should have thrown');
    } catch (e) {
      const err = e as InvalidTransitionError;
      expect(err.validTargets).toContain('succeeded');
      expect(err.validTargets).toContain('failed');
    }
  });

  it('should throw for terminal state with outgoing attempt', () => {
    expect(() => assertValidTransition(JOB_MAP, 'succeeded', 'pending')).toThrow(
      InvalidTransitionError,
    );
  });

  it('should not throw for valid transition without context', () => {
    expect(() => assertValidTransition(JOB_MAP, 'failed', 'pending')).not.toThrow();
  });
});

// =============================================================================
// createStatePredicate
// =============================================================================

describe('createStatePredicate', () => {
  it('should create predicate from Set', () => {
    const isActive = createStatePredicate<JobState>(new Set(['pending', 'running']));
    expect(isActive('pending')).toBe(true);
    expect(isActive('running')).toBe(true);
    expect(isActive('succeeded')).toBe(false);
    expect(isActive('failed')).toBe(false);
  });

  it('should create predicate from array', () => {
    const isTerminal = createStatePredicate<JobState>(['succeeded', 'failed'] as const);
    expect(isTerminal('succeeded')).toBe(true);
    expect(isTerminal('failed')).toBe(true);
    expect(isTerminal('pending')).toBe(false);
  });

  it('should handle empty set', () => {
    const nothing = createStatePredicate<JobState>(new Set());
    expect(nothing('pending')).toBe(false);
    expect(nothing('running')).toBe(false);
  });

  it('should handle empty array', () => {
    const nothing = createStatePredicate<JobState>([]);
    expect(nothing('pending')).toBe(false);
  });

  it('should handle single-element set', () => {
    const isSucceeded = createStatePredicate<JobState>(new Set(['succeeded']));
    expect(isSucceeded('succeeded')).toBe(true);
    expect(isSucceeded('failed')).toBe(false);
  });

  it('should handle all states', () => {
    const isAny = createStatePredicate<JobState>(
      new Set(['pending', 'running', 'succeeded', 'failed']),
    );
    expect(isAny('pending')).toBe(true);
    expect(isAny('running')).toBe(true);
    expect(isAny('succeeded')).toBe(true);
    expect(isAny('failed')).toBe(true);
  });
});

// =============================================================================
// createStatePredicates
// =============================================================================

describe('createStatePredicates', () => {
  it('should create multiple predicates from categories', () => {
    const predicates = createStatePredicates<JobState, 'isActive' | 'isTerminal'>({
      isActive: ['pending', 'running'],
      isTerminal: ['succeeded'],
    });

    expect(predicates.isActive('pending')).toBe(true);
    expect(predicates.isActive('running')).toBe(true);
    expect(predicates.isActive('succeeded')).toBe(false);
    expect(predicates.isTerminal('succeeded')).toBe(true);
    expect(predicates.isTerminal('pending')).toBe(false);
  });

  it('should handle Set-based categories', () => {
    const predicates = createStatePredicates<JobState, 'isActive'>({
      isActive: new Set(['pending', 'running']),
    });
    expect(predicates.isActive('pending')).toBe(true);
    expect(predicates.isActive('succeeded')).toBe(false);
  });

  it('should handle empty categories object', () => {
    const predicates = createStatePredicates<JobState, never>(
      {} as Record<never, readonly JobState[]>,
    );
    expect(Object.keys(predicates)).toHaveLength(0);
  });

  it('should handle single category', () => {
    const predicates = createStatePredicates<JobState, 'isFailed'>({
      isFailed: ['failed'],
    });
    expect(predicates.isFailed('failed')).toBe(true);
    expect(predicates.isFailed('succeeded')).toBe(false);
  });

  it('should handle overlapping categories', () => {
    const predicates = createStatePredicates<JobState, 'canRetry' | 'isNonTerminal'>({
      canRetry: ['failed'],
      isNonTerminal: ['pending', 'running', 'failed'],
    });
    // failed is in both categories
    expect(predicates.canRetry('failed')).toBe(true);
    expect(predicates.isNonTerminal('failed')).toBe(true);
    // pending is only in isNonTerminal
    expect(predicates.canRetry('pending')).toBe(false);
    expect(predicates.isNonTerminal('pending')).toBe(true);
  });

  it('should handle many categories', () => {
    const predicates = createStatePredicates<JobState, 'a' | 'b' | 'c' | 'd'>({
      a: ['pending'],
      b: ['running'],
      c: ['succeeded'],
      d: ['failed'],
    });
    expect(predicates.a('pending')).toBe(true);
    expect(predicates.b('running')).toBe(true);
    expect(predicates.c('succeeded')).toBe(true);
    expect(predicates.d('failed')).toBe(true);
  });
});
