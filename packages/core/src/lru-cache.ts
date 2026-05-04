import type { TenantId } from './ids';

/**
 * Branded type for cache keys to ensure type safety
 */
export type CacheKey = string & { __brand: 'CacheKey' };

/**
 * Create a type-safe cache key
 */
export function toCacheKey(key: string): CacheKey {
  return key as CacheKey;
}

/**
 * Configuration options for LRU cache
 */
export interface LRUCacheOptions {
  /**
   * Maximum number of entries in the cache
   * @default 1000
   */
  maxSize?: number;

  /**
   * Default TTL in milliseconds for cache entries
   * @default undefined (no expiration)
   */
  defaultTTL?: number;

  /**
   * Enable tenant isolation (prefix keys with tenantId)
   * @default false
   */
  tenantIsolation?: boolean;

  /**
   * Callback invoked when an entry is evicted
   */
  onEvict?: (key: string, value: unknown, reason: EvictionReason) => void;
}

/**
 * Reason for cache entry eviction
 */
export type EvictionReason = 'capacity' | 'ttl' | 'manual' | 'pattern';

/**
 * Internal cache entry with metadata
 */
interface CacheEntry<T> {
  value: T;
  expiresAt: number | null;
  insertedAt: number;
}

/**
 * Double-linked list node for O(1) LRU tracking
 */
class LRUNode<T> {
  constructor(
    public key: string,
    public entry: CacheEntry<T>,
    public prev: LRUNode<T> | null = null,
    public next: LRUNode<T> | null = null,
  ) {}
}

/**
 * Statistics for cache monitoring
 */
export interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  size: number;
  maxSize: number;
  hitRate: number;
}

/**
 * High-performance O(1) LRU cache with TTL and tenant isolation
 *
 * Features:
 * - O(1) get/set/delete operations using Map + doubly-linked list
 * - Per-entry TTL with lazy expiration checking
 * - Tenant isolation with prefixed keys
 * - Pattern-based invalidation using RegExp
 * - LRU eviction when capacity is reached
 * - Comprehensive statistics tracking
 *
 * @example
 * ```typescript
 * const cache = new LRUCache<string>({ maxSize: 100, defaultTTL: 60000 });
 *
 * // Basic usage
 * cache.set(toCacheKey('key'), 'value');
 * const value = cache.get(toCacheKey('key'));
 *
 * // With TTL override
 * cache.set(toCacheKey('temp'), 'data', { ttl: 5000 });
 *
 * // Tenant isolation
 * const tenantCache = new LRUCache({ tenantIsolation: true });
 * tenantCache.set(toCacheKey('key'), 'value', { tenantId });
 *
 * // Pattern invalidation
 * cache.invalidatePattern(/^user:/);
 * ```
 */
export class LRUCache<T = unknown> {
  private readonly cache = new Map<string, LRUNode<T>>();
  private readonly maxSize: number;
  private readonly defaultTTL: number | undefined;
  private readonly tenantIsolation: boolean;
  private readonly onEvict?: (key: string, value: unknown, reason: EvictionReason) => void;

  // Doubly-linked list for LRU tracking (most recent at head)
  private head: LRUNode<T> | null = null;
  private tail: LRUNode<T> | null = null;

