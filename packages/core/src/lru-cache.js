/**
 * Create a type-safe cache key
 */
export function toCacheKey(key) {
    return key;
}
/**
 * Double-linked list node for O(1) LRU tracking
 */
class LRUNode {
    key;
    entry;
    prev;
    next;
    constructor(key, entry, prev = null, next = null) {
        this.key = key;
        this.entry = entry;
        this.prev = prev;
        this.next = next;
    }
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
export class LRUCache {
    cache = new Map();
    maxSize;
    defaultTTL;
    tenantIsolation;
    onEvict;
    // Doubly-linked list for LRU tracking (most recent at head)
    head = null;
    tail = null;
    // Statistics
    stats = {
        hits: 0,
        misses: 0,
        evictions: 0,
    };
    constructor(options = {}) {
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
    get(key, options) {
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
     * Set a value in the cache
     *
     * Time complexity: O(1)
     */
    set(key, value, options) {
        const fullKey = this.buildKey(key, options?.tenantId);
        const existingNode = this.cache.get(fullKey);
        // Use explicit ttl if provided (even if undefined), otherwise use defaultTTL
        const ttl = options && 'ttl' in options ? options.ttl : this.defaultTTL;
        const entry = {
            value,
            expiresAt: ttl !== undefined ? Date.now() + ttl : null,
            insertedAt: Date.now(),
        };
        if (existingNode) {
            // Update existing entry
            existingNode.entry = entry;
            this.moveToHead(existingNode);
        }
        else {
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
    has(key, options) {
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
    delete(key, options) {
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
    invalidatePattern(pattern) {
        let invalidated = 0;
        // Collect keys to delete (can't delete while iterating)
        const keysToDelete = [];
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
    clear() {
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
    getStats() {
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
    resetStats() {
        this.stats = {
            hits: 0,
            misses: 0,
            evictions: 0,
        };
    }
    /**
     * Get all keys in the cache (for debugging)
     */
    keys() {
        return Array.from(this.cache.keys());
    }
    /**
     * Get current cache size
     */
    get size() {
        return this.cache.size;
    }
    /**
     * Evict expired entries (manual cleanup)
     *
     * Time complexity: O(n)
     *
     * @returns Number of entries evicted
     */
    evictExpired() {
        let evicted = 0;
        const now = Date.now();
        // Collect expired nodes
        const expiredNodes = [];
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
    buildKey(key, tenantId) {
        if (this.tenantIsolation) {
            if (!tenantId) {
                throw new Error('tenantId required when tenantIsolation is enabled');
            }
            return `${tenantId}:${key}`;
        }
        return key;
    }
    isExpired(entry) {
        return entry.expiresAt !== null && entry.expiresAt <= Date.now();
    }
    addToHead(node) {
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
    removeNode(node) {
        if (node.prev) {
            node.prev.next = node.next;
        }
        else {
            this.head = node.next;
        }
        if (node.next) {
            node.next.prev = node.prev;
        }
        else {
            this.tail = node.prev;
        }
    }
    moveToHead(node) {
        if (node === this.head) {
            return;
        }
        this.removeNode(node);
        this.addToHead(node);
    }
    deleteNode(node, reason) {
        this.removeNode(node);
        this.cache.delete(node.key);
        if (reason === 'capacity' || reason === 'ttl' || reason === 'pattern') {
            this.stats.evictions++;
        }
        if (this.onEvict) {
            this.onEvict(node.key, node.entry.value, reason);
        }
    }
    evictLRU() {
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
export class TenantCache {
    cache;
    constructor(options = {}) {
        this.cache = new LRUCache({
            ...options,
            tenantIsolation: true,
        });
    }
    get(tenantId, key) {
        return this.cache.get(key, { tenantId });
    }
    set(tenantId, key, value, options) {
        this.cache.set(key, value, { ...options, tenantId });
    }
    has(tenantId, key) {
        return this.cache.has(key, { tenantId });
    }
    delete(tenantId, key) {
        return this.cache.delete(key, { tenantId });
    }
    /**
     * Invalidate all entries for a specific tenant
     */
    invalidateTenant(tenantId) {
        return this.cache.invalidatePattern(new RegExp(`^${tenantId}:`));
    }
    /**
     * Invalidate pattern within a specific tenant
     */
    invalidatePattern(tenantId, pattern) {
        const tenantPattern = new RegExp(`^${tenantId}:${pattern.source}`);
        return this.cache.invalidatePattern(tenantPattern);
    }
    getStats() {
        return this.cache.getStats();
    }
    resetStats() {
        this.cache.resetStats();
    }
    clear() {
        this.cache.clear();
    }
    get size() {
        return this.cache.size;
    }
}
