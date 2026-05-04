import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StateMachine } from '../state-machine';
import { InvalidTransitionError, UnknownStateError, TerminalStateViolationError } from '../errors';
import type { StateMachineConfig, StateChangeHandler } from '../types';

// =============================================================================
// Test fixtures
// =============================================================================

type JobState = 'pending' | 'running' | 'succeeded' | 'failed';

const JOB_CONFIG: StateMachineConfig<JobState> = {
  initialState: 'pending',
  transitions: {
    pending: ['running'],
    running: ['succeeded', 'failed'],
    succeeded: [],
    failed: ['pending'],
  },
  terminalStates: ['succeeded'],
  categories: {
    active: ['pending', 'running'],
    done: ['succeeded', 'failed'],
    retryable: ['failed'],
  },
};

type Light = 'red' | 'yellow' | 'green';

const LIGHT_CONFIG: StateMachineConfig<Light> = {
  initialState: 'red',
  transitions: {
    red: ['green'],
    green: ['yellow'],
    yellow: ['red'],
  },
  terminalStates: [],
};

function createJobMachine(): StateMachine<JobState> {
  return new StateMachine(JOB_CONFIG);
}

function createLightMachine(): StateMachine<Light> {
  return new StateMachine(LIGHT_CONFIG);
}

// =============================================================================
// Constructor
// =============================================================================

describe('StateMachine — constructor', () => {
  it('should create machine with initial state', () => {
    const m = createJobMachine();
    expect(m.state).toBe('pending');
  });

  it('should start with empty history', () => {
    const m = createJobMachine();
    expect(m.history).toEqual([]);
  });

  it('should not be terminal initially (non-terminal initial)', () => {
    const m = createJobMachine();
    expect(m.isTerminal).toBe(false);
  });

  it('should throw UnknownStateError for unknown initial state', () => {
    expect(() => {
      new StateMachine({
        initialState: 'nonexistent' as JobState,
        transitions: { pending: ['running'], running: [], succeeded: [], failed: [] },
        terminalStates: [],
      });
    }).toThrow(UnknownStateError);
  });

  it('should throw TerminalStateViolationError for invalid config', () => {
    expect(() => {
      new StateMachine<JobState>({
        initialState: 'pending',
        transitions: {
          pending: ['running'],
          running: ['succeeded', 'failed'],
          succeeded: ['pending'], // BUG
          failed: [],
        },
        terminalStates: ['succeeded'],
      });
    }).toThrow(TerminalStateViolationError);
  });

  it('should allow terminal state as initial state', () => {
    const m = new StateMachine<JobState>({
      ...JOB_CONFIG,
      initialState: 'succeeded',
    });
    expect(m.state).toBe('succeeded');
    expect(m.isTerminal).toBe(true);
  });

  it('should expose the transition map', () => {
    const m = createJobMachine();
    expect(m.transitionMap).toBeDefined();
    expect(m.transitionMap.states.size).toBe(4);
  });

  it('should work with Map-based transitions', () => {
    const transitions = new Map<JobState, ReadonlySet<JobState>>([
      ['pending', new Set(['running'])],
      ['running', new Set(['succeeded', 'failed'])],
      ['succeeded', new Set()],
      ['failed', new Set(['pending'])],
    ]);
    const m = new StateMachine<JobState>({
      initialState: 'pending',
      transitions,
      terminalStates: new Set(['succeeded']),
    });
    expect(m.state).toBe('pending');
  });
});

// =============================================================================
// transitionTo
// =============================================================================

