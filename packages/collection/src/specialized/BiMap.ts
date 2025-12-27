/**
 * BiMap - Bidirectional Map
 * Maintains a one-to-one correspondence between keys and values
 * Both keys and values must be unique
 *
 * @module specialized/BiMap
 */

import { MutableCollection } from '../core/MutableCollection';

/**
 * Bidirectional map that allows lookup by both key and value
 * Ensures one-to-one mapping where both keys and values are unique
 *
 * @template K - The type of keys
 * @template V - The type of values
 *
 * @example
 * ```typescript
 * const bimap = new BiMap<string, number>();
 * bimap.set('one', 1);
 * bimap.set('two', 2);
 * bimap.set('three', 3);
 *
 * // Forward lookup
 * bimap.get('one'); // 1
 *
 * // Reverse lookup
 * bimap.getKey(1); // 'one'
 *
 * // Setting existing value to new key removes old mapping
 * bimap.set('uno', 1); // 'one' -> 1 is removed
 * bimap.getKey(1); // 'uno'
 * ```
 *
 * @class BiMap
 * @extends {MutableCollection<K, V>}
 */
export class BiMap<K, V> extends MutableCollection<K, V> {
  private inverse: Map<V, K> = new Map();

  constructor(entries?: Iterable<[K, V]>) {
    super();
    if (entries) {
      for (const [key, value] of entries) {
        this.set(key, value);
      }
    }
  }

  /**
   * Set many entries in one pass
   */
  override setMany(entries: Iterable<[K, V]>): this {
    for (const [k, v] of entries) {
      this.set(k, v);
    }
    return this;
  }

  /**
   * Replace existing mapping for value if any, then set new pair
   */
  upsert(key: K, value: V): this {
    return this.set(key, value);
  }

  /**
   * Set a key-value pair, ensuring bidirectional uniqueness
   * If key or value already exist, their previous mappings are removed
   *
   * @param key - The key to set
   * @param value - The value to associate with the key
   * @returns This collection for chaining
   * @complexity O(1)
   *
   * @example
   * ```typescript
   * bimap.set('a', 1); // a <-> 1
   * bimap.set('b', 1); // b <-> 1, 'a' is removed
   * ```
   */
  override set(key: K, value: V): this {
    // Remove any existing mappings
    const existingValue = this.data.get(key);
    const existingKey = this.inverse.get(value);

    if (existingValue !== undefined) {
      this.inverse.delete(existingValue);
    }

    if (existingKey !== undefined && !Object.is(existingKey, key)) {
      this.data.delete(existingKey);
    }

    // Set the new mapping
    this.data.set(key, value);
    this.inverse.set(value, key);

    return this;
  }

  /**
   * Delete a key and its corresponding value
   */
  override delete(key: K): boolean {
    const value = this.data.get(key);
    if (value !== undefined) {
      this.inverse.delete(value);
      return this.data.delete(key);
    }
    return false;
  }

  /**
   * Delete by value
   */
  deleteValue(value: V): boolean {
    const key = this.inverse.get(value);
    if (key !== undefined) {
      this.data.delete(key);
      return this.inverse.delete(value);
    }
    return false;
  }

  /**
   * Clear all mappings
   */
  override clear(): void {
    this.data.clear();
    this.inverse.clear();
  }

  /**
   * Get key by value
   */
  getKey(value: V): K | undefined {
    return this.inverse.get(value);
  }

  /**
   * Check if value exists
   */
  hasValue(value: V): boolean {
    return this.inverse.has(value);
  }

  /**
   * Get the inverse BiMap (values as keys, keys as values)
   */
  invert(): BiMap<V, K> {
    const inverted = new BiMap<V, K>();
    for (const [key, value] of this.data) {
      inverted.set(value, key);
    }
    return inverted;
  }

  /**
   * Get all values (guaranteed unique)
   */
  uniqueValues(): Set<V> {
    return new Set(this.inverse.keys());
  }

  /**
   * Ensure consistency between forward and inverse maps
   */
  isConsistent(): boolean {
    if (this.data.size !== this.inverse.size) {
      return false;
    }

    for (const [key, value] of this.data) {
      if (this.inverse.get(value) !== key) {
        return false;
      }
    }

    return true;
  }

  /**
   * Create a new BiMap with the same mappings
   */
  override clone(): BiMap<K, V> {
    return new BiMap(this.data);
  }

  /**
   * Get string representation
   */
  override toString(): string {
    return `BiMap(${this.size}) { ${[...this.data.entries()]
      .map(([k, v]) => `${String(k)} <=> ${String(v)}`)
      .join(', ')} }`;
  }
}
