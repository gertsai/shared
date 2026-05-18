// SPDX-License-Identifier: Apache-2.0
/**
 * @fileoverview LruTtlMap — bounded LRU `Map<K, V>` with optional TTL.
 *
 * Wave 14.1 (PRD-044 / EVID-057): consolidated from `@gertsai/auth-openfga`
 * (Wave 7.4 / RFC-007 — CWE-770 defence against unbounded module-scoped
 * caches). Re-exported from there for back-compat.
 *
 * Differences from {@link LruMap}:
 * - Adds `ttlMs` knob (0 disables TTL, default 0).
 * - `has` and `get` touch recency AND eagerly evict expired entries.
 * - `maxSize` defaults to 1000 (high-throughput defaults) and MUST be ≥ 1
 *   (matches Wave 7.4 contract — throws otherwise).
 * - `now()` is injectable for deterministic tests.
 *
 * @see LruMap for the simpler no-TTL variant.
 */

/** Configuration for {@link LruTtlMap}. */
export interface LruTtlMapOptions {
  /** Max entries before LRU eviction. Default: 1000. Must be ≥ 1. */
  readonly maxSize?: number;
  /** Time-to-live in milliseconds. 0 disables TTL. Default: 0. */
  readonly ttlMs?: number;
  /** Clock function for testability. Default: `Date.now`. */
  readonly now?: () => number;
}

/**
 * Bounded `Map<K, V>` with LRU eviction and optional TTL expiry.
 *
 * Semantics:
 * - `get` returns `undefined` for missing or expired keys; touches
 *   recency on hit. Expired entries are dropped on access (lazy eviction).
 * - `set` evicts oldest entry when adding a NEW key would exceed
 *   `maxSize`. Re-setting an existing key refreshes its TTL timestamp
 *   AND its recency position.
 * - `has` returns true only for live (non-expired) keys; touches
 *   recency on hit (parity with `get`).
 * - `delete` returns true if key existed and was removed.
 * - `clear` resets size to 0.
 * - `size` reflects all stored entries — possibly-expired entries are
 *   not eagerly counted out until next `get`/`has`.
 * - Iteration does NOT touch recency and does NOT eagerly drop expired
 *   entries — expired keys may surface until next `get`/`has`. Consumers
 *   that need strict liveness should re-check inside the loop.
 */
export class LruTtlMap<K, V> {
  private readonly _maxSize: number;
  private readonly _ttlMs: number;
  private readonly _now: () => number;
  private readonly _store: Map<K, { v: V; t: number }>;

  constructor(opts?: LruTtlMapOptions) {
    this._maxSize = opts?.maxSize ?? 1000;
    this._ttlMs = opts?.ttlMs ?? 0;
    this._now = opts?.now ?? Date.now;
    this._store = new Map();
    if (this._maxSize < 1) {
      throw new Error('LruTtlMap: maxSize must be >= 1');
    }
  }

  /** Whether `entry` has expired relative to current `now()`. TTL of 0 disables expiry. */
  private _isExpired(entry: { v: V; t: number }): boolean {
    return this._ttlMs > 0 && this._now() - entry.t > this._ttlMs;
  }

  /** Get value and touch recency. Returns `undefined` for misses and expired entries. */
  get(key: K): V | undefined {
    const entry = this._store.get(key);
    if (entry === undefined) return undefined;
    if (this._isExpired(entry)) {
      this._store.delete(key);
      return undefined;
    }
    // Touch LRU: delete + reinsert moves entry to MRU position.
    this._store.delete(key);
    this._store.set(key, entry);
    return entry.v;
  }

  /**
   * Insert / update entry. New keys may evict oldest (LRU) entry when
   * `size >= maxSize`. Updates refresh both recency and TTL timestamp.
   */
  set(key: K, value: V): void {
    // If key exists, delete first to refresh LRU position.
    const had = this._store.delete(key);
    // Evict oldest when adding a NEW key would push us over capacity.
    if (!had && this._store.size >= this._maxSize) {
      const oldestKey = this._store.keys().next().value as K | undefined;
      if (oldestKey !== undefined) {
        this._store.delete(oldestKey);
      }
    }
    this._store.set(key, { v: value, t: this._now() });
  }

  /** Existence + liveness check. Touches recency on hit; drops expired entries. */
  has(key: K): boolean {
    const entry = this._store.get(key);
    if (entry === undefined) return false;
    if (this._isExpired(entry)) {
      this._store.delete(key);
      return false;
    }
    // Parity with `get`: touch LRU on hit.
    this._store.delete(key);
    this._store.set(key, entry);
    return true;
  }

  /** Remove entry. Returns true if it existed. */
  delete(key: K): boolean {
    return this._store.delete(key);
  }

  /** Reset to empty. */
  clear(): void {
    this._store.clear();
  }

  /** Number of stored entries (may include possibly-expired ones). */
  get size(): number {
    return this._store.size;
  }

  /**
   * Iterate live keys in insertion (LRU → MRU) order.
   *
   * Liveness caveat: expired entries may surface until next
   * `get`/`has`. Re-check with `get(k)` if strict liveness needed.
   */
  keys(): IterableIterator<K> {
    return this._store.keys();
  }

  /**
   * Iterate values in insertion (LRU → MRU) order.
   *
   * Same liveness caveat as {@link keys}.
   */
  *values(): IterableIterator<V> {
    for (const entry of this._store.values()) {
      yield entry.v;
    }
  }

  /**
   * Iterate `[key, value]` pairs in insertion (LRU → MRU) order.
   *
   * Same liveness caveat as {@link keys}.
   */
  *entries(): IterableIterator<[K, V]> {
    for (const [k, entry] of this._store) {
      yield [k, entry.v];
    }
  }

  /** Default iterator yields `[key, value]` pairs. */
  *[Symbol.iterator](): IterableIterator<[K, V]> {
    for (const [k, entry] of this._store) {
      yield [k, entry.v];
    }
  }
}
