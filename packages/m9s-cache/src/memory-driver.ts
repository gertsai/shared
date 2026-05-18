import type { CacheDriver, CachePayload } from './types.js';

/**
 * Memory entry with optional expiration.
 */
interface MemoryEntry {
  value: CachePayload;
  expiresAt?: number;
}

/**
 * Memory hash entry with optional expiration.
 */
interface MemoryHashEntry {
  fields: Map<string, CachePayload>;
  expiresAt?: number;
}

/**
 * Pattern matcher function type.
 */
type PatternMatcher = (key: string) => boolean;

/**
 * Options for MemoryCacheDriver.
 */
export interface MemoryCacheDriverOptions {
  /** Enable periodic cleanup of expired entries (default: false). */
  enableCleanup?: boolean;
  /** Cleanup interval in milliseconds (default: 60000). */
  cleanupIntervalMs?: number;
  /** Maximum number of entries (default: unlimited). */
  maxEntries?: number;
}

/**
 * In-memory cache driver — **FIFO eviction (NOT LRU)**.
 *
 * Wave 14.5 (PRD-045 / EVID-057 §LRU §m9s-cache): clarified eviction
 * semantics. This driver does NOT touch recency on `get()` — it evicts
 * by **insertion order** (`keys().next().value`). For true LRU
 * semantics, consume `@gertsai/utils/lru.LruMap` or
 * `@gertsai/utils/lru.LruTtlMap` in a custom driver instead.
 *
 * Rationale: `MemoryCacheDriver` is the in-memory fallback for the
 * Moleculer cacher protocol, which itself defines FIFO semantics for
 * parity with its Redis driver. Don't change to LRU without aligning
 * the contract upstream.
 *
 * Features:
 * - Full `CacheDriver` API compatibility
 * - TTL support with lazy expiration
 * - Optional periodic cleanup
 * - Pattern matching with regex caching
 * - Hash operations support
 * - FIFO eviction when `maxEntries` is set
 *
 * @example
 * ```typescript
 * const driver = new MemoryCacheDriver({
 *   enableCleanup: true,
 *   cleanupIntervalMs: 30000,
 *   maxEntries: 10000,
 * });
 * ```
 */
export class MemoryCacheDriver implements CacheDriver {
  private readonly store = new Map<string, MemoryEntry>();
  private readonly hashStore = new Map<string, MemoryHashEntry>();
  private readonly patternCache = new Map<string, PatternMatcher>();
  private readonly maxPatternCacheSize = 100;
  private readonly maxEntries?: number;
  private cleanupTimer?: ReturnType<typeof setInterval>;

  readonly supportsHash = true;
  readonly supportsAtomic = false;

  constructor(options: MemoryCacheDriverOptions = {}) {
    if (options.maxEntries !== undefined) this.maxEntries = options.maxEntries;

    if (options.enableCleanup) {
      const interval = options.cleanupIntervalMs ?? 60000;
      this.cleanupTimer = setInterval(() => this.cleanup(), interval);
      // Don't prevent Node.js from exiting
      if (this.cleanupTimer.unref) {
        this.cleanupTimer.unref();
      }
    }
  }

  /**
   * Get cached payload by key.
   */
  async get(key: string): Promise<CachePayload | null> {
    const entry = this.store.get(key);
    if (!entry) return null;

    if (this.isExpired(entry)) {
      this.store.delete(key);
      return null;
    }

    return entry.value;
  }

  /**
   * Set cached payload with optional TTL.
   */
  async set(key: string, value: CachePayload, ttlSeconds?: number): Promise<void> {
    // Evict if at capacity
    if (this.maxEntries && this.store.size >= this.maxEntries) {
      this.evictOldest();
    }

    const entry: MemoryEntry = { value };
    if (ttlSeconds != null && ttlSeconds > 0) {
      entry.expiresAt = Date.now() + ttlSeconds * 1000;
    }

    this.store.set(key, entry);
  }

  /**
   * Delete one or more keys.
   * Returns number of unique keys deleted (not stores).
   */
  async del(keys: string | string[]): Promise<number> {
    const list = Array.isArray(keys) ? keys : [keys];
    let count = 0;

    for (const key of list) {
      // Count unique keys, not stores
      const deletedFromStore = this.store.delete(key);
      const deletedFromHash = this.hashStore.delete(key);

      if (deletedFromStore || deletedFromHash) {
        count += 1;
      }
    }

    return count;
  }

