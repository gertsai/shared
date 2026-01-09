/**
 * Core types for the Flux library
 * @packageDocumentation
 */

import type { FluxilisCollectionOptions } from './collection/FluxilisCollection';

/**
 * Type for keys in a collection
 */
export type FluxilisKey = string | number;

/**
 * Map of collection events and their arguments (as function types)
 */
export type CollectionEventMap<K, V> = {
  add: (key: K, value: V) => void;
  update: (key: K, value: V) => void;
  delete: (key: K, value: V) => void;
  clear: () => void;
};

/**
 * Type for collection event names
 */
export type CollectionEventName = keyof CollectionEventMap<unknown, unknown>;

/**
 * Options for creating a data stream
 */
export interface DataStreamOptions {
  /**
   * High water mark for backpressure control
   */
  highWaterMark?: number;

  /**
   * Error handling mode
   */
  errorMode?: 'throw' | 'emit' | 'ignore';

  /**
   * Automatic stream termination
   */
  autoEnd?: boolean;
}

/**
 * Interface for data stream
 */
export interface IDataStream<T> {
  /**
   * Writes data to the stream
   * @param chunk Data to write
   */
  write(chunk: T): boolean;

  /**
   * Connects a transformer to the stream
   * @param transform Transformation function
   */
  pipe<R>(transform: (chunk: T) => R | Promise<R>): IDataStream<R>;

  /**
   * Ends the stream
   */
  end(): void;

  /**
   * Subscribes to stream events
   * @param event Event name
   * @param listener Event handler
   */
  on(
    event: 'data' | 'end' | 'error' | 'drain' | 'pause' | 'resume' | 'close',
    listener: (...args: unknown[]) => void,
  ): this;

  /**
   * Unsubscribes from stream events
   * @param event Event name
   * @param listener Event handler
   */
  off(
    event: 'data' | 'end' | 'error' | 'drain' | 'pause' | 'resume' | 'close',
    listener?: (...args: unknown[]) => void,
  ): this;
}

/**
 * Interface for event emitter
 */
export interface IFluxilisEventEmitter {
  /**
   * Subscribes to an event
   * @param event Event name
   * @param listener Event handler
   */
  on(event: string | symbol, listener: (...args: unknown[]) => void): this;

  /**
   * Subscribes to an event with single invocation
   * @param event Event name
   * @param listener Event handler
   */
  once(event: string | symbol, listener: (...args: unknown[]) => void): this;

  /**
   * Unsubscribes from an event
   * @param event Event name
   * @param listener Event handler
   */
  off(event: string | symbol, listener?: (...args: unknown[]) => void): this;

  /**
   * Emits an event
   * @param event Event name
   * @param args Arguments for handlers
   */
  emit(event: string | symbol, ...args: unknown[]): boolean;

  /**
   * Gets listener count for an event
   * @param event Event name
   */
  listenerCount(event: string | symbol): number;

  /**
   * Gets all listeners for an event
   * @param event Event name
   */
  listeners(event: string | symbol): ((...args: unknown[]) => void)[];

  /**
   * Removes all listeners
   * @param event Event name (optional)
   */
  removeAllListeners(event?: string | symbol): this;
}

/**
 * Main collection interface for Fluxilis
 */
export interface IFluxilisCollection<K extends FluxilisKey, V> extends Iterable<[K, V]> {
  /**
   * Number of elements in the collection
   */
  readonly size: number;

  /**
   * Clears the collection
   */
  clear(): void;

  /**
   * Deletes an element from the collection
   * @param key Key of the element to delete
   * @returns `true` if the element was deleted, otherwise `false`
   */
  delete(key: K): boolean;

  /**
   * Deletes multiple elements from the collection
   * @param keys Iterable object with keys to delete
   * @returns Number of deleted elements
   */
  delete(keys: Iterable<K>): number;

  /**
   * Deletes multiple elements by keys from a Set
   * @param keys Set of keys to delete
   * @returns Number of deleted elements
   */
  delete(keys: ReadonlySet<K>): number;

  /**
   * Executes a function for each element in the collection
   * @param callbackfn Function to execute
   * @param thisArg Execution context for the function
   */
  forEach(callbackfn: (value: V, key: K, map: Map<K, V>) => void, thisArg?: unknown): void;

  /**
   * Checks for presence of an element in the collection
   * @param key Element key
   */
  has(key: K): boolean;

  /**
   * Returns an element from the collection
   * @param key Element key
   */
  get(key: K): V | undefined;

