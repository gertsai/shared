/**
 * WeakCollection - Collection with weak references
 * Allows garbage collection of keys when no other references exist
 * Useful for caching and memory-sensitive applications
 */

/**
 * WeakCollection interface for collections with weak references
 */
export interface IWeakCollection<K extends object, V> {
  get(key: K): V | undefined;
  set(key: K, value: V): this;
  has(key: K): boolean;
  delete(key: K): boolean;
}

/**
 * WeakMap-based collection with additional functionality
 * @template K - Key type (must be an object)
 * @template V - Value type
 * @template M - Metadata type (defaults to unknown)
 */
/**
 * Token object used for FinalizationRegistry unregistration.
 * Must be an object type as required by FinalizationRegistry.unregister().
 */
interface RegistryToken {
  readonly id: symbol;
}

export class WeakCollection<K extends object, V, M = unknown> implements IWeakCollection<K, V> {
  private weakMap: WeakMap<K, V>;
  private registry?: FinalizationRegistry<RegistryToken>;
  private registryHandlers?: Map<symbol, () => void>;
  private registryTokens?: WeakMap<K, RegistryToken>;
  private metadata?: WeakMap<K, M>;
  // Track keys via weak references to enable best-effort iteration without preventing GC
  private keyRefs?: Array<WeakRef<K>>;

  constructor(entries?: Iterable<[K, V]>) {
    this.weakMap = new WeakMap();
    if (typeof WeakMap !== 'undefined') {
      this.metadata = new WeakMap();
    }
    if (typeof WeakRef !== 'undefined') {
      this.keyRefs = [];
    }

    if (entries) {
      for (const [key, value] of entries) {
        this.set(key, value);
      }
    }
  }

  /**
   * Get value for a key
   */
  get(key: K): V | undefined {
    return this.weakMap.get(key);
  }

  /**
   * Set a key-value pair
   */
  set(key: K, value: V): this {
    this.weakMap.set(key, value);
    // Track key for best-effort iteration
    if (this.keyRefs) {
      this.keyRefs.push(new WeakRef(key));
    }
    this.registerFinalizer(key, () => {
      this.cleanupKeyRefs();
    });
    return this;
  }

  /**
   * Check if key exists
   */
  has(key: K): boolean {
    return this.weakMap.has(key);
  }

  /**
   * Delete a key
   */
  delete(key: K): boolean {
    this.unregisterFinalizer(key);
    if (this.metadata) {
      this.metadata.delete(key);
    }
    const deleted = this.weakMap.delete(key);
    if (deleted && this.keyRefs) {
      this.keyRefs = this.keyRefs.filter((ref) => {
        const k = ref.deref();
        return k !== undefined && k !== key;
      });
    }
    return deleted;
  }

  /**
   * Set metadata for a key
   * @param key - The key to set metadata for
   * @param metadata - The metadata value
   * @returns this for chaining
   */
  setMetadata(key: K, metadata: M): this {
    if (!this.metadata) {
      this.metadata = new WeakMap();
    }
    this.metadata.set(key, metadata);
    return this;
  }

  /**
   * Get metadata for a key
   * @param key - The key to get metadata for
   * @returns The metadata value or undefined if not set
   */
  getMetadata(key: K): M | undefined {
    return this.metadata?.get(key);
  }

  /**
   * Set with expiration callback
   */
  setWithCallback(key: K, value: V, callback: (key: K) => void): this {
    this.set(key, value);

    const keyRef = typeof WeakRef !== 'undefined' ? new WeakRef(key) : undefined;
    this.registerFinalizer(key, () => {
      this.cleanupKeyRefs();
      const liveKey = keyRef?.deref();
      if (liveKey !== undefined) {
        callback(liveKey);
      }
    });
    return this;
  }

  /**
   * Get or compute value if absent
   */
  getOrCompute(key: K, compute: (key: K) => V): V {
    if (this.has(key)) {
      const existing = this.get(key);
      if (existing !== undefined) {
        return existing;
      }
    }

    const value = compute(key);
    this.set(key, value);
    return value;
  }

