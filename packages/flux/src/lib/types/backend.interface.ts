import type { FluxilisCollection } from '../../collection/FluxilisCollection';
import type { FluxilisKey } from '../../types';

/**
 * Interface for backend adapters used in FluxilisCollection.
 * Defines standard methods for interacting with data storage.
 * Methods return Promise as backend may be async (e.g., database).
 *
 * @template K - Key type that must be compatible with FluxilisKey.
 * @template V - Value type.
 */
export interface IBackend<K extends FluxilisKey = FluxilisKey, V = unknown> {
  /**
   * Base collection that this backend is attached to.
   * This property is set by FluxilisCollection during backend initialization.
   */
  collection: FluxilisCollection<K, V>;

  /**
   * Gets value by key.
   * @param key - Key to look up.
   * @returns Promise resolving to value or undefined if key not found.
   */
  get(key: K): Promise<V | undefined>;

  /**
   * Sets value by key.
   * @param key - Key.
   * @param value - Value.
   * @returns Promise resolving to the backend itself for call chaining.
   */
  set(key: K, value: V): Promise<this>;

  /**
   * Deletes value by key.
   * @param key - Key to delete.
   * @returns Promise resolving to boolean: true if item was deleted, false otherwise.
   */
  delete(key: K): Promise<boolean>;

  /**
   * Checks for key presence.
   * @param key - Key to check.
   * @returns Promise resolving to boolean: true if key exists, false otherwise.
   */
  has(key: K): Promise<boolean>;

  /**
   * Clears all records in backend.
   * @returns Promise resolving when clear is complete.
   */
  clear(): Promise<void>;

  /**
   * Returns async iterator for values.
   * @returns Async iterator of values.
   */
  values(): AsyncIterableIterator<V>;

  /**
   * Returns async iterator for keys.
   * @returns Async iterator of keys.
   */
  keys(): AsyncIterableIterator<K>;

  /**
   * Returns async iterator for [key, value] pairs.
   * @returns Async iterator of [key, value] pairs.
   */
  entries(): AsyncIterableIterator<[K, V]>;

  /**
   * Returns number of records in backend.
   * @returns Promise resolving to number of records.
   */
  size(): Promise<number>;

  /**
   * Initializes backend. This method is called by FluxilisCollection
   * after setting the `collection` property.
   * @param collection - FluxilisCollection instance.
   */
  init(collection: FluxilisCollection<K, V>): Promise<void>;
}