  /**
   * Adds or updates an element in the collection
   * @param key Element key
   * @param value Element value
   */
  set(key: K, value: V): this;

  /**
   * Adds multiple elements to the collection
   * @param entries Array of [key, value] pairs or another collection
   */
  setMany(entries: ReadonlyArray<readonly [K, V]> | IFluxilisCollection<K, V>): this;

  /**
   * Gets multiple elements from the collection by their keys
   * @param keys Iterable object with keys to get
   * @returns Array of values (undefined for missing keys)
   */
  getMany(keys: Iterable<K>): (V | undefined)[];

  /**
   * Gets multiple elements by keys from a Set
   * @param keys Set of keys to get
   * @returns Array of values (or undefined if key not found)
   */
  getMany(keys: ReadonlySet<K>): (V | undefined)[];

  /**
   * Returns an iterator for collection keys
   */
  keys(): IterableIterator<K>;

  /**
   * Returns an iterator for collection values
   */
  values(): IterableIterator<V>;

  /**
   * Returns an iterator for [key, value] pairs
   */
  entries(): IterableIterator<[K, V]>;

  /**
   * Returns an iterator for the collection
   */
  [Symbol.iterator](): IterableIterator<[K, V]>;

  /**
   * Subscribes to collection events
   * @template E Event name
   * @param event Event name
   * @param listener Event handler
   */
  on<E extends keyof CollectionEventMap<K, V>>(
    event: E,
    listener: CollectionEventMap<K, V>[E],
  ): this;

  /**
   * Unsubscribes from collection events
   * @template E Event name
   * @param event Event name
   * @param listener Event handler (optional, removes all if not specified)
   */
  off<E extends keyof CollectionEventMap<K, V>>(
    event: E,
    listener?: CollectionEventMap<K, V>[E],
  ): this;

  /**
   * Subscribes to a collection event with single invocation
   * @template E Event name
   * @param event Event name
   * @param listener Event handler
   * @returns Current collection (this) for chaining
   */
  once<E extends keyof CollectionEventMap<K, V>>(
    event: E,
    listener: CollectionEventMap<K, V>[E],
  ): this;

  /**
   * Emits a collection event (mainly for internal use)
   * @template E Event name
   * @param event Event name
   * @param args Arguments for event handlers
   * @returns `true` if event had listeners, otherwise `false`
   */
  emit<E extends keyof CollectionEventMap<K, V>>(
    event: E,
    ...args: Parameters<CollectionEventMap<K, V>[E]>
  ): boolean;

  /**
   * Filters collection elements using a predicate
   * @param predicate Filter function returning boolean
   * @param thisArg Value used as `this` when calling `predicate`
   * @returns New collection with filtered elements
   */
  filter(predicate: (value: V, key: K) => boolean, thisArg?: unknown): IFluxilisCollection<K, V>;

  /**
   * Filters collection elements using a type guard
   * Allows narrowing value types in the resulting collection
   * @template S Subtype of V to narrow values to
   * @param predicate Type guard function returning `value is S`
   * @param thisArg Value used as `this` when calling `predicate`
   * @returns New collection with filtered elements of type S
   */
  filter<S extends V>(
    predicate: (value: V, key: K) => value is S,
    thisArg?: unknown,
  ): IFluxilisCollection<K, S>;

  /**
   * Transforms collection elements
   * @param callback Transformation function
   * @param thisArg Value used as `this` when calling `callback`
   */
  map<T>(callback: (value: V, key: K) => T, thisArg?: unknown): IFluxilisCollection<K, T>;

  /**
   * Reduces collection elements
   * @param callback Reduce function
   * @param initialValue Initial value
   * @param thisArg Value used as `this` when calling `callback`
   */
  reduce<T>(
    callback: (accumulator: T, value: V, key: K) => T,
    initialValue: T,
    thisArg?: unknown,
  ): T;

  /**
   * Converts collection to array of values
   */
  toArray(): V[];

  /**
   * Converts collection to object
   */
  toObject(): Record<string, V>;

  /**
   * Returns the first element or array of first elements
   * @param amount Number of elements to return (default 1)
   */
  first(): V | undefined;
  first(amount: number): V[];

  /**
   * Returns the first key or array of first keys
   * @param amount Number of keys to return (default 1)
   */
  firstKey(): K | undefined;
  firstKey(amount: number): K[];

  /**
   * Returns the last element or array of last elements
   * @param amount Number of elements to return (default 1)
   */
  last(): V | undefined;
  last(amount: number): V[];