  /**
   * Create a filtered view (returns a new WeakCollection)
   */
  filter(predicate: (value: V, key: K) => boolean, keys?: Iterable<K>): WeakCollection<K, V> {
    const filtered = new WeakCollection<K, V>();
    const it = keys ?? this.keys();
    for (const key of it) {
      const value = this.get(key);
      if (value !== undefined && predicate(value, key)) {
        filtered.set(key, value);
      }
    }
    return filtered;
  }

  /**
   * Transform values (returns a new WeakCollection)
   */
  mapValues<R>(fn: (value: V, key: K) => R, keys?: Iterable<K>): WeakCollection<K, R> {
    const mapped = new WeakCollection<K, R>();
    const it = keys ?? this.keys();
    for (const key of it) {
      const value = this.get(key);
      if (value !== undefined) {
        mapped.set(key, fn(value, key));
      }
    }
    return mapped;
  }

  /**
   * Best-effort iterator over live keys.
   * Requires WeakRef support at runtime; otherwise returns empty iterator.
   */
  *keys(): IterableIterator<K> {
    if (!this.keyRefs) {
      return;
    }
    // Clean and yield living keys
    this.cleanupKeyRefs();
    if (!this.keyRefs) {
      return;
    }
    for (const ref of this.keyRefs) {
      const k = ref.deref();
      if (k !== undefined && this.has(k)) {
        yield k;
      }
    }
  }

  private cleanupKeyRefs(): void {
    if (!this.keyRefs) {
      return;
    }
    this.keyRefs = this.keyRefs.filter((ref) => ref.deref() !== undefined);
  }

  private registerFinalizer(key: K, handler: () => void): void {
    if (typeof FinalizationRegistry === 'undefined') {
      return;
    }

    if (!this.registry) {
      this.registryHandlers = new Map();
      this.registryTokens = new WeakMap();
      this.registry = new FinalizationRegistry((token: RegistryToken) => {
        const callback = this.registryHandlers?.get(token.id);
        if (callback) {
          callback();
          this.registryHandlers?.delete(token.id);
        }
      });
    }

    const existingToken = this.registryTokens?.get(key);
    if (existingToken) {
      this.registry.unregister(existingToken);
      this.registryHandlers?.delete(existingToken.id);
    }

    const token: RegistryToken = { id: Symbol('weak-collection-finalizer') };
    this.registryTokens?.set(key, token);
    this.registryHandlers?.set(token.id, handler);
    this.registry.register(key, token, token);
  }

  private unregisterFinalizer(key: K): void {
    const token = this.registryTokens?.get(key);
    if (!token || !this.registry) {
      return;
    }
    this.registry.unregister(token);
    this.registryHandlers?.delete(token.id);
    this.registryTokens?.delete(key);
  }
}

/**
 * WeakBiMap - Bidirectional weak references
 * Both keys and values must be objects
 */
export class WeakBiMap<K extends object, V extends object> {
  private forward: WeakMap<K, V>;
  private inverse: WeakMap<V, K>;

  constructor(entries?: Iterable<[K, V]>) {
    this.forward = new WeakMap();
    this.inverse = new WeakMap();

    if (entries) {
      for (const [key, value] of entries) {
        this.set(key, value);
      }
    }
  }

  /**
   * Set a bidirectional mapping
   */
  set(key: K, value: V): this {
    // Remove any existing mappings
    const existingValue = this.forward.get(key);
    const existingKey = this.inverse.get(value);

    if (existingValue) {
      this.inverse.delete(existingValue);
    }

    if (existingKey) {
      this.forward.delete(existingKey);
    }

    this.forward.set(key, value);
    this.inverse.set(value, key);

    return this;
  }

  /**
   * Get value by key
   */
  get(key: K): V | undefined {
    return this.forward.get(key);
  }

  /**
   * Get key by value
   */
  getKey(value: V): K | undefined {
    return this.inverse.get(value);
  }

  /**
   * Check if key exists
   */
  has(key: K): boolean {
    return this.forward.has(key);
  }