describe('StateMachine — transitionTo', () => {
  let m: StateMachine<JobState>;

  beforeEach(() => {
    m = createJobMachine();
  });

  it('should transition to valid state', () => {
    const result = m.transitionTo('running');
    expect(result).toBe('running');
    expect(m.state).toBe('running');
  });

  it('should throw InvalidTransitionError for invalid transition', () => {
    expect(() => m.transitionTo('succeeded')).toThrow(InvalidTransitionError);
  });

  it('should not change state on invalid transition', () => {
    try {
      m.transitionTo('succeeded');
    } catch {
      // expected
    }
    expect(m.state).toBe('pending');
  });

  it('should record history on valid transition', () => {
    m.transitionTo('running');
    expect(m.history).toHaveLength(1);
    expect(m.history[0].from).toBe('pending');
    expect(m.history[0].to).toBe('running');
    expect(m.history[0].timestamp).toBeTypeOf('number');
  });

  it('should not record history on invalid transition', () => {
    try {
      m.transitionTo('succeeded');
    } catch {
      // expected
    }
    expect(m.history).toHaveLength(0);
  });

  it('should pass context to history', () => {
    m.transitionTo('running', { reason: 'manual' });
    expect(m.history[0].context).toEqual({ reason: 'manual' });
  });

  it('should freeze context in history', () => {
    const ctx = { mutable: true };
    m.transitionTo('running', ctx);
    expect(Object.isFrozen(m.history[0].context)).toBe(true);
  });

  it('should track multiple transitions in history', () => {
    m.transitionTo('running');
    m.transitionTo('succeeded');
    expect(m.history).toHaveLength(2);
    expect(m.history[0].from).toBe('pending');
    expect(m.history[0].to).toBe('running');
    expect(m.history[1].from).toBe('running');
    expect(m.history[1].to).toBe('succeeded');
  });

  it('should throw from terminal state', () => {
    m.transitionTo('running');
    m.transitionTo('succeeded');
    expect(() => m.transitionTo('pending')).toThrow(InvalidTransitionError);
  });

  it('should include context in error', () => {
    try {
      m.transitionTo('succeeded', { jobId: '123' });
      expect.fail('Should have thrown');
    } catch (e) {
      const err = e as InvalidTransitionError<JobState>;
      expect(err.context).toEqual({ jobId: '123' });
    }
  });

  it('should return new state value', () => {
    const newState = m.transitionTo('running');
    expect(newState).toBe('running');
  });

  it('should work with cyclic transitions', () => {
    const light = createLightMachine();
    light.transitionTo('green');
    light.transitionTo('yellow');
    light.transitionTo('red');
    expect(light.state).toBe('red');
    expect(light.history).toHaveLength(3);
  });

  it('should handle retry cycle (failed -> pending -> running)', () => {
    m.transitionTo('running');
    m.transitionTo('failed');
    m.transitionTo('pending');
    m.transitionTo('running');
    expect(m.state).toBe('running');
    expect(m.history).toHaveLength(4);
  });
});

// =============================================================================
// tryTransitionTo
// =============================================================================

describe('StateMachine — tryTransitionTo', () => {
  let m: StateMachine<JobState>;

  beforeEach(() => {
    m = createJobMachine();
  });

  it('should return success result for valid transition', () => {
    const result = m.tryTransitionTo('running');
    expect(result.success).toBe(true);
    expect(result.from).toBe('pending');
    expect(result.to).toBe('running');
  });

  it('should change state on success', () => {
    m.tryTransitionTo('running');
    expect(m.state).toBe('running');
  });

  it('should return failure result for invalid transition', () => {
    const result = m.tryTransitionTo('succeeded');
    expect(result.success).toBe(false);
    expect(result.from).toBe('pending');
    expect(result.to).toBe('succeeded');
  });

  it('should not change state on failure', () => {
    m.tryTransitionTo('succeeded');
    expect(m.state).toBe('pending');
  });

  it('should include validTargets in failure result', () => {
    const result = m.tryTransitionTo('succeeded');
    if (!result.success) {
      expect(result.validTargets).toContain('running');
    } else {
      expect.fail('Expected failure');
    }
  });

  it('should record history on success', () => {
    m.tryTransitionTo('running');
    expect(m.history).toHaveLength(1);
  });

  it('should not record history on failure', () => {
    m.tryTransitionTo('succeeded');
    expect(m.history).toHaveLength(0);
  });

  it('should pass context in success result', () => {
    m.tryTransitionTo('running', { source: 'api' });
    expect(m.history[0].context).toEqual({ source: 'api' });
  });

  it('should be type-narrowable via success field', () => {
    const result = m.tryTransitionTo('running');
    if (result.success) {
      // TypeScript should know this is TransitionSuccess
      const _from: JobState = result.from;
      const _to: JobState = result.to;
      expect(_from).toBe('pending');
      expect(_to).toBe('running');
    }
  });

  it('should be type-narrowable on failure', () => {
    const result = m.tryTransitionTo('succeeded');
    if (!result.success) {
      // TypeScript should know this is TransitionFailure
      const _validTargets: readonly JobState[] = result.validTargets;
      expect(_validTargets).toBeDefined();
    }
  });
});