  /**
   * Returns the last key or array of last keys
   * @param amount Number of keys to return (default 1)
   */
  lastKey(): K | undefined;
  lastKey(amount: number): K[];

  /**
   * Returns a random element or array of random elements
   * @param amount Number of elements to return (default 1)
   */
  random(): V | undefined;
  random(amount: number): V[];

  /**
   * Returns a random key or array of random keys
   * @param amount Number of keys to return (default 1)
   */
  randomKey(): K | undefined;
  randomKey(amount: number): K[];

  /**
   * Merges the current collection with another
   * Elements from `other` will overwrite elements with the same keys
   * @param other Another collection to merge
   */
  merge(other: IFluxilisCollection<K, V>): this;

  /**
   * Returns a new collection containing elements whose keys are present
   * in the current collection but absent in `other`
   * @param other Collection to compare
   */
  difference(other: IFluxilisCollection<K, unknown>): IFluxilisCollection<K, V>;

  /**
   * Returns a new collection containing elements whose keys are present
   * in both collections (current and `other`)
   * Values are taken from the current collection
   * @param other Collection to compare
   */
  intersection(other: IFluxilisCollection<K, unknown>): IFluxilisCollection<K, V>;

  /**
   * Returns a new collection containing elements whose keys are present
   * only in one of the collections (current or `other`), but not in both
   * @param other Collection to compare
   */
  symmetricDifference<OtherValue>(
    other: IFluxilisCollection<K, OtherValue>,
  ): IFluxilisCollection<K, V | OtherValue>;

  /**
   * Returns a new collection containing all elements from both collections
   * If a key is present in both collections, the value from `other` is used
   * @param other Collection to unite
   */
  union<OtherValue>(
    other: IFluxilisCollection<K, OtherValue>,
  ): IFluxilisCollection<K, V | OtherValue>;

  /**
   * Sets a value with automatic removal after ttlMs milliseconds
   * @param key Element key
   * @param value Element value
   * @param ttlMs Time to live in milliseconds
   */
  setWithTTL(key: K, value: V, ttlMs: number): this;

  /**
   * Gets value by key. If value is absent,
   * creates it using defaultValueGenerator, adds to collection and returns
   * @param key Element key
   * @param defaultValueGenerator Function to generate default value
   * @returns Existing or new value
   */
  ensure(key: K, defaultValueGenerator: (key: K, collection: this) => V): V;

  /**
   * Groups collection elements by the result of function fn
   * @param fn Function returning group key for each element
   * @returns Map where keys are groups and values are collections of elements in that group
   */
  groupBy<GroupKey>(fn: (value: V, key: K) => GroupKey): Map<GroupKey, IFluxilisCollection<K, V>>;

  /**
   * Gets value by numeric index
   * Supports negative indices (counting from the end)
   * @param index Element index (can be negative)
   * @returns Element value or undefined if index is out of range
   */
  at(index: number): V | undefined;

  /**
   * Gets key by numeric index
   * Supports negative indices (counting from the end)
   * @param index Key index (can be negative)
   * @returns Element key or undefined if index is out of range
   */
  keyAt(index: number): K | undefined;

  /**
   * Splits the collection into two new collections based on a predicate
   * @param predicate Predicate function returning true for elements
   *                  that should go into the first (satisfying) collection
   * @param thisArg Value used as `this` when calling `predicate`
   * @returns Array of two collections: [satisfying, not satisfying]
   */
  partition(
    predicate: (value: V, key: K) => boolean,
    thisArg?: unknown,
  ): [IFluxilisCollection<K, V>, IFluxilisCollection<K, V>];

  /**
   * Executes a function for each element and returns the collection itself
   * @param fn Function to execute for each element
   * @param thisArg Value used as `this` when calling `fn`
   * @returns Current collection for chaining
   */
  each(fn: (value: V, key: K) => void, thisArg?: unknown): this;

  /**
   * Checks if the collection contains all specified keys
   * @param keys Keys to check
   * @returns True if all keys are present, otherwise false
   */
  hasAll(...keys: K[]): boolean;

  /**
   * Checks if the collection contains at least one of the specified keys
   * @param keys Keys to check
   * @returns True if at least one key is present, otherwise false
   */
  hasAny(...keys: K[]): boolean;

  /**
   * Removes elements from the collection for which the predicate returns true
   * @param predicate Predicate function accepting value and key
   * @param thisArg Value used as `this` when calling `predicate`
   * @returns Number of deleted elements
   */
  sweep(predicate: (value: V, key: K) => boolean, thisArg?: unknown): number;

