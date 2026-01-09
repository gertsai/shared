/**
 * FluxilisCollection - Event-driven collection with TTL support.
 *
 * Extends MutableCollection from @gerts/collection with:
 * - Event emission on add/update/delete/clear
 * - TTL (time-to-live) support for automatic expiration
 * - Reactive data patterns
 *
 * @packageDocumentation
 */

import { MutableCollection } from '@gerts/collection';
import { FluxilisEventEmitter } from '../events/FluxilisEventEmitter';
import type { CollectionEventMap, FluxilisKey } from '../types';

/**
 * Collection event types that can be subscribed to.
 *
 * - `add` - Emitted when a new key-value pair is added
 * - `update` - Emitted when an existing key's value is updated
 * - `delete` - Emitted when a key-value pair is removed
 * - `clear` - Emitted when the collection is cleared
 * - `expired` - Emitted when a TTL entry expires
 */
export type CollectionEvent = 'add' | 'update' | 'delete' | 'clear' | 'expired';

/**
 * Configuration options for creating a FluxilisCollection.
 */
export interface FluxilisCollectionOptions {
  /**
   * Maximum number of event listeners per event type.
   * @default 10
   */
  maxListeners?: number;
}

/**
 * An extended MutableCollection with event emission and TTL support.
 *
 * FluxilisCollection provides a reactive data structure that emits events on changes,
 * supports automatic value expiration, and includes all MutableCollection methods.
 *
 * @typeParam K - The key type (must be string or number for TTL timer keys)
 * @typeParam V - The value type
 *
 * @example Basic usage with events
 * ```typescript
 * const users = new FluxilisCollection<string, User>();
 *
 * // Subscribe to changes
 * users.on('add', (key, user) => console.log(`Added: ${user.name}`));
 * users.on('delete', (key, user) => console.log(`Removed: ${user.name}`));
 *
 * // Add data - triggers 'add' event
 * users.set('user-1', { name: 'Alice', age: 30 });
 * ```
 *
 * @example TTL support for caching
 * ```typescript
 * const cache = new FluxilisCollection<string, CacheEntry>();
 *
 * // Auto-expire after 5 minutes
 * cache.setWithTTL('temp-data', value, 5 * 60 * 1000);
 *
 * // Listen for expirations
 * cache.on('expired', (key) => console.log(`${key} expired`));
 * ```
 *
 * @example All MutableCollection methods available
 * ```typescript
 * const collection = new FluxilisCollection<string, number>();
 * collection.set('a', 1).set('b', 2).set('c', 3);
 *
 * // Inherited from MutableCollection
 * const filtered = collection.filter((v) => v > 1);
 * const mapped = collection.mapValues((v) => v * 2);
 * const sorted = collection.sort((a, b) => b[1] - a[1]);
 * ```
 */
export class FluxilisCollection<K extends FluxilisKey, V> extends MutableCollection<K, V> {
  /** Event emitter for collection events */
  private _eventEmitter: FluxilisEventEmitter;

  /** TTL timers storage */
  private _ttlTimers = new Map<K, ReturnType<typeof setTimeout>>();

  /** Collection options */
  private _options: FluxilisCollectionOptions;

  /**
   * Creates a new FluxilisCollection instance.
   *
   * @param entries - Initial key-value pairs to populate the collection
   * @param options - Configuration options
   *
   * @example Empty collection
   * ```typescript
   * const collection = new FluxilisCollection<string, number>();
   * ```
   *
   * @example From array of tuples
   * ```typescript
   * const collection = new FluxilisCollection([
   *   ['a', 1],
   *   ['b', 2],
   * ]);
   * ```
   *
   * @example From another collection
   * ```typescript
   * const copy = new FluxilisCollection(existingCollection.entries());
   * ```
   */
  constructor(entries?: Iterable<[K, V]> | null, options: FluxilisCollectionOptions = {}) {
    super(entries ?? undefined);
    this._eventEmitter = new FluxilisEventEmitter();
    this._options = {
      maxListeners: 10,
      ...options,
    };

    if (this._options.maxListeners) {
      this._eventEmitter.setMaxListeners(this._options.maxListeners);
    }
  }

  // =========================================================================
  // Override write methods to emit events
  // =========================================================================

  /**
   * Adds or updates an element in the collection.
   * Emits 'add' event for new keys or 'update' event for existing keys.
   *
   * @param key - Element key
   * @param value - Element value
   * @returns This collection for chaining
   */
  override set(key: K, value: V): this {
    const exists = this.has(key);
    super.set(key, value);

    if (exists) {
      this._eventEmitter.emit('update', key, value);
    } else {
      this._eventEmitter.emit('add', key, value);
    }

    return this;
  }