// =============================================================================
// canTransitionTo
// =============================================================================

describe('StateMachine — canTransitionTo', () => {
  it('should return true for valid transitions', () => {
    const m = createJobMachine();
    expect(m.canTransitionTo('running')).toBe(true);
  });

  it('should return false for invalid transitions', () => {
    const m = createJobMachine();
    expect(m.canTransitionTo('succeeded')).toBe(false);
    expect(m.canTransitionTo('failed')).toBe(false);
  });

  it('should update after transition', () => {
    const m = createJobMachine();
    m.transitionTo('running');
    expect(m.canTransitionTo('succeeded')).toBe(true);
    expect(m.canTransitionTo('failed')).toBe(true);
    expect(m.canTransitionTo('running')).toBe(false);
  });

  it('should return false from terminal state', () => {
    const m = createJobMachine();
    m.transitionTo('running');
    m.transitionTo('succeeded');
    expect(m.canTransitionTo('pending')).toBe(false);
    expect(m.canTransitionTo('running')).toBe(false);
  });
});

// =============================================================================
// validTransitions
// =============================================================================

describe('StateMachine — validTransitions', () => {
  it('should return valid targets for current state', () => {
    const m = createJobMachine();
    expect(m.validTransitions).toEqual(['running']);
  });

  it('should update after transition', () => {
    const m = createJobMachine();
    m.transitionTo('running');
    expect(m.validTransitions).toContain('succeeded');
    expect(m.validTransitions).toContain('failed');
  });

  it('should return empty for terminal state', () => {
    const m = createJobMachine();
    m.transitionTo('running');
    m.transitionTo('succeeded');
    expect(m.validTransitions).toEqual([]);
  });
});

// =============================================================================
// isTerminal
// =============================================================================

describe('StateMachine — isTerminal', () => {
  it('should be false for non-terminal state', () => {
    const m = createJobMachine();
    expect(m.isTerminal).toBe(false);
  });

  it('should be true for terminal state', () => {
    const m = createJobMachine();
    m.transitionTo('running');
    m.transitionTo('succeeded');
    expect(m.isTerminal).toBe(true);
  });

  it('should be false for failed (non-terminal) state', () => {
    const m = createJobMachine();
    m.transitionTo('running');
    m.transitionTo('failed');
    expect(m.isTerminal).toBe(false);
  });

  it('should always be false for cyclic FSM with no terminal states', () => {
    const light = createLightMachine();
    light.transitionTo('green');
    expect(light.isTerminal).toBe(false);
    light.transitionTo('yellow');
    expect(light.isTerminal).toBe(false);
    light.transitionTo('red');
    expect(light.isTerminal).toBe(false);
  });
});

// =============================================================================
// onStateChange
// =============================================================================

