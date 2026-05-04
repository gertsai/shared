import type { IBackend } from '../../types/backend.interface';
import type { FluxilisCollection } from '../../../collection/FluxilisCollection';
import type { FluxilisKey } from '../../../types';

/**
 * Implementation of backend interface using standard JavaScript `Map`
 * for in-memory data storage.
 *
 * This is the simplest synchronous backend, suitable for testing or scenarios
 * where data persistence is not required.
 *
 * @template K - Key type.
 * @template V - Value type.
 */
export class MapBackend<K extends FluxilisKey = FluxilisKey, V = unknown> implements IBackend<
  K,
  V
> {
  /**
   * Internal Map-based storage.
   */
  protected readonly storage: Map<K, V> = new Map<K, V>();

  /**
   * Reference to collection using this backend.
   * Set by init method.
   */
  public collection!: FluxilisCollection<K, V>;

  /**
   * Initializes backend, saving collection reference.
   * @param collection - FluxilisCollection instance.
   */
  public async init(collection: FluxilisCollection<K, V>): Promise<void> {
    this.collection = collection;
    // MapBackend doesn't need additional async initialization
    return Promise.resolve();
  }

  /**
   * Gets value by key.
   * @param key - Key to look up.
   * @returns Promise resolving to value or undefined if key not found.
   */
  public async get(key: K): Promise<V | undefined> {
    return Promise.resolve(this.storage.get(key));
  }

  /**
   * Sets value by key.
   * @param key - Key.
   * @param value - Value.
   * @returns Promise resolving to the backend itself.
   */
  public async set(key: K, value: V): Promise<this> {
    this.storage.set(key, value);
    return Promise.resolve(this);
  }

  /**
   * Deletes value by key.
   * @param key - Key to delete.
   * @returns Promise resolving to boolean: true if item was deleted.
   */
  public async delete(key: K): Promise<boolean> {
    return Promise.resolve(this.storage.delete(key));
  }

  /**
   * Checks for key presence.
   * @param key - Key to check.
   * @returns Promise resolving to boolean: true if key exists.
   */
  public async has(key: K): Promise<boolean> {
    return Promise.resolve(this.storage.has(key));
  }

  /**
   * Clears all records in backend.
   * @returns Promise resolving when clear is complete.
   */
  public async clear(): Promise<void> {
    this.storage.clear();
    return Promise.resolve();
  }

  /**
   * Returns async iterator for values.
   * @returns Async iterator of values.
   */
  public async *values(): AsyncIterableIterator<V> {
    for (const value of this.storage.values()) {
      yield value;
    }
  }

  /**
   * Returns async iterator for keys.
   * @returns Async iterator of keys.
   */
  public async *keys(): AsyncIterableIterator<K> {
    for (const key of this.storage.keys()) {
      yield key;
    }
  }

  /**
   * Returns async iterator for [key, value] pairs.
   * @returns Async iterator of [key, value] pairs.
   */
  public async *entries(): AsyncIterableIterator<[K, V]> {
    for (const entry of this.storage.entries()) {
      yield entry;
    }
  }

  /**
   * Returns number of records in backend.
   * @returns Promise resolving to number of records.
   */
  public async size(): Promise<number> {
    return Promise.resolve(this.storage.size);
  }
}
