import type { TenantId } from './ids';
/**
 * Branded type for cache keys to ensure type safety
 */
export type CacheKey = string & {
    __brand: 'CacheKey';
};
/**
 * Create a type-safe cache key
 */
export declare function toCacheKey(key: string): CacheKey;
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
export declare class LRUCache<T = unknown> {
    private readonly cache;
    private readonly maxSize;
    private readonly defaultTTL;
    private readonly tenantIsolation;
    private readonly onEvict?;
    private head;
    private tail;
    private stats;
    constructor(options?: LRUCacheOptions);
    /**
     * Get a value from the cache
     * Returns undefined if not found or expired
     *
     * Time complexity: O(1)
     */
    get(key: CacheKey, options?: {
        tenantId?: TenantId;
    }): T | undefined;
    /**
     * Set a value in the cache
     *
     * Time complexity: O(1)
     */
    set(key: CacheKey, value: T, options?: {
        tenantId?: TenantId;
        ttl?: number;
    }): void;
    /**
     * Check if a key exists in the cache (without updating LRU position)
     *
     * Time complexity: O(1)
     */
    has(key: CacheKey, options?: {
        tenantId?: TenantId;
    }): boolean;
    /**
     * Delete a specific key from the cache
     *
     * Time complexity: O(1)
     */
    delete(key: CacheKey, options?: {
        tenantId?: TenantId;
    }): boolean;
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
    invalidatePattern(pattern: RegExp): number;
    /**
     * Clear all entries from the cache
     *
     * Time complexity: O(n)
     */
    clear(): void;
    /**
     * Get cache statistics
     */
    getStats(): CacheStats;
    /**
     * Reset statistics counters
     */
    resetStats(): void;
    /**
     * Get all keys in the cache (for debugging)
     */
    keys(): string[];
    /**
     * Get current cache size
     */
    get size(): number;
    /**
     * Evict expired entries (manual cleanup)
     *
     * Time complexity: O(n)
     *
     * @returns Number of entries evicted
     */
    evictExpired(): number;
    private buildKey;
    private isExpired;
    private addToHead;
    private removeNode;
    private moveToHead;
    private deleteNode;
    private evictLRU;
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
export declare class TenantCache<T = unknown> {
    private readonly cache;
    constructor(options?: Omit<LRUCacheOptions, 'tenantIsolation'>);
    get(tenantId: TenantId, key: CacheKey): T | undefined;
    set(tenantId: TenantId, key: CacheKey, value: T, options?: {
        ttl?: number;
    }): void;
    has(tenantId: TenantId, key: CacheKey): boolean;
    delete(tenantId: TenantId, key: CacheKey): boolean;
    /**
     * Invalidate all entries for a specific tenant
     */
    invalidateTenant(tenantId: TenantId): number;
    /**
     * Invalidate pattern within a specific tenant
     */
    invalidatePattern(tenantId: TenantId, pattern: RegExp): number;
    getStats(): CacheStats;
    resetStats(): void;
    clear(): void;
    get size(): number;
}
//# sourceMappingURL=lru-cache.d.ts.map