describe('StateMachine — onStateChange', () => {
  it('should call handler on transition', () => {
    const m = createJobMachine();
    const handler = vi.fn();
    m.onStateChange(handler);
    m.transitionTo('running');
    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith('pending', 'running', undefined);
  });

  it('should pass context to handler', () => {
    const m = createJobMachine();
    const handler = vi.fn();
    m.onStateChange(handler);
    m.transitionTo('running', { source: 'api' });
    expect(handler).toHaveBeenCalledWith(
      'pending',
      'running',
      expect.objectContaining({ source: 'api' }),
    );
  });

  it('should call handler for tryTransitionTo on success', () => {
    const m = createJobMachine();
    const handler = vi.fn();
    m.onStateChange(handler);
    m.tryTransitionTo('running');
    expect(handler).toHaveBeenCalledOnce();
  });

  it('should not call handler for tryTransitionTo on failure', () => {
    const m = createJobMachine();
    const handler = vi.fn();
    m.onStateChange(handler);
    m.tryTransitionTo('succeeded');
    expect(handler).not.toHaveBeenCalled();
  });

  it('should not call handler for failed transitionTo', () => {
    const m = createJobMachine();
    const handler = vi.fn();
    m.onStateChange(handler);
    try {
      m.transitionTo('succeeded');
    } catch {
      // expected
    }
    expect(handler).not.toHaveBeenCalled();
  });

  it('should support multiple handlers', () => {
    const m = createJobMachine();
    const h1 = vi.fn();
    const h2 = vi.fn();
    m.onStateChange(h1);
    m.onStateChange(h2);
    m.transitionTo('running');
    expect(h1).toHaveBeenCalledOnce();
    expect(h2).toHaveBeenCalledOnce();
  });

  it('should return unsubscribe function', () => {
    const m = createJobMachine();
    const handler = vi.fn();
    const unsub = m.onStateChange(handler);
    unsub();
    m.transitionTo('running');
    expect(handler).not.toHaveBeenCalled();
  });

  it('should only unsubscribe the specific handler', () => {
    const m = createJobMachine();
    const h1 = vi.fn();
    const h2 = vi.fn();
    const unsub1 = m.onStateChange(h1);
    m.onStateChange(h2);
    unsub1();
    m.transitionTo('running');
    expect(h1).not.toHaveBeenCalled();
    expect(h2).toHaveBeenCalledOnce();
  });

  it('should survive handler that throws', () => {
    const m = createJobMachine();
    const throwingHandler: StateChangeHandler<JobState> = () => {
      throw new Error('handler error');
    };
    const normalHandler = vi.fn();
    m.onStateChange(throwingHandler);
    m.onStateChange(normalHandler);
    // Should not throw and should call second handler
    m.transitionTo('running');
    expect(normalHandler).toHaveBeenCalledOnce();
    expect(m.state).toBe('running');
  });

  it('should call handlers in registration order', () => {
    const m = createJobMachine();
    const order: number[] = [];
    m.onStateChange(() => order.push(1));
    m.onStateChange(() => order.push(2));
    m.onStateChange(() => order.push(3));
    m.transitionTo('running');
    expect(order).toEqual([1, 2, 3]);
  });

  it('should be safe to unsubscribe multiple times', () => {
    const m = createJobMachine();
    const handler = vi.fn();
    const unsub = m.onStateChange(handler);
    unsub();
    unsub(); // safe double-unsub
    m.transitionTo('running');
    expect(handler).not.toHaveBeenCalled();
  });

  it('should track transitions across handler calls', () => {
    const m = createJobMachine();
    const transitions: Array<[JobState, JobState]> = [];
    m.onStateChange((from, to) => transitions.push([from, to]));
    m.transitionTo('running');
    m.transitionTo('failed');
    m.transitionTo('pending');
    expect(transitions).toEqual([
      ['pending', 'running'],
      ['running', 'failed'],
      ['failed', 'pending'],
    ]);
  });
});

// =============================================================================
// isInCategory
// =============================================================================

describe('StateMachine — isInCategory', () => {
  it('should return true for matching category', () => {
    const m = createJobMachine();
    expect(m.isInCategory('active')).toBe(true); // pending is active
  });

  it('should return false for non-matching category', () => {
    const m = createJobMachine();
    expect(m.isInCategory('retryable')).toBe(false); // pending is not retryable
  });

  it('should update after transition', () => {
    const m = createJobMachine();
    m.transitionTo('running');
    m.transitionTo('failed');
    expect(m.isInCategory('retryable')).toBe(true);
    expect(m.isInCategory('active')).toBe(false);
    expect(m.isInCategory('done')).toBe(true);
  });

  it('should return false for unknown category', () => {
    const m = createJobMachine();
    expect(m.isInCategory('nonexistent')).toBe(false);
  });

  it('should work for machine without categories', () => {
    const m = createLightMachine();
    expect(m.isInCategory('anything')).toBe(false);
  });
});

// =============================================================================
// reset
// =============================================================================

