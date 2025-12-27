/**
 * MultiMap - Map that can store multiple values per key
 * Each key maps to a collection of values
 */

import { MutableCollection } from '../core/MutableCollection';

/**
 * Options for MultiMap configuration
 */
export interface MultiMapOptions {
  /** Whether to allow duplicate values for the same key */
  allowDuplicates?: boolean;
  /** Factory for creating value collections */
  collectionFactory?: () => Set<any> | Array<any>;
}

/**
 * Map that allows multiple values per key
 */
export class MultiMap<K, V> extends MutableCollection<K, Set<V> | V[]> {
  private readonly allowDuplicates: boolean;
  private readonly collectionFactory: () => Set<V> | V[];
  private _totalValues: number = 0;

  constructor(
    entries?: Iterable<[K, V | Iterable<V>]>,
    options: MultiMapOptions = {},
  ) {
    super();

    this.allowDuplicates = options.allowDuplicates ?? true;
    this.collectionFactory =
      options.collectionFactory ||
      (() => (this.allowDuplicates ? [] : new Set()));

    if (entries) {
      for (const [key, value] of entries) {
        if (value && typeof value === 'object' && Symbol.iterator in value) {
          for (const v of value as Iterable<V>) {
            this.add(key, v);
          }
        } else {
          this.add(key, value as V);
        }
      }
    }
  }

  /**
   * Add a value to a key
   */
  add(key: K, value: V): this {
    let collection = this.data.get(key);

    if (!collection) {
      collection = this.collectionFactory();
      this.data.set(key, collection);
    }

    const _sizeBefore = this.getCollectionSize(collection);

    if (Array.isArray(collection)) {
      if (!this.allowDuplicates && collection.includes(value)) {
        return this;
      }
      collection.push(value);
    } else {
      (collection as Set<V>).add(value);
    }

    const sizeAfter = this.getCollectionSize(collection);
    this._totalValues += sizeAfter - _sizeBefore;

    return this;
  }

  /**
   * Remove a specific value from a key
   */
  removeValue(key: K, value: V): boolean {
    const collection = this.data.get(key);
    if (!collection) {
      return false;
    }

    let removed = false;

    if (Array.isArray(collection)) {
      const index = collection.indexOf(value);
      if (index !== -1) {
        collection.splice(index, 1);
        removed = true;
      }
    } else {
      removed = (collection as Set<V>).delete(value);
    }

    if (removed) {
      this._totalValues--;

      // Remove key if no values left
      if (this.getCollectionSize(collection) === 0) {
        this.data.delete(key);
      }
    }

    return removed;
  }

  /**
   * Remove all values for a key
   */
  override delete(key: K): boolean {
    const collection = this.data.get(key);
    if (!collection) {
      return false;
    }

    this._totalValues -= this.getCollectionSize(collection);
    return this.data.delete(key);
  }

  /**
   * Get all values for a key
   */
  getAll(key: K): V[] {
    const collection = this.data.get(key);
    if (!collection) {
      return [];
    }

    return Array.isArray(collection) ? [...collection] : [...collection];
  }

  /**
   * Get first value for a key
   */
  getFirst(key: K): V | undefined {
    const collection = this.data.get(key);
    if (!collection) {
      return undefined;
    }

    if (Array.isArray(collection)) {
      return collection[0];
    } else {
      return collection.values().next().value;
    }
  }

  /**
   * Check if a key has a specific value
   */
  hasValue(key: K, value: V): boolean {
    const collection = this.data.get(key);
    if (!collection) {
      return false;
    }

    return Array.isArray(collection)
      ? collection.includes(value)
      : (collection as Set<V>).has(value);
  }

  /**
   * Get total number of values across all keys
   */
  get totalValues(): number {
    return this._totalValues;
  }

  /**
   * Get the number of values for a specific key
   */
  countValues(key: K): number {
    const collection = this.data.get(key);
    return collection ? this.getCollectionSize(collection) : 0;
  }

  /**
   * Clear all values for all keys
   */
  override clear(): void {
    super.clear();
    this._totalValues = 0;
  }

  /**
   * Iterate over all key-value pairs (flattened)
   */
  *entriesFlat(): IterableIterator<[K, V]> {
    for (const [key, collection] of this.data) {
      for (const value of collection) {
        yield [key, value];
      }
    }
  }

  /**
   * Iterate over all values (flattened)
   */
  *valuesFlat(): IterableIterator<V> {
    for (const collection of this.data.values()) {
      yield* collection;
    }
  }

  /**
   * Group values by a classifier function
   */
  groupValuesByClassifier<G>(classifier: (value: V) => G): Map<G, V[]> {
    const groups = new Map<G, V[]>();

    for (const value of this.valuesFlat()) {
      const group = classifier(value);
      if (!groups.has(group)) {
        groups.set(group, []);
      }
      const bucket = groups.get(group);
      if (bucket) {
        bucket.push(value);
      }
    }

    return groups;
  }

  /**
   * Create a new MultiMap with the same options and values
   */
  override clone(): MultiMap<K, V> {
    const cloned = new MultiMap<K, V>(undefined, {
      allowDuplicates: this.allowDuplicates,
      collectionFactory: this.collectionFactory,
    });

    for (const [key, collection] of this.data) {
      for (const value of collection) {
        cloned.add(key, value);
      }
    }

    return cloned;
  }

  /**
   * Get the size of a collection
   */
  private getCollectionSize(collection: Set<V> | V[]): number {
    return Array.isArray(collection) ? collection.length : collection.size;
  }

  /**
   * Get string representation
   */
  override toString(): string {
    const entries = [...this.data.entries()]
      .map(([k, v]) => `${String(k)}: [${[...v].map(String).join(', ')}]`)
      .join(', ');
    return `MultiMap(${this.size} keys, ${this.totalValues} values) { ${entries} }`;
  }
}