  /**
   * Deletes an element from the collection.
   * Emits 'delete' event if the element existed (even if value was undefined).
   *
   * @param key - Key of element to delete
   * @returns `true` if element was found and deleted, `false` otherwise
   */
  override delete(key: K): boolean {
    const existed = this.has(key);
    // Get value BEFORE deletion to include in event (may be undefined)
    const value = existed ? this.get(key) : undefined;

    // Clear TTL timer if exists
    if (this._ttlTimers.has(key)) {
      clearTimeout(this._ttlTimers.get(key)!);
      this._ttlTimers.delete(key);
    }

    const deleted = super.delete(key);

    // Emit event based on existence, not value (undefined is a valid value)
    if (existed) {
      this._eventEmitter.emit('delete', key, value);
    }

    return deleted;
  }

  /**
   * Clears the collection.
   * Emits 'clear' event.
   */
  override clear(): void {
    // Clear all TTL timers
    for (const timer of this._ttlTimers.values()) {
      clearTimeout(timer);
    }
    this._ttlTimers.clear();

    super.clear();
    this._eventEmitter.emit('clear');
  }

  // =========================================================================
  // Event methods
  // =========================================================================

  /**
   * Subscribes to collection events.
   *
   * @param event - Event name ('add', 'update', 'delete', 'clear', 'expired')
   * @param listener - Event handler function
   * @returns This collection for chaining
   *
   * @example
   * ```typescript
   * collection
   *   .on('add', (key, value) => console.log('Added:', key, value))
   *   .on('delete', (key, value) => console.log('Deleted:', key, value));
   * ```
   */
  on<E extends keyof CollectionEventMap<K, V>>(
    event: E,
    listener: CollectionEventMap<K, V>[E],
  ): this {
    this._eventEmitter.on(event, listener as (...args: unknown[]) => void);
    return this;
  }

  /**
   * Unsubscribes from collection events.
   *
   * @param event - Event name
   * @param listener - Event handler function (optional, removes all if not specified)
   * @returns This collection for chaining
   */
  off<E extends keyof CollectionEventMap<K, V>>(
    event: E,
    listener?: CollectionEventMap<K, V>[E],
  ): this {
    this._eventEmitter.off(event, listener as (...args: unknown[]) => void);
    return this;
  }

  /**
   * Subscribes to a collection event for one-time execution.
   *
   * @param event - Event name
   * @param listener - Event handler function
   * @returns This collection for chaining
   */
  once<E extends keyof CollectionEventMap<K, V>>(
    event: E,
    listener: CollectionEventMap<K, V>[E],
  ): this {
    this._eventEmitter.once(event, listener as (...args: unknown[]) => void);
    return this;
  }

  /**
   * Emits a collection event.
   *
   * @param event - Event name
   * @param args - Arguments for event handlers
   * @returns `true` if event had listeners, `false` otherwise
   */
  emit<E extends keyof CollectionEventMap<K, V>>(
    event: E,
    ...args: Parameters<CollectionEventMap<K, V>[E]>
  ): boolean {
    return this._eventEmitter.emit(event, ...args);
  }

  /**
   * Returns the number of listeners for an event.
   *
   * @param event - Event name
   * @returns Number of listeners
   */
  listenerCount<E extends keyof CollectionEventMap<K, V>>(event: E): number {
    return this._eventEmitter.listenerCount(event);
  }

  /**
   * Removes all listeners for an event (or all events if not specified).
   *
   * @param event - Event name (optional)
   * @returns This collection for chaining
   */
  removeAllListeners<E extends keyof CollectionEventMap<K, V>>(event?: E): this {
    this._eventEmitter.removeAllListeners(event);
    return this;
  }

  // =========================================================================
  // TTL methods
  // =========================================================================

  /**
   * Sets a value with automatic removal after a specified time.
   *
   * The value will be automatically deleted from the collection when the TTL
   * expires, emitting a 'delete' event and an 'expired' event.
   *
   * @param key - The key to store the value under
   * @param value - The value to store
   * @param ttlMs - Time to live in milliseconds before automatic deletion
   * @returns This collection for chaining
   *
   * @example Session with 30-minute expiry
   * ```typescript
   * sessions.setWithTTL('session-123', userData, 30 * 60 * 1000);
   * ```
   *
   * @example Cache with different TTLs
   * ```typescript
   * cache.setWithTTL('hot-data', value, 60000);    // 1 minute
   * cache.setWithTTL('cold-data', value, 3600000); // 1 hour
   * ```
   *
   * @example Listen for expiration
   * ```typescript
   * cache.on('expired', (key) => {
   *   console.log(`${key} expired, refreshing...`);
   *   refreshData(key);
   * });
   * cache.setWithTTL('temp', data, 5000);
   * ```
   */
  setWithTTL(key: K, value: V, ttlMs: number): this {
    // Validate TTL
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
      throw new Error(`TTL must be a positive number, got: ${ttlMs}`);
    }

