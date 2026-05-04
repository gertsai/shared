import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryStateMachineStore } from '../store';
import { StateMachine } from '../state-machine';
import type { StateMachineConfig } from '../types';

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
};

function createStore(): InMemoryStateMachineStore<JobState> {
  return new InMemoryStateMachineStore(JOB_CONFIG);
}

// =============================================================================
// create
// =============================================================================

describe('InMemoryStateMachineStore — create', () => {
  it('should create a machine with given id', () => {
    const store = createStore();
    const machine = store.create('job-1');
    expect(machine).toBeInstanceOf(StateMachine);
    expect(machine.state).toBe('pending');
  });

  it('should throw when creating duplicate id', () => {
    const store = createStore();
    store.create('job-1');
    expect(() => store.create('job-1')).toThrow("State machine with id 'job-1' already exists");
  });

  it('should create multiple machines with different ids', () => {
    const store = createStore();
    const m1 = store.create('job-1');
    const m2 = store.create('job-2');
    expect(m1).not.toBe(m2);
    expect(store.size).toBe(2);
  });

  it('should increment size on create', () => {
    const store = createStore();
    expect(store.size).toBe(0);
    store.create('job-1');
    expect(store.size).toBe(1);
    store.create('job-2');
    expect(store.size).toBe(2);
  });
});

// =============================================================================
// get / getOrThrow
// =============================================================================

describe('InMemoryStateMachineStore — get', () => {
  let store: InMemoryStateMachineStore<JobState>;

  beforeEach(() => {
    store = createStore();
  });

  it('should return machine by id', () => {
    const created = store.create('job-1');
    const fetched = store.get('job-1');
    expect(fetched).toBe(created);
  });

  it('should return undefined for unknown id', () => {
    expect(store.get('nonexistent')).toBeUndefined();
  });

  it('should return the same instance', () => {
    store.create('job-1');
    const m1 = store.get('job-1');
    const m2 = store.get('job-1');
    expect(m1).toBe(m2);
  });
});

describe('InMemoryStateMachineStore — getOrThrow', () => {
  let store: InMemoryStateMachineStore<JobState>;

  beforeEach(() => {
    store = createStore();
  });

  it('should return machine by id', () => {
    store.create('job-1');
    const machine = store.getOrThrow('job-1');
    expect(machine).toBeInstanceOf(StateMachine);
  });

  it('should throw for unknown id', () => {
    expect(() => store.getOrThrow('nonexistent')).toThrow(
      "State machine with id 'nonexistent' not found",
    );
  });
});

// =============================================================================
// has
// =============================================================================

describe('InMemoryStateMachineStore — has', () => {
  it('should return true for existing machine', () => {
    const store = createStore();
    store.create('job-1');
    expect(store.has('job-1')).toBe(true);
  });

  it('should return false for non-existing machine', () => {
    const store = createStore();
    expect(store.has('nonexistent')).toBe(false);
  });

  it('should return false after deletion', () => {
    const store = createStore();
    store.create('job-1');
    store.delete('job-1');
    expect(store.has('job-1')).toBe(false);
  });
});

// =============================================================================
// delete
// =============================================================================

describe('InMemoryStateMachineStore — delete', () => {
  it('should delete existing machine', () => {
    const store = createStore();
    store.create('job-1');
    expect(store.delete('job-1')).toBe(true);
    expect(store.has('job-1')).toBe(false);
  });

  it('should return false for non-existing machine', () => {
    const store = createStore();
    expect(store.delete('nonexistent')).toBe(false);
  });

  it('should decrement size on delete', () => {
    const store = createStore();
    store.create('job-1');
    store.create('job-2');
    expect(store.size).toBe(2);
    store.delete('job-1');
    expect(store.size).toBe(1);
  });

  it('should allow re-creating after deletion', () => {
    const store = createStore();
    store.create('job-1');
    store.delete('job-1');
    const m = store.create('job-1');
    expect(m.state).toBe('pending');
  });
});

// =============================================================================
// entries
// =============================================================================