describe('StateMachine — reset', () => {
  it('should reset to initial state', () => {
    const m = createJobMachine();
    m.transitionTo('running');
    m.transitionTo('succeeded');
    m.reset();
    expect(m.state).toBe('pending');
  });

  it('should clear history by default', () => {
    const m = createJobMachine();
    m.transitionTo('running');
    m.reset();
    expect(m.history).toEqual([]);
  });

  it('should preserve history when clearHistory is false', () => {
    const m = createJobMachine();
    m.transitionTo('running');
    m.reset(false);
    expect(m.state).toBe('pending');
    expect(m.history).toHaveLength(1);
  });

  it('should allow transitions after reset', () => {
    const m = createJobMachine();
    m.transitionTo('running');
    m.transitionTo('succeeded');
    m.reset();
    expect(() => m.transitionTo('running')).not.toThrow();
  });

  it('should reset terminal machine to non-terminal', () => {
    const m = createJobMachine();
    m.transitionTo('running');
    m.transitionTo('succeeded');
    expect(m.isTerminal).toBe(true);
    m.reset();
    expect(m.isTerminal).toBe(false);
  });
});

// =============================================================================
// snapshot / restore
// =============================================================================

describe('StateMachine — snapshot / restore', () => {
  it('should create a snapshot of current state', () => {
    const m = createJobMachine();
    m.transitionTo('running');
    const snap = m.snapshot();
    expect(snap.state).toBe('running');
    expect(snap.history).toHaveLength(1);
    expect(snap.createdAt).toBeTypeOf('number');
  });

  it('should restore from snapshot', () => {
    const m = createJobMachine();
    m.transitionTo('running');
    const snap = m.snapshot();

    const m2 = createJobMachine();
    m2.restore(snap);
    expect(m2.state).toBe('running');
    expect(m2.history).toHaveLength(1);
  });

  it('should create independent snapshot (not affected by later changes)', () => {
    const m = createJobMachine();
    m.transitionTo('running');
    const snap = m.snapshot();
    m.transitionTo('succeeded');
    expect(snap.state).toBe('running');
    expect(snap.history).toHaveLength(1);
  });

  it('should restore independently (original not affected)', () => {
    const m = createJobMachine();
    m.transitionTo('running');
    const snap = m.snapshot();

    const m2 = createJobMachine();
    m2.restore(snap);
    m2.transitionTo('succeeded');

    expect(m.state).toBe('running');
    expect(m2.state).toBe('succeeded');
  });

  it('should throw UnknownStateError when restoring invalid state', () => {
    const m = createJobMachine();
    expect(() =>
      m.restore({ state: 'nonexistent' as JobState, history: [], createdAt: Date.now() }),
    ).toThrow(UnknownStateError);
  });

  it('should restore with history', () => {
    const m = createJobMachine();
    m.transitionTo('running');
    m.transitionTo('succeeded');
    const snap = m.snapshot();

    const m2 = createJobMachine();
    m2.restore(snap);
    expect(m2.history).toHaveLength(2);
    expect(m2.history[0].from).toBe('pending');
    expect(m2.history[1].from).toBe('running');
  });

  it('should allow transitions after restore', () => {
    const m = createJobMachine();
    m.transitionTo('running');
    const snap = m.snapshot();

    const m2 = createJobMachine();
    m2.restore(snap);
    expect(() => m2.transitionTo('succeeded')).not.toThrow();
  });

  it('should round-trip snapshot correctly', () => {
    const m = createJobMachine();
    m.transitionTo('running', { reason: 'test' });
    m.transitionTo('failed', { error: 'timeout' });
    const snap = m.snapshot();

    const json = JSON.stringify(snap);
    const restored = JSON.parse(json);

    const m2 = createJobMachine();
    m2.restore(restored);
    expect(m2.state).toBe('failed');
    expect(m2.history).toHaveLength(2);
  });

  it('should overwrite current state on restore', () => {
    const m = createJobMachine();
    m.transitionTo('running');
    m.transitionTo('succeeded');
    expect(m.state).toBe('succeeded');

    m.restore({ state: 'pending', history: [], createdAt: Date.now() });
    expect(m.state).toBe('pending');
    expect(m.history).toHaveLength(0);
  });
});