    // Clear existing timer for this key
    if (this._ttlTimers.has(key)) {
      clearTimeout(this._ttlTimers.get(key)!);
    }

    // Set the value (will emit 'add' or 'update')
    this.set(key, value);

    // Create expiration timer
    const timer = setTimeout(() => {
      // Only delete if this is still the same timer (race condition prevention)
      // Another setWithTTL call could have replaced the timer
      if (this._ttlTimers.get(key) !== timer) {
        return;
      }

      this._ttlTimers.delete(key);
      const expiredValue = this.get(key);
      if (this.has(key)) {
        super.delete(key); // Use super to avoid double event
        // Emit delete event (value may be undefined)
        this._eventEmitter.emit('delete', key, expiredValue);
        this._eventEmitter.emit('expired', key);
      }
    }, ttlMs);

    this._ttlTimers.set(key, timer);

    return this;
  }

  /**
   * Checks if a key has an active TTL timer.
   *
   * @param key - The key to check
   * @returns `true` if the key has a TTL, `false` otherwise
   */
  hasTTL(key: K): boolean {
    return this._ttlTimers.has(key);
  }

  /**
   * Clears the TTL timer for a key (value remains in collection).
   *
   * @param key - The key to clear TTL for
   * @returns `true` if TTL was cleared, `false` if no TTL existed
   */
  clearTTL(key: K): boolean {
    if (this._ttlTimers.has(key)) {
      clearTimeout(this._ttlTimers.get(key)!);
      this._ttlTimers.delete(key);
      return true;
    }
    return false;
  }

  /**
   * Returns the number of entries with active TTL timers.
   */
  get ttlCount(): number {
    return this._ttlTimers.size;
  }

  // =========================================================================
  // Additional utility methods (flux-specific)
  // =========================================================================

  /**
   * Adds an element only if it doesn't exist.
   * Emits 'add' event if added.
   *
   * @param key - Element key
   * @param value - Element value
   * @returns `true` if added, `false` if key already existed
   */
  setIfAbsent(key: K, value: V): boolean {
    if (!this.has(key)) {
      this.set(key, value);
      return true;
    }
    return false;
  }

  /**
   * Updates an element only if it exists.
   * Emits 'update' event if updated.
   *
   * @param key - Element key
   * @param value - New value
   * @returns `true` if updated, `false` if key didn't exist
   */
  updateIfPresent(key: K, value: V): boolean {
    if (this.has(key)) {
      this.set(key, value);
      return true;
    }
    return false;
  }

  /**
   * Deletes multiple elements by keys.
   * Emits 'delete' event for each deleted element.
   *
   * @param keys - Iterable of keys to delete
   * @returns This collection for chaining
   */
  override deleteMany(keys: Iterable<K>): this {
    for (const key of keys) {
      this.delete(key);
    }
    return this;
  }

  /**
   * Deletes multiple elements and returns the count.
   * Emits 'delete' event for each deleted element.
   *
   * @param keys - Iterable of keys to delete
   * @returns Number of elements deleted
   */
  deleteManyCount(keys: Iterable<K>): number {
    let count = 0;
    for (const key of keys) {
      if (this.delete(key)) {
        count++;
      }
    }
    return count;
  }

  /**
   * Returns a random value from the collection.
   *
   * @returns Random value or undefined if empty
   */
  random(): V | undefined;
  /**
   * Returns an array of random values.
   *
   * Uses Fisher-Yates shuffle for O(k) performance where k is the amount requested.
   *
   * @param amount - Number of values to return
   * @returns Array of random values
   */
  random(amount: number): V[];
  random(amount?: number): V | V[] | undefined {
    const values = [...this.values()];
    if (values.length === 0) {
      return amount === undefined ? undefined : [];
    }
    if (amount === undefined) {
      return values[Math.floor(Math.random() * values.length)];
    }
    if (amount <= 0) {
      return [];
    }
    const count = Math.min(values.length, amount);

    // Fisher-Yates shuffle (partial, only shuffle first `count` elements)
    // O(count) instead of O(n log n) with sort
    for (let i = 0; i < count; i++) {
      const j = i + Math.floor(Math.random() * (values.length - i));
      [values[i], values[j]] = [values[j], values[i]];
    }

    return values.slice(0, count);
  }

  /**
   * Returns a random key from the collection.
   *
   * @returns Random key or undefined if empty
   */
  randomKey(): K | undefined;
  /**
   * Returns an array of random keys.
   *
   * Uses Fisher-Yates shuffle for O(k) performance where k is the amount requested.
   *
   * @param amount - Number of keys to return
   * @returns Array of random keys
   */
  randomKey(amount: number): K[];
  randomKey(amount?: number): K | K[] | undefined {
    const keys = [...this.keys()];
    if (keys.length === 0) {
      return amount === undefined ? undefined : [];
    }
    if (amount === undefined) {
      return keys[Math.floor(Math.random() * keys.length)];
    }
    if (amount <= 0) {
      return [];
    }
    const count = Math.min(keys.length, amount);

    // Fisher-Yates shuffle (partial, only shuffle first `count` elements)
    // O(count) instead of O(n log n) with sort
    for (let i = 0; i < count; i++) {
      const j = i + Math.floor(Math.random() * (keys.length - i));
      [keys[i], keys[j]] = [keys[j], keys[i]];
    }

    return keys.slice(0, count);
  }

  /**
   * Gets a value by numeric index.
   * Supports negative indices (counting from the end).
   *
   * @param index - Element index (can be negative)
   * @returns Element value or undefined if out of range
   */
  at(index: number): V | undefined {
    const values = [...this.values()];
    const normalizedIndex = index < 0 ? values.length + index : index;
    return values[normalizedIndex];
  }

  /**
   * Gets a key by numeric index.
   * Supports negative indices (counting from the end).
   *
   * @param index - Key index (can be negative)
   * @returns Element key or undefined if out of range
   */
  keyAt(index: number): K | undefined {
    const keys = [...this.keys()];
    const normalizedIndex = index < 0 ? keys.length + index : index;
    return keys[normalizedIndex];
  }

  /**
   * Checks if the collection contains all specified keys.
   *
   * @param keys - Keys to check
   * @returns `true` if all keys are present
   */
  hasAll(...keys: K[]): boolean {
    return keys.every((key) => this.has(key));
  }

  /**
   * Checks if the collection contains at least one of the specified keys.
   *
   * @param keys - Keys to check
   * @returns `true` if at least one key is present
   */
  hasAny(...keys: K[]): boolean {
    return keys.some((key) => this.has(key));
  }

  /**
   * Merges entries from other collections into this collection.
   * Modifies this collection in place (unlike MutableCollection.merge which returns a new collection).
   * Emits 'add' or 'update' events for each entry.
   *
   * @param others - Collections to merge from
   * @returns This collection for chaining
   */
  merge(...others: Iterable<[K, V]>[]): this {
    for (const other of others) {
      for (const [key, value] of other) {
        this.set(key, value);
      }
    }
    return this;
  }

  /**
   * Partitions the collection into two based on a predicate.
   *
   * @param predicate - Function to test each element
   * @returns Tuple of [matching, non-matching] collections
   */
  partition(
    predicate: (value: V, key: K, index: number) => boolean,
  ): [FluxilisCollection<K, V>, FluxilisCollection<K, V>] {
    const passed = new FluxilisCollection<K, V>(undefined, this._options);
    const failed = new FluxilisCollection<K, V>(undefined, this._options);

    let index = 0;
    for (const [key, value] of this.entries()) {
      if (predicate(value, key, index)) {
        passed.set(key, value);
      } else {
        failed.set(key, value);
      }
      index++;
    }

    return [passed, failed];
  }

  /**
   * Returns an array of all keys.
   */
  keysArray(): K[] {
    return [...this.keys()];
  }

  /**
   * Returns an array of all entries as [key, value] pairs.
   */
  entriesArray(): [K, V][] {
    return [...this.entries()];
  }

  /**
   * Gets multiple values by their keys.
   *
   * @param keys - Iterable of keys to get
   * @returns Array of values (undefined for missing keys)
   */
  getMany(keys: Iterable<K>): (V | undefined)[] {
    const result: (V | undefined)[] = [];
    for (const key of keys) {
      result.push(this.get(key));
    }
    return result;
  }

  /**
   * Executes a function for each element and returns this for chaining.
   * Alias for forEach with chainable return.
   *
   * @param fn - Function to execute for each element
   * @param thisArg - Value to use as `this`
   * @returns This collection for chaining
   */
  each(fn: (value: V, key: K, collection: this) => void, thisArg?: unknown): this {
    this.forEach((value, key) => {
      fn.call(thisArg, value, key, this);
    });
    return this;
  }

  /**
   * Returns string representation of the collection.
   */
  override toString(): string {
    return `FluxilisCollection(${this.size})`;
  }

  /**
   * Creates a copy of the collection (without event listeners or TTL timers).
   */
  override clone(): FluxilisCollection<K, V> {
    return new FluxilisCollection(this.entries(), this._options);
  }
}