  /**
   * Get multiple keys.
   */
  async mget(keys: string[]): Promise<Array<CachePayload | null>> {
    return Promise.all(keys.map((key) => this.get(key)));
  }

  /**
   * Set multiple key-value pairs.
   */
  async mset(entries: Array<[string, CachePayload]>): Promise<void> {
    for (const [key, value] of entries) {
      await this.set(key, value);
    }
  }

  /**
   * Set hash fields.
   */
  async hset(key: string, entries: Record<string, CachePayload>): Promise<void> {
    const existing = this.hashStore.get(key);
    const fields = existing?.fields ?? new Map<string, CachePayload>();

    for (const [field, value] of Object.entries(entries)) {
      fields.set(field, value);
    }

    this.hashStore.set(key, {
      fields,
      ...(existing?.expiresAt !== undefined && { expiresAt: existing.expiresAt }),
    });
  }

  /**
   * Get hash field.
   */
  async hget(key: string, field: string): Promise<CachePayload | null> {
    const entry = this.hashStore.get(key);
    if (!entry) return null;

    if (this.isHashExpired(entry)) {
      this.hashStore.delete(key);
      return null;
    }

    return entry.fields.get(field) ?? null;
  }

  /**
   * Get all hash fields.
   */
  async hgetall(key: string): Promise<Record<string, CachePayload> | null> {
    const entry = this.hashStore.get(key);
    if (!entry) return null;

    if (this.isHashExpired(entry)) {
      this.hashStore.delete(key);
      return null;
    }

    return Object.fromEntries(entry.fields.entries());
  }

  /**
   * List keys matching pattern.
   */
  async keys(pattern: string): Promise<string[]> {
    const matcher = this.getPatternMatcher(pattern);

    const regularKeys = Array.from(this.store.keys()).filter((key) => {
      const entry = this.store.get(key);
      if (entry && this.isExpired(entry)) {
        this.store.delete(key);
        return false;
      }
      return matcher(key);
    });

    const hashKeys = Array.from(this.hashStore.keys()).filter((key) => {
      const entry = this.hashStore.get(key);
      if (entry && this.isHashExpired(entry)) {
        this.hashStore.delete(key);
        return false;
      }
      return matcher(key);
    });

    return [...regularKeys, ...hashKeys];
  }

  /**
   * Check if key exists.
   */
  async exists(key: string): Promise<boolean> {
    const entry = this.store.get(key);
    if (entry) {
      if (this.isExpired(entry)) {
        this.store.delete(key);
        return false;
      }
      return true;
    }

    const hashEntry = this.hashStore.get(key);
    if (hashEntry) {
      if (this.isHashExpired(hashEntry)) {
        this.hashStore.delete(key);
        return false;
      }
      return true;
    }

    return false;
  }

  /**
   * Set TTL on key.
   */
  async expire(key: string, ttlSeconds: number): Promise<void> {
    const expiresAt = Date.now() + ttlSeconds * 1000;

    const entry = this.store.get(key);
    if (entry) {
      entry.expiresAt = expiresAt;
      return;
    }

    const hashEntry = this.hashStore.get(key);
    if (hashEntry) {
      hashEntry.expiresAt = expiresAt;
    }
  }

  /**
   * Get remaining TTL.
   */
  async ttl(key: string): Promise<number> {
    const now = Date.now();

    const entry = this.store.get(key);
    if (entry) {
      if (entry.expiresAt == null) return -1;
      const remaining = Math.ceil((entry.expiresAt - now) / 1000);
      if (remaining <= 0) {
        this.store.delete(key);
        return -2;
      }
      return remaining;
    }

    const hashEntry = this.hashStore.get(key);
    if (hashEntry) {
      if (hashEntry.expiresAt == null) return -1;
      const remaining = Math.ceil((hashEntry.expiresAt - now) / 1000);
      if (remaining <= 0) {
        this.hashStore.delete(key);
        return -2;
      }
      return remaining;
    }

    return -2;
  }