  /**
   * Check if value exists
   */
  hasValue(value: V): boolean {
    return this.inverse.has(value);
  }

  /**
   * Delete by key
   */
  delete(key: K): boolean {
    const value = this.forward.get(key);
    if (value) {
      this.inverse.delete(value);
      return this.forward.delete(key);
    }
    return false;
  }

  /**
   * Delete by value
   */
  deleteValue(value: V): boolean {
    const key = this.inverse.get(value);
    if (key) {
      this.forward.delete(key);
      return this.inverse.delete(value);
    }
    return false;
  }
}

/**
 * WeakValueMap - Map with weak references to values
 * Keys are strong references, values are weak
 */
export class WeakValueMap<K, V extends object> {
  private keySet: Set<K>;
  private refs: Map<K, WeakRef<V>>;
  private registry?: FinalizationRegistry<K>;

  constructor(entries?: Iterable<[K, V]>) {
    this.keySet = new Set();
    this.refs = new Map();

    // Clean up keys when values are garbage collected
    if (typeof FinalizationRegistry !== 'undefined') {
      this.registry = new FinalizationRegistry((key: K) => {
        this.keySet.delete(key);
        this.refs.delete(key);
      });
    }

    if (entries) {
      for (const [key, value] of entries) {
        this.set(key, value);
      }
    }
  }

  /**
   * Set a key with weak reference to value
   */
  set(key: K, value: V): this {
    // Clean up existing reference if any
    const existing = this.refs.get(key);
    if (existing) {
      const existingValue = existing.deref();
      if (existingValue) {
        this.registry?.unregister(existingValue);
      }
    }

    const ref: WeakRef<V> =
      typeof WeakRef !== 'undefined'
        ? new WeakRef<V>(value)
        : ({
            deref: () => value,
            [Symbol.toStringTag]: 'WeakRef',
          } as unknown as WeakRef<V>);
    this.refs.set(key, ref);
    this.keySet.add(key);

    // Register for cleanup
    this.registry?.register(value, key, value);

    return this;
  }

  /**
   * Get value by key (may return undefined if garbage collected)
   */
  get(key: K): V | undefined {
    const ref = this.refs.get(key);
    if (!ref) {
      return undefined;
    }

    const value = ref.deref();
    if (!value) {
      // Value was garbage collected, clean up
      this.keySet.delete(key);
      this.refs.delete(key);
      return undefined;
    }

    return value;
  }

  /**
   * Check if key exists and value is still alive
   */
  has(key: K): boolean {
    const value = this.get(key);
    return value !== undefined;
  }

  /**
   * Delete a key
   */
  delete(key: K): boolean {
    const ref = this.refs.get(key);
    if (ref) {
      const value = ref.deref();
      if (value) {
        this.registry?.unregister(value);
      }
      this.keySet.delete(key);
      return this.refs.delete(key);
    }
    return false;
  }

  /**
   * Get all keys (some values may be garbage collected)
   */
  *keys(): IterableIterator<K> {
    for (const key of this.keySet) {
      if (this.has(key)) {
        yield key;
      }
    }
  }

  /**
   * Get all values that are still alive
   */
  *values(): IterableIterator<V> {
    for (const key of this.keySet) {
      const value = this.get(key);
      if (value !== undefined) {
        yield value;
      }
    }
  }

  /**
   * Get all entries with live values
   */
  *entries(): IterableIterator<[K, V]> {
    for (const key of this.keySet) {
      const value = this.get(key);
      if (value !== undefined) {
        yield [key, value];
      }
    }
  }

  /**
   * Get the number of entries with live values
   */
  get size(): number {
    let count = 0;
    for (const key of this.keySet) {
      if (this.has(key)) {
        count++;
      }
    }
    return count;
  }

  /**
   * Clear all entries
   */
  clear(): void {
    for (const ref of this.refs.values()) {
      const value = ref.deref();
      if (value) {
        this.registry?.unregister(value);
      }
    }
    this.keySet.clear();
    this.refs.clear();
  }
}
