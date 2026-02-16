import { describe, it, expect } from 'vitest';
import { InvalidTransitionError, UnknownStateError, TerminalStateViolationError } from '../errors';

// =============================================================================
// InvalidTransitionError
// =============================================================================

describe('InvalidTransitionError', () => {
  it('should create error with correct properties', () => {
    const err = new InvalidTransitionError('pending', 'done', ['running', 'cancelled']);
    expect(err.from).toBe('pending');
    expect(err.to).toBe('done');
    expect(err.validTargets).toEqual(['running', 'cancelled']);
    expect(err.context).toBeUndefined();
    expect(err.name).toBe('InvalidTransitionError');
  });

  it('should format message with valid targets', () => {
    const err = new InvalidTransitionError('pending', 'done', ['running', 'cancelled']);
    expect(err.message).toBe(
      "Invalid transition from 'pending' to 'done'. Valid targets: [running, cancelled]",
    );
  });

  it('should format message for terminal state (no valid targets)', () => {
    const err = new InvalidTransitionError('done', 'pending', []);
    expect(err.message).toContain('none (terminal state)');
  });

  it('should store frozen context', () => {
    const context = { reason: 'test', count: 42 };
    const err = new InvalidTransitionError('a', 'b', ['c'], context);
    expect(err.context).toEqual({ reason: 'test', count: 42 });
    expect(Object.isFrozen(err.context)).toBe(true);
  });

  it('should not mutate original context', () => {
    const context = { mutable: true };
    const err = new InvalidTransitionError('a', 'b', ['c'], context);
    context.mutable = false;
    expect(err.context!.mutable).toBe(true);
  });

  it('should be instanceof Error', () => {
    const err = new InvalidTransitionError('a', 'b', []);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(InvalidTransitionError);
  });

  it('should have a stack trace', () => {
    const err = new InvalidTransitionError('a', 'b', []);
    expect(err.stack).toBeDefined();
    expect(err.stack).toContain('InvalidTransitionError');
  });

  it('should preserve readonly validTargets', () => {
    const targets: readonly string[] = ['running'];
    const err = new InvalidTransitionError('pending', 'done', targets);
    expect(err.validTargets).toEqual(['running']);
  });

  it('should handle single valid target', () => {
    const err = new InvalidTransitionError('a', 'c', ['b']);
    expect(err.message).toBe("Invalid transition from 'a' to 'c'. Valid targets: [b]");
  });

  it('should handle many valid targets', () => {
    const err = new InvalidTransitionError('a', 'z', ['b', 'c', 'd', 'e', 'f']);
    expect(err.message).toContain('b, c, d, e, f');
  });

  it('should handle context with nested objects', () => {
    const err = new InvalidTransitionError('a', 'b', [], { nested: { deep: true } });
    expect(err.context).toBeDefined();
  });

  it('should handle undefined context explicitly', () => {
    const err = new InvalidTransitionError('a', 'b', [], undefined);
    expect(err.context).toBeUndefined();
  });

  it('should handle empty context object', () => {
    const err = new InvalidTransitionError('a', 'b', [], {});
    expect(err.context).toEqual({});
  });
});

// =============================================================================
// UnknownStateError
// =============================================================================

describe('UnknownStateError', () => {
  it('should create error with correct properties', () => {
    const err = new UnknownStateError('unknown', ['a', 'b', 'c']);
    expect(err.state).toBe('unknown');
    expect(err.knownStates).toEqual(['a', 'b', 'c']);
    expect(err.name).toBe('UnknownStateError');
  });

  it('should format message correctly', () => {
    const err = new UnknownStateError('x', ['a', 'b']);
    expect(err.message).toBe("Unknown state 'x'. Known states: [a, b]");
  });

  it('should handle single known state', () => {
    const err = new UnknownStateError('x', ['only']);
    expect(err.message).toBe("Unknown state 'x'. Known states: [only]");
  });

  it('should handle empty known states', () => {
    const err = new UnknownStateError('x', []);
    expect(err.message).toBe("Unknown state 'x'. Known states: []");
  });

  it('should be instanceof Error', () => {
    const err = new UnknownStateError('x', []);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(UnknownStateError);
  });

  it('should have a stack trace', () => {
    const err = new UnknownStateError('x', []);
    expect(err.stack).toBeDefined();
  });
});

// =============================================================================
// TerminalStateViolationError
// =============================================================================

describe('TerminalStateViolationError', () => {
  it('should create error with correct properties', () => {
    const err = new TerminalStateViolationError('done', ['pending', 'running']);
    expect(err.state).toBe('done');
    expect(err.outgoingTransitions).toEqual(['pending', 'running']);
    expect(err.name).toBe('TerminalStateViolationError');
  });

  it('should format message correctly', () => {
    const err = new TerminalStateViolationError('done', ['retry']);
    expect(err.message).toBe(
      "Terminal state 'done' must not have outgoing transitions, but has: [retry]",
    );
  });

  it('should handle multiple outgoing transitions', () => {
    const err = new TerminalStateViolationError('done', ['a', 'b', 'c']);
    expect(err.message).toContain('a, b, c');
  });

  it('should be instanceof Error', () => {
    const err = new TerminalStateViolationError('done', []);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(TerminalStateViolationError);
  });

  it('should have a stack trace', () => {
    const err = new TerminalStateViolationError('done', []);
    expect(err.stack).toBeDefined();
  });
});
