/**
 * Core types for the Flux library
 * @packageDocumentation
 */

/**
 * Type for keys in a collection.
 * Restricted to string | number for compatibility with TTL timers and serialization.
 */
export type FluxilisKey = string | number;

/**
 * Map of collection events and their handler signatures.
 *
 * @template K - Key type
 * @template V - Value type
 */
export type CollectionEventMap<K, V> = {
  /** Emitted when a new key-value pair is added */
  add: (key: K, value: V) => void;
  /** Emitted when an existing key's value is updated */
  update: (key: K, value: V) => void;
  /** Emitted when a key-value pair is removed (value may be undefined if explicitly stored) */
  delete: (key: K, value: V | undefined) => void;
  /** Emitted when the collection is cleared */
  clear: () => void;
  /** Emitted when a TTL entry expires */
  expired: (key: K) => void;
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
   * High water mark for backpressure control.
   * When buffer reaches this size, write() returns false (backpressure).
   * @default 1000
   */
  highWaterMark?: number;

  /**
   * Maximum buffer size (hard limit).
   * If set, writes that would exceed this limit are rejected.
   * Must be >= highWaterMark if both are set.
   * @default Infinity (unbounded)
   */
  maxBufferSize?: number;

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
   */
  readableEntries(backend: ICollectionBackend<K, V>): AsyncIterableIterator<[K, V]>;
}