  /**
   * Checks equality with another collection
   */
  equals(other: IFluxilisCollection<K, V>): boolean;

  /**
   * Finds the first element satisfying the condition
   * @param predicate Condition function
   * @param thisArg Value used as `this` when calling `predicate`
   * @returns Found value or undefined
   */
  find(predicate: (value: V, key: K) => boolean, thisArg?: unknown): V | undefined;

  /**
   * Finds the key of the first element satisfying the condition
   * @param predicate Condition function
   * @param thisArg Value used as `this` when calling `predicate`
   * @returns Found key or undefined
   */
  findKey(predicate: (value: V, key: K) => boolean, thisArg?: unknown): K | undefined;

  /**
   * Checks if all elements satisfy the condition
   * @param predicate Condition function
   * @param thisArg Value used as `this` when calling `predicate`
   * @returns True if all elements satisfy the condition, otherwise false
   */
  every(predicate: (value: V, key: K) => boolean, thisArg?: unknown): boolean;

  /**
   * Checks if at least one element satisfies the condition
   * @param predicate Condition function
   * @param thisArg Value used as `this` when calling `predicate`
   * @returns True if at least one element satisfies the condition, otherwise false
   */
  some(predicate: (value: V, key: K) => boolean, thisArg?: unknown): boolean;
}

// --- Adapter Interfaces ---

/**
 * Defines the contract for a collection data storage backend.
 * Methods may return Promise to support asynchronous stores.
 * Iterators may be synchronous or asynchronous.
 */
export interface ICollectionBackend<K extends FluxilisKey, V> {
  get(key: K): V | undefined | Promise<V | undefined>;
  set(key: K, value: V): void | Promise<void>;
  delete(key: K): boolean | Promise<boolean>;
  has(key: K): boolean | Promise<boolean>;
  clear(): void | Promise<void>;
  size(): number | Promise<number>;
  keys(): IterableIterator<K> | AsyncIterableIterator<K>;
  values(): IterableIterator<V> | AsyncIterableIterator<V>;
  entries(): IterableIterator<[K, V]> | AsyncIterableIterator<[K, V]>;
}

/**
 * Defines the contract for serialization and deserialization of data.
 */
export interface ISerializer<T> {
  serialize(data: T): string | Uint8Array | Promise<string | Uint8Array>;
  deserialize(data: string | Uint8Array): T | Promise<T>;
}

/**
 * Generic listener function type for event emitters.
 * Uses bivariant function parameters for flexibility with typed event maps.
 */
export type FluxEventHandler<Args extends unknown[] = unknown[]> = {
  bivarianceHack(...args: Args): void;
}['bivarianceHack'];

/**
 * Generic interface for event emitter
 * @template EventMap Event map where key is event name, value is listener function type
 */
export interface IEventEmitter<EventMap extends Record<PropertyKey, FluxEventHandler>> {
  on<E extends keyof EventMap>(
    event: E,
    listener: EventMap[E],
    options?: { priority?: number; once?: boolean },
  ): this;
  off<E extends keyof EventMap>(event: E, listener?: EventMap[E]): this;
  once<E extends keyof EventMap>(event: E, listener: EventMap[E], priority?: number): this;
  emit<E extends keyof EventMap>(event: E, ...args: Parameters<EventMap[E]>): boolean;
  emitAsync?<E extends keyof EventMap>(
    event: E,
    ...args: Parameters<EventMap[E]>
  ): Promise<boolean>;
  waitForEvent?<E extends keyof EventMap>(
    event: E,
    timeout?: number,
  ): Promise<Parameters<EventMap[E]>>;
  listenerCount?<E extends keyof EventMap>(event: E): number;
  removeAllListeners?<E extends keyof EventMap>(event?: E): this;
}

/**
 * Defines the contract for a data stream adapter.
 * Currently provides an async iterator for reading from a collection.
 */
export interface IStreamAdapter<K extends FluxilisKey, V> {
  /**
   * Returns an async iterator for [key, value] pairs from the associated backend.
   * The adapter must be able to work with sync or async backend iterators.
   * @param backend Data storage backend
   * @param options Collection options (e.g., for cloneValues)
   */
  readableEntries(
    backend: ICollectionBackend<K, V>,
    options: FluxilisCollectionOptions,
  ): AsyncIterableIterator<[K, V]>;
}