describe('InMemoryStateMachineStore — entries', () => {
  it('should iterate over all machines', () => {
    const store = createStore();
    store.create('a');
    store.create('b');
    store.create('c');

    const entries = Array.from(store.entries());
    expect(entries).toHaveLength(3);
    const ids = entries.map(([id]) => id);
    expect(ids).toContain('a');
    expect(ids).toContain('b');
    expect(ids).toContain('c');
  });

  it('should return empty iterator for empty store', () => {
    const store = createStore();
    const entries = Array.from(store.entries());
    expect(entries).toHaveLength(0);
  });

  it('should return machine instances', () => {
    const store = createStore();
    store.create('x');
    for (const [, machine] of store.entries()) {
      expect(machine).toBeInstanceOf(StateMachine);
    }
  });
});

// =============================================================================
// size
// =============================================================================

describe('InMemoryStateMachineStore — size', () => {
  it('should be 0 for empty store', () => {
    expect(createStore().size).toBe(0);
  });

  it('should track number of machines', () => {
    const store = createStore();
    store.create('a');
    expect(store.size).toBe(1);
    store.create('b');
    expect(store.size).toBe(2);
    store.delete('a');
    expect(store.size).toBe(1);
  });
});

// =============================================================================
// snapshot / restore
// =============================================================================

describe('InMemoryStateMachineStore — snapshot / restore', () => {
  it('should snapshot a machine', () => {
    const store = createStore();
    const m = store.create('job-1');
    m.transitionTo('running');
    const snap = store.snapshot('job-1');
    expect(snap).toBeDefined();
    expect(snap!.state).toBe('running');
    expect(snap!.history).toHaveLength(1);
  });

  it('should return undefined for non-existing machine', () => {
    const store = createStore();
    expect(store.snapshot('nonexistent')).toBeUndefined();
  });

  it('should restore a machine from snapshot', () => {
    const store = createStore();
    const m = store.create('job-1');
    m.transitionTo('running');
    const snap = store.snapshot('job-1')!;

    store.delete('job-1');
    const restored = store.restore('job-1', snap);
    expect(restored.state).toBe('running');
    expect(restored.history).toHaveLength(1);
  });

  it('should replace existing machine on restore', () => {
    const store = createStore();
    store.create('job-1');
    const snap = { state: 'running' as const, history: [], createdAt: Date.now() };
    const restored = store.restore('job-1', snap);
    expect(restored.state).toBe('running');
    expect(store.get('job-1')?.state).toBe('running');
  });

  it('should create new machine on restore if id does not exist', () => {
    const store = createStore();
    const snap = { state: 'running' as const, history: [], createdAt: Date.now() };
    const restored = store.restore('new-job', snap);
    expect(restored.state).toBe('running');
    expect(store.has('new-job')).toBe(true);
    expect(store.size).toBe(1);
  });
});

// =============================================================================
// clear
// =============================================================================

describe('InMemoryStateMachineStore — clear', () => {
  it('should remove all machines', () => {
    const store = createStore();
    store.create('a');
    store.create('b');
    store.create('c');
    expect(store.size).toBe(3);
    store.clear();
    expect(store.size).toBe(0);
    expect(store.has('a')).toBe(false);
  });

  it('should be idempotent on empty store', () => {
    const store = createStore();
    store.clear();
    expect(store.size).toBe(0);
  });
});

// =============================================================================
// Integration: machines share same config but are independent
// =============================================================================

describe('InMemoryStateMachineStore — independence', () => {
  it('should not affect other machines when transitioning one', () => {
    const store = createStore();
    const m1 = store.create('job-1');
    const m2 = store.create('job-2');

    m1.transitionTo('running');
    expect(m1.state).toBe('running');
    expect(m2.state).toBe('pending');
  });

  it('should not share history between machines', () => {
    const store = createStore();
    const m1 = store.create('job-1');
    const m2 = store.create('job-2');

    m1.transitionTo('running');
    m1.transitionTo('succeeded');

    expect(m1.history).toHaveLength(2);
    expect(m2.history).toHaveLength(0);
  });

  it('should not share handlers between machines', () => {
    const store = createStore();
    const m1 = store.create('job-1');
    const m2 = store.create('job-2');

    let handlerCalled = false;
    m1.onStateChange(() => {
      handlerCalled = true;
    });

    m2.transitionTo('running');
    expect(handlerCalled).toBe(false);
  });
});
