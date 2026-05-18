// SPDX-License-Identifier: Apache-2.0
/**
 * @fileoverview LruMap — bounded LRU `Map<K, V>` with no TTL.
 *
 * Wave 14.1 (PRD-044 / EVID-057): consolidated insertion-order LRU kernel
 * extracted from 4 ad-hoc implementations across `@gertsai/auth-openfga`,
 * `@gertsai/rest-request-manager`, `@gertsai/collection`, and
 * `@gertsai/api-rlr`. Pure data structure — no clocks, no expiry.
 *
 * Eviction policy: on `set` of a NEW key that would exceed `maxSize`,
 * the oldest entry (insertion order = LRU) is dropped via
 * `keys().next().value`. `get` and `delete + reinsert` touches recency.
 *
 * Constructor accepts EITHER:
 *   - a single positional number (legacy `LRUCache(100)` shape from
 *     `@gertsai/collection`); or
 *   - an `LruMapOptions` object (`{ maxSize }`).
 *
 * Defaults to `maxSize: 100` to match the most common legacy default
 * (`@gertsai/collection`'s `LRUCache`). For high-throughput infra
 * (auth-openfga, circuit breakers) override explicitly.
 *
 * @see LruTtlMap for the TTL-aware variant.
 */

/** Configuration for {@link LruMap}. */
export interface LruMapOptions {
  /**
   * Max entries before LRU eviction. Default: 100.
   *
   * Accepts `0` (caching disabled, all `set` calls no-op) to preserve
   * back-compat with `@gertsai/collection` `LRUCache(0)` semantics.
   * Values < 0 are clamped to 0.
   */
  readonly maxSize?: number;
}

/**
 * Bounded `Map<K, V>` with LRU eviction. No TTL.
 *
 * Semantics:
 * - `get` returns `undefined` for missing keys; touches recency on hit.
 * - `set` evicts oldest entry when adding a NEW key would exceed `maxSize`.
 *   If `maxSize === 0`, `set` is a no-op (caching disabled).
 * - `has` returns whether `key` is present. Does **not** touch recency
 *   — preserves legacy `@gertsai/collection` `LRUCache.has` semantics.
 * - `delete` returns true if key existed and was removed.
 * - `clear` resets size to 0.
 * - Iteration order is insertion order (LRU → MRU).
 *
 * @example
 * ```ts
 * const cache = new LruMap<string, User>({ maxSize: 1000 });
 * // legacy positional signature also accepted:
 * const legacy = new LruMap<string, User>(100);
 * ```
 */
export class LruMap<K, V> {
  private readonly _maxSize: number;
  private readonly _store: Map<K, V>;

  constructor(opts?: LruMapOptions | number) {
    const raw = typeof opts === 'number' ? opts : (opts?.maxSize ?? 100);
    // Clamp negatives to 0 — matches @gertsai/collection legacy behaviour.
    this._maxSize = Math.max(0, raw);
    this._store = new Map();
  }

  /** Get value and touch recency. Returns `undefined` for misses. */
  get(key: K): V | undefined {
    const value = this._store.get(key);
    if (value === undefined && !this._store.has(key)) return undefined;
    // Touch LRU: delete + reinsert moves entry to MRU position.
    this._store.delete(key);
    this._store.set(key, value as V);
    return value;
  }

  /**
   * Get value WITHOUT touching recency. Returns `undefined` for misses.
   *
   * Useful for observability / metrics callers that must not perturb
   * eviction order. Hot-path consumers should prefer {@link get}.
   */
  peek(key: K): V | undefined {
    return this._store.get(key);
  }

  /**
   * Insert / update entry. New keys may evict oldest (LRU) entry when
   * `size >= maxSize`. `maxSize === 0` disables caching entirely.
   */
  set(key: K, value: V): void {
    if (this._maxSize === 0) return;
    // Delete existing key to refresh position. Safe on missing keys.
    const had = this._store.delete(key);
    if (!had && this._store.size >= this._maxSize) {
      const oldestKey = this._store.keys().next().value as K | undefined;
      if (oldestKey !== undefined) {
        this._store.delete(oldestKey);
      }
    }
    this._store.set(key, value);
  }

  /** Existence check. Does NOT touch recency (preserves legacy semantics). */
  has(key: K): boolean {
    return this._store.has(key);
  }

  /** Remove entry. Returns true if it existed. */
  delete(key: K): boolean {
    return this._store.delete(key);
  }

  /** Reset to empty. */
  clear(): void {
    this._store.clear();
  }

  /** Current number of entries. */
  get size(): number {
    return this._store.size;
  }

  /** Iterate keys in insertion (LRU → MRU) order. */
  keys(): IterableIterator<K> {
    return this._store.keys();
  }

  /** Iterate values in insertion (LRU → MRU) order. */
  values(): IterableIterator<V> {
    return this._store.values();
  }

  /** Iterate `[key, value]` pairs in insertion (LRU → MRU) order. */
  entries(): IterableIterator<[K, V]> {
    return this._store.entries();
  }

  /** Default iterator yields `[key, value]` pairs. */
  [Symbol.iterator](): IterableIterator<[K, V]> {
    return this._store.entries();
  }
}