// =============================================================================
// Edge cases
// =============================================================================

describe('StateMachine — edge cases', () => {
  it('should handle rapid transitions', () => {
    const light = createLightMachine();
    for (let i = 0; i < 100; i++) {
      light.transitionTo('green');
      light.transitionTo('yellow');
      light.transitionTo('red');
    }
    expect(light.state).toBe('red');
    expect(light.history).toHaveLength(300);
  });

  it('should handle single-state terminal FSM', () => {
    type S = 'only';
    const m = new StateMachine<S>({
      initialState: 'only',
      transitions: { only: [] },
      terminalStates: ['only'],
    });
    expect(m.state).toBe('only');
    expect(m.isTerminal).toBe(true);
    expect(m.validTransitions).toEqual([]);
  });

  it('should handle self-loop FSM', () => {
    type S = 'loop' | 'exit';
    const m = new StateMachine<S>({
      initialState: 'loop',
      transitions: { loop: ['loop', 'exit'], exit: [] },
      terminalStates: ['exit'],
    });
    m.transitionTo('loop');
    m.transitionTo('loop');
    m.transitionTo('exit');
    expect(m.state).toBe('exit');
    expect(m.history).toHaveLength(3);
  });

  it('should handle machine with all terminal states', () => {
    type S = 'a' | 'b';
    const m = new StateMachine<S>({
      initialState: 'a',
      transitions: { a: [], b: [] },
      terminalStates: ['a', 'b'],
    });
    expect(m.isTerminal).toBe(true);
    expect(m.validTransitions).toEqual([]);
  });

  it('should handle context with null values', () => {
    const m = createJobMachine();
    m.transitionTo('running', { key: null });
    expect(m.history[0].context).toEqual({ key: null });
  });

  it('should handle empty context', () => {
    const m = createJobMachine();
    m.transitionTo('running', {});
    expect(m.history[0].context).toEqual({});
  });

  it('should handle undefined context', () => {
    const m = createJobMachine();
    m.transitionTo('running');
    expect(m.history[0].context).toBeUndefined();
  });

  it('should handle timestamps increasing across transitions', () => {
    const m = createJobMachine();
    m.transitionTo('running');
    m.transitionTo('succeeded');
    expect(m.history[1].timestamp).toBeGreaterThanOrEqual(m.history[0].timestamp);
  });

  it('should handle transition with complex context', () => {
    const m = createJobMachine();
    const ctx = { nested: { deep: { value: 42 } }, array: [1, 2, 3] };
    m.transitionTo('running', ctx);
    expect(m.history[0].context).toBeDefined();
  });

  it('should expose transitionMap.terminalStates', () => {
    const m = createJobMachine();
    expect(m.transitionMap.terminalStates.has('succeeded')).toBe(true);
    expect(m.transitionMap.terminalStates.has('pending')).toBe(false);
  });

  it('should expose transitionMap.states', () => {
    const m = createJobMachine();
    expect(m.transitionMap.states.size).toBe(4);
    expect(m.transitionMap.states.has('pending')).toBe(true);
  });

  it('should handle two-state FSM', () => {
    type S = 'on' | 'off';
    const m = new StateMachine<S>({
      initialState: 'off',
      transitions: { on: ['off'], off: ['on'] },
      terminalStates: [],
    });
    m.transitionTo('on');
    m.transitionTo('off');
    m.transitionTo('on');
    expect(m.state).toBe('on');
    expect(m.history).toHaveLength(3);
  });

  it('should work with categories using Set', () => {
    type S = 'a' | 'b' | 'c';
    const m = new StateMachine<S>({
      initialState: 'a',
      transitions: { a: ['b'], b: ['c'], c: [] },
      terminalStates: ['c'],
      categories: { early: new Set(['a', 'b']) },
    });
    expect(m.isInCategory('early')).toBe(true);
    m.transitionTo('b');
    expect(m.isInCategory('early')).toBe(true);
    m.transitionTo('c');
    expect(m.isInCategory('early')).toBe(false);
  });
});
