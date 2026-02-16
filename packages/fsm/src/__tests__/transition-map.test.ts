import { describe, it, expect } from 'vitest';
import { createTransitionMap, createTransitionMapFromConfig } from '../transition-map';
import { TerminalStateViolationError, UnknownStateError } from '../errors';
import type { StateMachineConfig } from '../types';

// =============================================================================
// Test fixtures
// =============================================================================

type TrafficLight = 'red' | 'yellow' | 'green';

const TRAFFIC_TRANSITIONS: Record<TrafficLight, readonly TrafficLight[]> = {
  red: ['green'],
  green: ['yellow'],
  yellow: ['red'],
};

type JobState = 'pending' | 'running' | 'succeeded' | 'failed';

const JOB_TRANSITIONS: Record<JobState, readonly JobState[]> = {
  pending: ['running'],
  running: ['succeeded', 'failed'],
  succeeded: [],
  failed: ['pending'],
};

// =============================================================================
// createTransitionMap
// =============================================================================

describe('createTransitionMap', () => {
  describe('valid configurations', () => {
    it('should create a transition map with no terminal states', () => {
      const map = createTransitionMap<TrafficLight>(TRAFFIC_TRANSITIONS, []);
      expect(map.states.size).toBe(3);
      expect(map.terminalStates.size).toBe(0);
    });

    it('should create a transition map with terminal states', () => {
      const map = createTransitionMap<JobState>(JOB_TRANSITIONS, ['succeeded']);
      expect(map.states.size).toBe(4);
      expect(map.terminalStates.size).toBe(1);
      expect(map.terminalStates.has('succeeded')).toBe(true);
    });

    it('should create correct transition entries', () => {
      const map = createTransitionMap<JobState>(JOB_TRANSITIONS, ['succeeded']);
      expect(map.transitions.get('pending')).toEqual(new Set(['running']));
      expect(map.transitions.get('running')).toEqual(new Set(['succeeded', 'failed']));
      expect(map.transitions.get('succeeded')).toEqual(new Set());
      expect(map.transitions.get('failed')).toEqual(new Set(['pending']));
    });

    it('should include all states', () => {
      const map = createTransitionMap<TrafficLight>(TRAFFIC_TRANSITIONS, []);
      expect(map.states).toEqual(new Set(['red', 'green', 'yellow']));
    });

    it('should handle multiple terminal states', () => {
      type S = 'a' | 'b' | 'c' | 'd';
      const map = createTransitionMap<S>({ a: ['b'], b: ['c', 'd'], c: [], d: [] }, ['c', 'd']);
      expect(map.terminalStates.size).toBe(2);
      expect(map.terminalStates.has('c')).toBe(true);
      expect(map.terminalStates.has('d')).toBe(true);
    });

    it('should handle single-state FSM', () => {
      type S = 'only';
      const map = createTransitionMap<S>({ only: [] }, ['only']);
      expect(map.states.size).toBe(1);
      expect(map.terminalStates.size).toBe(1);
      expect(map.transitions.get('only')).toEqual(new Set());
    });

    it('should handle self-loops', () => {
      type S = 'loop' | 'exit';
      const map = createTransitionMap<S>({ loop: ['loop', 'exit'], exit: [] }, ['exit']);
      expect(map.transitions.get('loop')).toEqual(new Set(['loop', 'exit']));
    });

    it('should handle all-terminal FSM (no transitions)', () => {
      type S = 'a' | 'b';
      const map = createTransitionMap<S>({ a: [], b: [] }, ['a', 'b']);
      expect(map.terminalStates.size).toBe(2);
      for (const [, targets] of map.transitions) {
        expect(targets.size).toBe(0);
      }
    });

    it('should produce a frozen map', () => {
      const map = createTransitionMap<TrafficLight>(TRAFFIC_TRANSITIONS, []);
      expect(Object.isFrozen(map)).toBe(true);
    });

    it('should handle empty terminal states array', () => {
      const map = createTransitionMap<TrafficLight>(TRAFFIC_TRANSITIONS, []);
      expect(map.terminalStates.size).toBe(0);
    });

    it('should handle duplicate targets in transition arrays', () => {
      type S = 'a' | 'b';
      const map = createTransitionMap<S>({ a: ['b', 'b'], b: [] }, ['b']);
      // Set deduplicates
      expect(map.transitions.get('a')!.size).toBe(1);
    });

    it('should handle large FSM (10+ states)', () => {
      type S = 's0' | 's1' | 's2' | 's3' | 's4' | 's5' | 's6' | 's7' | 's8' | 's9';
      const transitions: Record<S, readonly S[]> = {
        s0: ['s1'],
        s1: ['s2'],
        s2: ['s3'],
        s3: ['s4'],
        s4: ['s5'],
        s5: ['s6'],
        s6: ['s7'],
        s7: ['s8'],
        s8: ['s9'],
        s9: [],
      };
      const map = createTransitionMap<S>(transitions, ['s9']);
      expect(map.states.size).toBe(10);
      expect(map.terminalStates.size).toBe(1);
    });
  });

  describe('validation — terminal state violations (Bug #1 catcher)', () => {
    it('should throw TerminalStateViolationError when terminal state has outgoing transitions', () => {
      expect(() =>
        createTransitionMap<JobState>(
          {
            pending: ['running'],
            running: ['succeeded', 'failed'],
            succeeded: ['pending'], // BUG: terminal with transitions
            failed: ['pending'],
          },
          ['succeeded'],
        ),
      ).toThrow(TerminalStateViolationError);
    });

    it('should include state name in error', () => {
      try {
        createTransitionMap<JobState>(
          {
            pending: ['running'],
            running: ['succeeded', 'failed'],
            succeeded: ['pending'],
            failed: [],
          },
          ['succeeded'],
        );
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(TerminalStateViolationError);
        const err = e as TerminalStateViolationError;
        expect(err.state).toBe('succeeded');
        expect(err.outgoingTransitions).toEqual(['pending']);
      }
    });

    it('should throw for any terminal state with transitions (multiple terminal)', () => {
      type S = 'a' | 'b' | 'c';
      expect(() =>
        createTransitionMap<S>(
          { a: ['b'], b: ['a'], c: [] },
          ['b', 'c'], // 'b' is terminal but has transitions to 'a'
        ),
      ).toThrow(TerminalStateViolationError);
    });
  });

  describe('validation — unknown states', () => {
    it('should throw UnknownStateError for unknown terminal state', () => {
      expect(() =>
        createTransitionMap(
          { a: ['b'], b: [] } as Record<string, readonly string[]>,
          ['c'], // 'c' not defined
        ),
      ).toThrow(UnknownStateError);
    });

    it('should throw UnknownStateError for unknown target state', () => {
      expect(() =>
        createTransitionMap(
          { a: ['x'], b: [] } as Record<string, readonly string[]>, // 'x' not defined
          ['b'],
        ),
      ).toThrow(UnknownStateError);
    });

    it('should include state and known states in error', () => {
      try {
        createTransitionMap({ a: ['b'], b: [] } as Record<string, readonly string[]>, [
          'nonexistent',
        ]);
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(UnknownStateError);
        const err = e as UnknownStateError;
        expect(err.state).toBe('nonexistent');
        expect(err.knownStates).toContain('a');
        expect(err.knownStates).toContain('b');
      }
    });
  });
});