  /**
   * Stop cleanup timer and clear all data.
   */
  async quit(): Promise<void> {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      delete this.cleanupTimer;
    }
    this.store.clear();
    this.hashStore.clear();
    this.patternCache.clear();
  }

  /**
   * Get current entry count.
   */
  get size(): number {
    return this.store.size + this.hashStore.size;
  }

  /**
   * Atomically set values only if they are newer.
   *
   * For Memory driver, this is inherently atomic (single-threaded Node.js).
   * Implemented for API consistency with Redis driver.
   *
   * @param entries - Array of [key, numericValue] pairs
   * @returns Number of keys actually updated
   */
  async setIfNewer(entries: Array<[string, number]>): Promise<number> {
    let updated = 0;

    for (const [key, newValue] of entries) {
      const existing = this.store.get(key);
      const currentValue = existing?.value;

      // Parse current value as number
      let current: number | null = null;
      if (currentValue != null) {
        const str = Buffer.isBuffer(currentValue)
          ? currentValue.toString('utf-8')
          : String(currentValue);
        const num = Number(str);
        current = Number.isFinite(num) ? num : null;
      }

      // Set if current is null or current < new
      if (current == null || current < newValue) {
        await this.set(key, String(newValue));
        updated++;
      }
    }

    return updated;
  }

  /**
   * Clean up expired entries.
   */
  private cleanup(): void {
    const now = Date.now();

    for (const [key, entry] of this.store) {
      if (entry.expiresAt != null && entry.expiresAt <= now) {
        this.store.delete(key);
      }
    }

    for (const [key, entry] of this.hashStore) {
      if (entry.expiresAt != null && entry.expiresAt <= now) {
        this.hashStore.delete(key);
      }
    }
  }

  /**
   * Evict oldest entry when at capacity.
   */
  private evictOldest(): void {
    // Simple FIFO eviction - Map preserves insertion order
    const firstKey = this.store.keys().next().value;
    if (firstKey) {
      this.store.delete(firstKey);
    }
  }

  /**
   * Check if entry is expired.
   */
  private isExpired(entry: MemoryEntry): boolean {
    return entry.expiresAt != null && entry.expiresAt <= Date.now();
  }

  /**
   * Check if hash entry is expired.
   */
  private isHashExpired(entry: MemoryHashEntry): boolean {
    return entry.expiresAt != null && entry.expiresAt <= Date.now();
  }

  /**
   * Get or create pattern matcher with caching.
   */
  private getPatternMatcher(pattern: string): PatternMatcher {
    let matcher = this.patternCache.get(pattern);
    if (matcher) return matcher;

    // Evict old patterns if cache is full
    if (this.patternCache.size >= this.maxPatternCacheSize) {
      const firstKey = this.patternCache.keys().next().value;
      if (firstKey) {
        this.patternCache.delete(firstKey);
      }
    }

    matcher = createPatternMatcher(pattern);
    this.patternCache.set(pattern, matcher);
    return matcher;
  }
}

/**
 * Maximum pattern length to prevent ReDoS attacks.
 */
const MAX_PATTERN_LENGTH = 256;

/**
 * Maximum consecutive wildcards to prevent catastrophic backtracking.
 */
const MAX_CONSECUTIVE_WILDCARDS = 10;

/**
 * Create a pattern matcher function for Redis-style patterns.
 *
 * Supports:
 * - `*` matches any number of characters
 * - `?` matches exactly one character
 * - `**` is normalized to `*`
 *
 * Security:
 * - Limits pattern length to prevent ReDoS
 * - Limits consecutive wildcards to prevent catastrophic backtracking
 */
function createPatternMatcher(pattern: string): PatternMatcher {
  // Security: limit pattern length
  if (pattern.length > MAX_PATTERN_LENGTH) {
    throw new Error(`Pattern too long (max ${MAX_PATTERN_LENGTH} chars): ${pattern.length}`);
  }

  // Normalize consecutive wildcards: *** -> *
  let normalized = pattern.replace(/\*+/g, '*');

  // Security: check for too many wildcards (potential ReDoS)
  const wildcardCount = (normalized.match(/\*/g) ?? []).length;
  if (wildcardCount > MAX_CONSECUTIVE_WILDCARDS) {
    throw new Error(
      `Too many wildcards in pattern (max ${MAX_CONSECUTIVE_WILDCARDS}): ${wildcardCount}`,
    );
  }

  // Match all keys if just *
  if (normalized === '*') {
    return () => true;
  }

  // Escape regex special characters except * and ?
  const escaped = normalized.replace(/[.+^${}()|[\]\\]/g, '\\$&');

  // Convert glob patterns to regex
  // Use non-greedy .*? to prevent backtracking
  const regexSource = '^' + escaped.replace(/\*/g, '.*?').replace(/\?/g, '.') + '$';

  try {
    const regex = new RegExp(regexSource);
    return (key: string) => regex.test(key);
  } catch {
    // Invalid regex - return matcher that never matches
    return () => false;
  }
}
