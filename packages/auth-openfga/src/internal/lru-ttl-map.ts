// SPDX-License-Identifier: Apache-2.0
/**
 * @fileoverview LruTtlMap — internal bounded-cache utility for @gertsai/auth-openfga.
 *
 * Wave 7.4 (PRD-011 / RFC-007): defends against CWE-770 unbounded growth in
 * long-lived module-scoped Maps by adding LRU + optional TTL eviction.
 *
 * Internal only — NOT re-exported from the package root.
 *
 * Skeleton: agent `auth-openfga-client-lru` implements bodies. Both teammates
 * may import the public interface immediately.
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
 * Bounded Map with LRU eviction and optional TTL expiry.
 *
 * Semantics:
 * - `get` returns `undefined` for missing or expired keys; touches access order on hit
 * - `set` evicts oldest entry when adding would exceed `maxSize`
 * - `has` returns true only for live (non-expired) keys; touches access order on hit (parity with `get`)
 * - `delete` returns true if key existed and was removed
 * - `clear` resets size to 0
 * - `size` reflects live + possibly-expired entries (expired entries lazy-drop on access)
 *
 * @internal — implementation detail of `@gertsai/auth-openfga`; do not depend on this externally.
 */
export class LruTtlMap<K, V> {
  // Implementation owned by agent `auth-openfga-client-lru` — bodies to be filled in.
  // Skeleton stubs throw so accidental use before implementation surfaces in tests.
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

  /**
   * Returns whether `entry` has expired relative to current `now()`.
   * TTL of 0 disables expiry per RFC-007.
   */
  private _isExpired(entry: { v: V; t: number }): boolean {
    return this._ttlMs > 0 && this._now() - entry.t > this._ttlMs;
  }

  get(key: K): V | undefined {
    const entry = this._store.get(key);
    if (entry === undefined) return undefined;
    if (this._isExpired(entry)) {
      this._store.delete(key);
      return undefined;
    }
    // Touch LRU: delete + re-insert moves entry to MRU position in Map insertion order.
    this._store.delete(key);
    this._store.set(key, entry);
    return entry.v;
  }

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

  delete(key: K): boolean {
    return this._store.delete(key);
  }

  clear(): void {
    this._store.clear();
  }

  get size(): number {
    return this._store.size;
  }

  /**
   * Returns an iterator over live keys in insertion (LRU→MRU) order.
   *
   * Note: iteration does NOT touch LRU order and does NOT eagerly drop
   * expired entries — expired keys may surface here until next
   * `get`/`has`. Consumers that need strict liveness should re-check
   * via `get(k)` inside the loop.
   *
   * Provided so internal callers can scan/invalidate entries by
   * predicate (e.g. `PermissionCache.invalidate`).
   */
  keys(): IterableIterator<K> {
    return this._store.keys();
  }

  /**
   * Iterates `[key, value]` pairs in insertion (LRU→MRU) order.
   *
   * Same liveness caveat as {@link keys}: expired entries may surface
   * until next `get`/`has`.
   */
  *[Symbol.iterator](): IterableIterator<[K, V]> {
    for (const [k, entry] of this._store) {
      yield [k, entry.v];
    }
  }
}
