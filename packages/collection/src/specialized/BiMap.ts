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

  override update(key: K, updater: (value: V | undefined) => V): this {
    const nextValue = updater(this.data.get(key));
    return this.set(key, nextValue);
  }

  override deleteMany(keys: Iterable<K>): this {
    for (const key of keys) {
      this.delete(key);
    }
    return this;
  }

  override mergeInPlace(...others: MutableCollection<K, V>[]): this {
    for (const other of others) {
      for (const [key, value] of other.entries()) {
        this.set(key, value);
      }
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
    // Remove any existing mappings for this key in forward map
    if (this.data.has(key)) {
      // Get the old value and remove it from inverse map
      // Use Map.prototype.get to get the actual value (including undefined)
      const oldValue = this.data.get(key);
      // Delete from inverse - works even if oldValue is undefined
      this.inverse.delete(oldValue as V);
    }

    const hasExistingKey = this.inverse.has(value);
    const existingKey = hasExistingKey ? this.inverse.get(value) : undefined;

    if (hasExistingKey && !Object.is(existingKey, key)) {
      this.data.delete(existingKey as K);
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
    if (!this.data.has(key)) {
      return false;
    }
    const value = this.data.get(key);
    this.data.delete(key);
    this.inverse.delete(value as V);
    return true;
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
   * Gets the key associated with the specified value (reverse lookup).
   *
   * @param value - The value to look up
   * @returns The key associated with the value, or undefined if not found
   * @complexity O(1)
   *
   * @example
   * ```typescript
   * const bimap = new BiMap([['one', 1], ['two', 2]]);
   * bimap.getKey(1);  // 'one'
   * bimap.getKey(3);  // undefined
   * ```
   */
  getKey(value: V): K | undefined {
    return this.inverse.get(value);
  }

  /**
   * Checks if a value exists in the BiMap.
   *
   * @param value - The value to check
   * @returns true if the value exists, false otherwise
   * @complexity O(1)
   *
   * @example
   * ```typescript
   * const bimap = new BiMap([['one', 1], ['two', 2]]);
   * bimap.hasValue(1);  // true
   * bimap.hasValue(3);  // false
   * ```
   */
  hasValue(value: V): boolean {
    return this.inverse.has(value);
  }

  /**
   * Creates a new BiMap with keys and values swapped.
   *
   * @returns A new BiMap where original values become keys and original keys become values
   * @complexity O(n)
   *
   * @example
   * ```typescript
   * const bimap = new BiMap([['one', 1], ['two', 2]]);
   * const inverted = bimap.invert();
   * inverted.get(1);    // 'one'
   * inverted.getKey('one');  // 1
   * ```
   */
  invert(): BiMap<V, K> {
    const inverted = new BiMap<V, K>();
    for (const [key, value] of this.data) {
      inverted.set(value, key);
    }
    return inverted;
  }

  /**
   * Returns a Set of all unique values in the BiMap.
   *
   * @returns A Set containing all values (guaranteed unique by BiMap invariant)
   * @complexity O(n)
   *
   * @example
   * ```typescript
   * const bimap = new BiMap([['one', 1], ['two', 2]]);
   * const values = bimap.uniqueValues();  // Set {1, 2}
   * ```
   */
  uniqueValues(): Set<V> {
    return new Set(this.inverse.keys());
  }

  /**
   * Verifies that the BiMap internal state is consistent.
   * Checks that forward and inverse maps have the same size and matching entries.
   *
   * @returns true if the BiMap is internally consistent, false otherwise
   * @complexity O(n)
   *
   * @example
   * ```typescript
   * const bimap = new BiMap([['one', 1]]);
   * console.log(bimap.isConsistent());  // true
   * ```
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