  // Statistics
  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0,
  };

  constructor(options: LRUCacheOptions = {}) {
    this.maxSize = options.maxSize ?? 1000;
    this.defaultTTL = options.defaultTTL;
    this.tenantIsolation = options.tenantIsolation ?? false;
    this.onEvict = options.onEvict;

    if (this.maxSize <= 0) {
      throw new Error('maxSize must be greater than 0');
    }
  }

  /**
   * Get a value from the cache
   * Returns undefined if not found or expired
   *
   * Time complexity: O(1)
   */
  get(key: CacheKey, options?: { tenantId?: TenantId }): T | undefined {
    const fullKey = this.buildKey(key, options?.tenantId);
    const node = this.cache.get(fullKey);

    if (!node) {
      this.stats.misses++;
      return undefined;
    }

    // Check TTL expiration (lazy)
    if (this.isExpired(node.entry)) {
      this.stats.misses++;
      this.deleteNode(node, 'ttl');
      return undefined;
    }

    this.stats.hits++;

    // Move to head (most recently used)
    this.moveToHead(node);

    return node.entry.value;
  }

  /**
   * Read a value without promoting it in the LRU order.
   * Useful for diagnostics and iteration where you don't want to
   * change eviction priority.
   *
   * Time complexity: O(1)
   */
  peek(key: CacheKey, options?: { tenantId?: TenantId }): T | undefined {
    const fullKey = this.buildKey(key, options?.tenantId);
    const node = this.cache.get(fullKey);

    if (!node) return undefined;

    // Check TTL expiration (lazy)
    if (this.isExpired(node.entry)) {
      this.deleteNode(node, 'ttl');
      return undefined;
    }

    // NO moveToHead — that's the point of peek
    return node.entry.value;
  }

  /**
   * Set a value in the cache
   *
   * Time complexity: O(1)
   */
  set(
    key: CacheKey,
    value: T,
    options?: {
      tenantId?: TenantId;
      ttl?: number;
    },
  ): void {
    const fullKey = this.buildKey(key, options?.tenantId);
    const existingNode = this.cache.get(fullKey);

    // Use explicit ttl if provided (even if undefined), otherwise use defaultTTL
    const ttl = options && 'ttl' in options ? options.ttl : this.defaultTTL;
    const entry: CacheEntry<T> = {
      value,
      expiresAt: ttl !== undefined ? Date.now() + ttl : null,
      insertedAt: Date.now(),
    };

    if (existingNode) {
      // Update existing entry
      existingNode.entry = entry;
      this.moveToHead(existingNode);
    } else {
      // Create new node
      const newNode = new LRUNode(fullKey, entry);
      this.cache.set(fullKey, newNode);
      this.addToHead(newNode);

      // Evict LRU if over capacity
      if (this.cache.size > this.maxSize) {
        this.evictLRU();
      }
    }
  }

  /**
   * Check if a key exists in the cache (without updating LRU position)
   *
   * Time complexity: O(1)
   */
  has(key: CacheKey, options?: { tenantId?: TenantId }): boolean {
    const fullKey = this.buildKey(key, options?.tenantId);
    const node = this.cache.get(fullKey);

    if (!node) {
      return false;
    }

    if (this.isExpired(node.entry)) {
      this.deleteNode(node, 'ttl');
      return false;
    }

    return true;
  }

  /**
   * Delete a specific key from the cache
   *
   * Time complexity: O(1)
   */
  delete(key: CacheKey, options?: { tenantId?: TenantId }): boolean {
    const fullKey = this.buildKey(key, options?.tenantId);
    const node = this.cache.get(fullKey);

    if (!node) {
      return false;
    }

    this.deleteNode(node, 'manual');
    return true;
  }

  /**
   * Invalidate all entries matching a pattern
   *
   * Time complexity: O(n) where n is number of entries
   *
   * @example
   * ```typescript
   * // Invalidate all user cache entries
   * cache.invalidatePattern(/^user:/);
   *
   * // Invalidate specific tenant
   * cache.invalidatePattern(/^tenant:abc123:/);
   * ```
   */
  invalidatePattern(pattern: RegExp): number {
    let invalidated = 0;

    // Collect keys to delete (can't delete while iterating)
    const keysToDelete: string[] = [];

    for (const key of this.cache.keys()) {
      if (pattern.test(key)) {
        keysToDelete.push(key);
      }
    }

    // Delete collected keys
    for (const key of keysToDelete) {
      const node = this.cache.get(key);
      if (node) {
        this.deleteNode(node, 'pattern');
        invalidated++;
      }
    }

    return invalidated;
  }

  /**
   * Clear all entries from the cache
   *
   * Time complexity: O(n)
   */
  clear(): void {
    // Invoke eviction callbacks
    if (this.onEvict) {
      for (const node of this.cache.values()) {
        this.onEvict(node.key, node.entry.value, 'manual');
      }
    }

    this.cache.clear();
    this.head = null;
    this.tail = null;
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const total = this.stats.hits + this.stats.misses;
    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      evictions: this.stats.evictions,
      size: this.cache.size,
      maxSize: this.maxSize,
      hitRate: total > 0 ? this.stats.hits / total : 0,
    };
  }

  /**
   * Reset statistics counters
   */
  resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
    };
  }

  /**
   * Get all keys in the cache (for debugging)
   */
  keys(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Get current cache size
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Evict expired entries (manual cleanup)
   *
   * Time complexity: O(n)
   *
   * @returns Number of entries evicted
   */
  evictExpired(): number {
    let evicted = 0;
    const now = Date.now();

    // Collect expired nodes
    const expiredNodes: LRUNode<T>[] = [];

    for (const node of this.cache.values()) {
      if (node.entry.expiresAt && node.entry.expiresAt <= now) {
        expiredNodes.push(node);
      }
    }

    // Delete expired nodes
    for (const node of expiredNodes) {
      this.deleteNode(node, 'ttl');
      evicted++;
    }

    return evicted;
  }

  // Private methods

  private buildKey(key: CacheKey, tenantId?: TenantId): string {
    if (this.tenantIsolation) {
      if (!tenantId) {
        throw new Error('tenantId required when tenantIsolation is enabled');
      }
      return `${tenantId}:${key}`;
    }
    return key;
  }

  private isExpired(entry: CacheEntry<T>): boolean {
    return entry.expiresAt !== null && entry.expiresAt <= Date.now();
  }

  private addToHead(node: LRUNode<T>): void {
    node.next = this.head;
    node.prev = null;

    if (this.head) {
      this.head.prev = node;
    }

    this.head = node;

    if (!this.tail) {
      this.tail = node;
    }
  }

  private removeNode(node: LRUNode<T>): void {
    if (node.prev) {
      node.prev.next = node.next;
    } else {
      this.head = node.next;
    }

    if (node.next) {
      node.next.prev = node.prev;
    } else {
      this.tail = node.prev;
    }
  }

  private moveToHead(node: LRUNode<T>): void {
    if (node === this.head) {
      return;
    }

    this.removeNode(node);
    this.addToHead(node);
  }

  private deleteNode(node: LRUNode<T>, reason: EvictionReason): void {
    this.removeNode(node);
    this.cache.delete(node.key);

    if (reason === 'capacity' || reason === 'ttl' || reason === 'pattern') {
      this.stats.evictions++;
    }

    if (this.onEvict) {
      this.onEvict(node.key, node.entry.value, reason);
    }
  }

  private evictLRU(): void {
    if (!this.tail) {
      return;
    }

    this.deleteNode(this.tail, 'capacity');
  }
}