// =============================================================================
// createTransitionMapFromConfig
// =============================================================================

describe('createTransitionMapFromConfig', () => {
  it('should create map from Record-based config', () => {
    const config: StateMachineConfig<JobState> = {
      initialState: 'pending',
      transitions: JOB_TRANSITIONS,
      terminalStates: ['succeeded'],
    };
    const map = createTransitionMapFromConfig(config);
    expect(map.states.size).toBe(4);
    expect(map.terminalStates.has('succeeded')).toBe(true);
  });

  it('should create map from Map-based config', () => {
    const transitions = new Map<JobState, ReadonlySet<JobState>>([
      ['pending', new Set(['running'])],
      ['running', new Set(['succeeded', 'failed'])],
      ['succeeded', new Set()],
      ['failed', new Set(['pending'])],
    ]);
    const config: StateMachineConfig<JobState> = {
      initialState: 'pending',
      transitions,
      terminalStates: new Set(['succeeded']),
    };
    const map = createTransitionMapFromConfig(config);
    expect(map.states.size).toBe(4);
    expect(map.transitions.get('running')).toEqual(new Set(['succeeded', 'failed']));
  });

  it('should handle Set-based terminal states', () => {
    const config: StateMachineConfig<JobState> = {
      initialState: 'pending',
      transitions: JOB_TRANSITIONS,
      terminalStates: new Set(['succeeded']),
    };
    const map = createTransitionMapFromConfig(config);
    expect(map.terminalStates.has('succeeded')).toBe(true);
  });

  it('should validate terminal states with Map format', () => {
    const transitions = new Map<JobState, ReadonlySet<JobState>>([
      ['pending', new Set(['running'])],
      ['running', new Set(['succeeded', 'failed'])],
      ['succeeded', new Set(['pending'])], // BUG: terminal with transitions
      ['failed', new Set(['pending'])],
    ]);
    expect(() =>
      createTransitionMapFromConfig({
        initialState: 'pending',
        transitions,
        terminalStates: ['succeeded'],
      }),
    ).toThrow(TerminalStateViolationError);
  });

  it('should handle empty Map transitions', () => {
    type S = 'only';
    const transitions = new Map<S, ReadonlySet<S>>([['only', new Set()]]);
    const map = createTransitionMapFromConfig({
      initialState: 'only',
      transitions,
      terminalStates: ['only'],
    });
    expect(map.states.size).toBe(1);
  });

  it('should produce equivalent maps from Record and Map formats', () => {
    const recordMap = createTransitionMapFromConfig<JobState>({
      initialState: 'pending',
      transitions: JOB_TRANSITIONS,
      terminalStates: ['succeeded'],
    });

    const mapTransitions = new Map<JobState, ReadonlySet<JobState>>([
      ['pending', new Set(['running'])],
      ['running', new Set(['succeeded', 'failed'])],
      ['succeeded', new Set()],
      ['failed', new Set(['pending'])],
    ]);
    const mapMap = createTransitionMapFromConfig<JobState>({
      initialState: 'pending',
      transitions: mapTransitions,
      terminalStates: new Set(['succeeded']),
    });

    expect(recordMap.states).toEqual(mapMap.states);
    expect(recordMap.terminalStates).toEqual(mapMap.terminalStates);
    for (const state of recordMap.states) {
      expect(recordMap.transitions.get(state)).toEqual(mapMap.transitions.get(state));
    }
  });
});
