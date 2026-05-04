/**
 * @fileoverview In-memory state machine store
 *
 * Manages multiple StateMachine instances keyed by string IDs.
 * Useful for managing a pool of FSM instances (e.g., one per job).
 *
 * @module @gertsai/fsm
 */

import type { StateValue, StateMachineConfig, StateMachineSnapshot } from './types';
import { StateMachine } from './state-machine';

/**
 * In-memory store for managing multiple state machine instances.
 * All machines in a store share the same configuration (same FSM definition).
 *
 * Thread-safe through synchronous operations (no async interleaving).
 *
 * @typeParam S - Union of string literal state values
 *
 * @example
 * ```typescript
 * type JobState = 'pending' | 'running' | 'done';
 *
 * const store = new InMemoryStateMachineStore<JobState>({
 *   initialState: 'pending',
 *   transitions: { pending: ['running'], running: ['done'], done: [] },
 *   terminalStates: ['done'],
 * });
 *
 * const machine = store.create('job-1');
 * machine.transitionTo('running');
 *
 * store.get('job-1')?.state; // 'running'
 * ```
 */
export class InMemoryStateMachineStore<S extends StateValue = string> {
  private readonly _machines: Map<string, StateMachine<S>>;
  private readonly _config: StateMachineConfig<S>;

  /**
   * Create a new store with the given FSM configuration.
   * All machines created from this store will use this configuration.
   *
   * @param config - State machine configuration shared by all instances
   */
  constructor(config: StateMachineConfig<S>) {
    this._machines = new Map();
    this._config = config;
  }

  /**
   * Create a new machine with the given ID.
   *
   * @param id - Unique identifier for the machine
   * @returns The newly created StateMachine
   * @throws {Error} If a machine with this ID already exists
   */
  create(id: string): StateMachine<S> {
    if (this._machines.has(id)) {
      throw new Error(`State machine with id '${id}' already exists`);
    }
    const machine = new StateMachine<S>(this._config);
    this._machines.set(id, machine);
    return machine;
  }

  /**
   * Get a machine by ID.
   *
   * @param id - Machine identifier
   * @returns The StateMachine, or `undefined` if not found
   */
  get(id: string): StateMachine<S> | undefined {
    return this._machines.get(id);
  }

  /**
   * Get a machine by ID, throwing if not found.
   *
   * @param id - Machine identifier
   * @returns The StateMachine
   * @throws {Error} If no machine with this ID exists
   */
  getOrThrow(id: string): StateMachine<S> {
    const machine = this._machines.get(id);
    if (!machine) {
      throw new Error(`State machine with id '${id}' not found`);
    }
    return machine;
  }

  /**
   * Check if a machine with the given ID exists.
   *
   * @param id - Machine identifier
   * @returns `true` if the machine exists
   */
  has(id: string): boolean {
    return this._machines.has(id);
  }

  /**
   * Delete a machine by ID.
   *
   * @param id - Machine identifier
   * @returns `true` if the machine was deleted, `false` if not found
   */
  delete(id: string): boolean {
    return this._machines.delete(id);
  }

  /**
   * Iterate over all machines in the store.
   *
   * @returns Iterator of [id, machine] pairs
   */
  entries(): IterableIterator<[string, StateMachine<S>]> {
    return this._machines.entries();
  }

  /**
   * Get the number of machines in the store.
   */
  get size(): number {
    return this._machines.size;
  }

  /**
   * Create a snapshot of a specific machine.
   *
   * @param id - Machine identifier
   * @returns Snapshot, or `undefined` if machine not found
   */
  snapshot(id: string): StateMachineSnapshot<S> | undefined {
    const machine = this._machines.get(id);
    if (!machine) {
      return undefined;
    }
    return machine.snapshot();
  }

  /**
   * Restore a machine from a snapshot.
   * If a machine with this ID already exists, it is replaced.
   *
   * @param id - Machine identifier
   * @param snap - Snapshot to restore from
   * @returns The restored StateMachine
   */
  restore(id: string, snap: StateMachineSnapshot<S>): StateMachine<S> {
    const machine = new StateMachine<S>(this._config);
    machine.restore(snap);
    this._machines.set(id, machine);
    return machine;
  }

  /**
   * Clear all machines from the store.
   */
  clear(): void {
    this._machines.clear();
  }
}