/**
 * Tenant-aware cache wrapper for simplified usage
 *
 * @example
 * ```typescript
 * const cache = new TenantCache<User>({ maxSize: 500 });
 *
 * cache.set(tenantId, toCacheKey('user:123'), user);
 * const user = cache.get(tenantId, toCacheKey('user:123'));
 * ```
 */
export class TenantCache<T = unknown> {
  private readonly cache: LRUCache<T>;

  constructor(options: Omit<LRUCacheOptions, 'tenantIsolation'> = {}) {
    this.cache = new LRUCache<T>({
      ...options,
      tenantIsolation: true,
    });
  }

  get(tenantId: TenantId, key: CacheKey): T | undefined {
    return this.cache.get(key, { tenantId });
  }

  set(tenantId: TenantId, key: CacheKey, value: T, options?: { ttl?: number }): void {
    this.cache.set(key, value, { ...options, tenantId });
  }

  has(tenantId: TenantId, key: CacheKey): boolean {
    return this.cache.has(key, { tenantId });
  }

  delete(tenantId: TenantId, key: CacheKey): boolean {
    return this.cache.delete(key, { tenantId });
  }

  /**
   * Invalidate all entries for a specific tenant
   */
  invalidateTenant(tenantId: TenantId): number {
    return this.cache.invalidatePattern(new RegExp(`^${tenantId}:`));
  }

  /**
   * Invalidate pattern within a specific tenant
   */
  invalidatePattern(tenantId: TenantId, pattern: RegExp): number {
    const tenantPattern = new RegExp(`^${tenantId}:${pattern.source}`);
    return this.cache.invalidatePattern(tenantPattern);
  }

  getStats(): CacheStats {
    return this.cache.getStats();
  }

  resetStats(): void {
    this.cache.resetStats();
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}
