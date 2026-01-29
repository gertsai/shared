/**
 * Redis Deny Ledger Provider
 *
 * Distributed caching with PostgreSQL backup for multi-node deployments.
 *
 * Architecture:
 * - Redis: Primary cache, shared across all nodes
 * - PostgreSQL: Source of truth, used for warm-up and fallback
 * - Pub/Sub: Real-time invalidation across nodes
 *
 * Startup modes:
 * - Eager warm: Load all entries from PostgreSQL into Redis on startup
 * - Lazy warm: Load on cache miss (default for large datasets)
 *
 * @see RFC-042 Appendix I.5 - Deny Ledger Architecture
 */

import type { DenyLedgerProvider } from '../interface';
import type {
  DenyEntry,
  DenyEntryCreate,
  DenyCheckRequest,
  DenyCheckResult,
  DenyEntryFilter,
  DenyLedgerStats,
  DenySubjectType,
  DenyLedgerConfig,
} from '../types';
import { DEFAULT_DENY_LEDGER_CONFIG } from '../types';
import type { PostgresDenyLedger } from './postgres';

// =============================================================================
// Redis Types (duck typing to avoid ioredis dependency)
// =============================================================================

/**
 * Minimal Redis client interface.
 * Compatible with ioredis.
 */
export interface RedisClientLike {
  // Basic operations
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ...args: unknown[]): Promise<unknown>;
  setex(key: string, seconds: number, value: string): Promise<unknown>;
  del(...keys: string[]): Promise<number>;
  exists(...keys: string[]): Promise<number>;

  // Multi operations
  mget(...keys: string[]): Promise<(string | null)[]>;
  mset(...keyValues: string[]): Promise<unknown>;

  // Key operations
  keys(pattern: string): Promise<string[]>;
  scan(cursor: number | string, ...args: unknown[]): Promise<[string, string[]]>;
  expire(key: string, seconds: number): Promise<number>;
  ttl(key: string): Promise<number>;

  // Pub/Sub
  subscribe(channel: string): Promise<void>;
  unsubscribe(channel: string): Promise<void>;
  publish(channel: string, message: string): Promise<number>;
  on(event: 'message', callback: (channel: string, message: string) => void): void;

  // Connection
  duplicate(): RedisClientLike;
  quit(): Promise<void>;
  disconnect(): void;
}

// =============================================================================
// Key Building
// =============================================================================

const KEY_PREFIX = 'deny:';
const CHANNEL_INVALIDATE = 'deny:invalidate';

/**
 * Build Redis key for a deny entry.
 * Format: deny:{tenantId}:{subjectType}:{subjectId}:{resourceType}:{resourceId}
 */
function buildKey(
  tenantId: string,
  subjectType: string,
  subjectId: string,
  resourceType?: string,
  resourceId?: string,
): string {
  return `${KEY_PREFIX}${tenantId}:${subjectType}:${subjectId}:${resourceType || ''}:${resourceId || ''}`;
}

/**
 * Build Redis key from DenyEntry
 */
function buildKeyFromEntry(entry: DenyEntry | DenyEntryCreate): string {
  return buildKey(
    entry.tenantId,
    entry.subjectType,
    entry.subjectId,
    entry.resourceType,
    entry.resourceId,
  );
}

/**
 * Build key pattern for listing tenant entries
 */
function buildTenantPattern(tenantId: string): string {
  return `${KEY_PREFIX}${tenantId}:*`;
}

// =============================================================================
// Serialization
// =============================================================================

function serializeEntry(entry: DenyEntry): string {
  return JSON.stringify({
    ...entry,
    expiresAt: entry.expiresAt?.toISOString(),
    createdAt: entry.createdAt.toISOString(),
  });
}

function deserializeEntry(json: string): DenyEntry {
  const data = JSON.parse(json);
  return {
    ...data,
    expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined,
    createdAt: new Date(data.createdAt),
  };
}

// =============================================================================
// Provider Options
// =============================================================================

export interface RedisDenyLedgerOptions {
  /**
   * Redis client instance (ioredis compatible)
   */
  redis: RedisClientLike;

  /**
   * PostgreSQL provider for persistence and warm-up
   */
  postgres: PostgresDenyLedger;

  /**
   * Configuration
   */
  config?: Partial<DenyLedgerConfig>;

  /**
   * Warm-up mode on initialization
   * - 'eager': Load all entries from PostgreSQL (recommended for security)
   * - 'lazy': Load on cache miss (for large datasets)
   * @default 'eager'
   */
  warmupMode?: 'eager' | 'lazy';

  /**
   * Enable pub/sub for multi-node sync
   * @default true
   */
  enablePubSub?: boolean;
}

// =============================================================================
// Provider Implementation
// =============================================================================

/**
 * Redis-based Deny Ledger Provider with PostgreSQL backup.
 *
 * Best for multi-node deployments where you need:
 * - Shared cache across all nodes
 * - Real-time invalidation via pub/sub
 * - Durability from PostgreSQL
 *
 * @example
 * ```typescript
 * import Redis from 'ioredis';
 * import { getDatabase } from '@gerts/database';
 * import { RedisDenyLedger, PostgresDenyLedger } from '@gerts/core';
 *
 * const redis = new Redis({ host: 'localhost', port: 6379 });
 * const postgres = new PostgresDenyLedger({ prisma: getDatabase() });
 *
 * const ledger = new RedisDenyLedger({
 *   redis,
 *   postgres,
 *   warmupMode: 'eager', // Recommended for security
 * });
 *
 * await ledger.initialize(); // Warms Redis from PostgreSQL
 * ```
 */
export class RedisDenyLedger implements DenyLedgerProvider {
  private readonly redis: RedisClientLike;
  private readonly postgres: PostgresDenyLedger;
  private readonly ttlSeconds: number;
  private readonly warmupMode: 'eager' | 'lazy';
  private readonly enablePubSub: boolean;

  private subscriber: RedisClientLike | null = null;
  private initialized = false;
  private stats = {
    hits: 0,
    misses: 0,
    entries: 0,
  };

  constructor(options: RedisDenyLedgerOptions) {
    this.redis = options.redis;
    this.postgres = options.postgres;
    this.ttlSeconds = options.config?.cacheTtlSeconds ?? DEFAULT_DENY_LEDGER_CONFIG.cacheTtlSeconds;
    this.warmupMode = options.warmupMode ?? 'eager';
    this.enablePubSub = options.enablePubSub ?? true;
  }

  // ==========================================================================
  // Core Operations
  // ==========================================================================

  async isDenied(request: DenyCheckRequest): Promise<DenyCheckResult> {
    const keys = this.buildCheckKeys(request);

    // Fast path: Check Redis for any matching key
    for (const key of keys) {
      const cached = await this.redis.get(key);
      if (cached) {
        const entry = deserializeEntry(cached);

        // Check expiration
        if (entry.expiresAt && entry.expiresAt <= new Date()) {
          // Expired - delete from Redis
          await this.redis.del(key);
          continue;
        }

        this.stats.hits++;
        return {
          denied: true,
          entry,
          message: `Access denied: ${entry.reason}`,
        };
      }
    }

    // Slow path: Check PostgreSQL
    const dbResult = await this.postgres.isDenied(request);

    if (dbResult.denied && dbResult.entry) {
      // Warm cache with the found entry
      await this.cacheEntry(dbResult.entry);
      this.stats.misses++;
    }

    return dbResult;
  }

  async deny(input: DenyEntryCreate): Promise<DenyEntry> {
    // Write to PostgreSQL first (source of truth)
    const entry = await this.postgres.deny(input);

    // Cache in Redis
    await this.cacheEntry(entry);

    // Publish invalidation for other nodes
    if (this.enablePubSub) {
      await this.publishInvalidation(entry, 'deny');
    }

    this.stats.entries++;
    return entry;
  }

  async allow(
    tenantId: string,
    subjectType: DenySubjectType,
    subjectId: string,
    resourceType?: string,
    resourceId?: string,
  ): Promise<void> {
    // Remove from PostgreSQL
    await this.postgres.allow(tenantId, subjectType, subjectId, resourceType, resourceId);

    // Remove from Redis
    const key = buildKey(tenantId, subjectType, subjectId, resourceType, resourceId);
    await this.redis.del(key);

    // Publish invalidation
    if (this.enablePubSub) {
      await this.redis.publish(CHANNEL_INVALIDATE, JSON.stringify({ action: 'allow', key }));
    }

    this.stats.entries = Math.max(0, this.stats.entries - 1);
  }

  async allowById(id: string): Promise<void> {
    // Get entry from PostgreSQL to know the cache key
    const entry = await this.postgres.get(id);
    if (entry) {
      await this.postgres.allowById(id);
      const key = buildKeyFromEntry(entry);
      await this.redis.del(key);

      if (this.enablePubSub) {
        await this.redis.publish(CHANNEL_INVALIDATE, JSON.stringify({ action: 'allow', key }));
      }
    }
  }

  // ==========================================================================
  // Query Operations
  // ==========================================================================

  async get(id: string): Promise<DenyEntry | null> {
    // Query PostgreSQL (source of truth for ID lookups)
    return this.postgres.get(id);
  }

  async list(tenantId: string, filter?: DenyEntryFilter): Promise<DenyEntry[]> {
    // List from PostgreSQL (source of truth)
    return this.postgres.list(tenantId, filter);
  }

  async count(tenantId: string, filter?: DenyEntryFilter): Promise<number> {
    // Count from PostgreSQL (source of truth)
    return this.postgres.count(tenantId, filter);
  }

  // ==========================================================================
  // Bulk Operations
  // ==========================================================================

  async denyBatch(entries: DenyEntryCreate[]): Promise<DenyEntry[]> {
    // Write to PostgreSQL
    const created = await this.postgres.denyBatch(entries);

    // Cache all in Redis (pipeline for efficiency)
    const pipeline: Promise<unknown>[] = [];
    for (const entry of created) {
      pipeline.push(this.cacheEntry(entry));
    }
    await Promise.all(pipeline);

    // Publish invalidations
    if (this.enablePubSub) {
      await this.redis.publish(
        CHANNEL_INVALIDATE,
        JSON.stringify({ action: 'denyBatch', count: created.length }),
      );
    }

    this.stats.entries += created.length;
    return created;
  }

  async allowBatch(ids: string[]): Promise<void> {
    // Get entries to know cache keys
    const entries = await Promise.all(ids.map((id) => this.postgres.get(id)));

    // Remove from PostgreSQL
    await this.postgres.allowBatch(ids);

    // Remove from Redis
    const keys = entries.filter(Boolean).map((e) => buildKeyFromEntry(e!));
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }

    if (this.enablePubSub) {
      await this.redis.publish(
        CHANNEL_INVALIDATE,
        JSON.stringify({ action: 'allowBatch', count: ids.length }),
      );
    }

    this.stats.entries = Math.max(0, this.stats.entries - ids.length);
  }

  // ==========================================================================
  // Maintenance Operations
  // ==========================================================================

  async cleanupExpired(): Promise<number> {
    // Cleanup PostgreSQL
    const count = await this.postgres.cleanupExpired();

    // Cleanup Redis (scan for expired entries)
    await this.cleanupExpiredRedis();

    return count;
  }

  async getStats(tenantId?: string): Promise<DenyLedgerStats> {
    const pgStats = await this.postgres.getStats(tenantId);

    // Calculate cache hit rate
    const total = this.stats.hits + this.stats.misses;
    const hitRate = total > 0 ? this.stats.hits / total : 0;

    return {
      ...pgStats,
      cacheHitRate: hitRate,
      cacheSize: this.stats.entries,
    };
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  async initialize(): Promise<void> {
    // Initialize PostgreSQL
    await this.postgres.initialize();

    // Set up pub/sub subscriber
    if (this.enablePubSub) {
      await this.setupSubscriber();
    }

    // Warm cache based on mode
    if (this.warmupMode === 'eager') {
      await this.warmCache();
    }

    this.initialized = true;
  }

  async close(): Promise<void> {
    // Unsubscribe and close subscriber
    if (this.subscriber) {
      await this.subscriber.unsubscribe(CHANNEL_INVALIDATE);
      this.subscriber.disconnect();
      this.subscriber = null;
    }

    await this.postgres.close();
    this.initialized = false;
  }

  async sync(tenantId?: string): Promise<void> {
    if (tenantId) {
      // Sync specific tenant
      const entries = await this.postgres.loadAll(tenantId);
      for (const entry of entries) {
        await this.cacheEntry(entry);
      }
    } else {
      // Full sync
      await this.warmCache();
    }
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /**
   * Build all keys to check for a request (in priority order)
   */
  private buildCheckKeys(request: DenyCheckRequest): string[] {
    const keys: string[] = [];

    // 1. Exact match (if resource specified)
    if (request.resourceType && request.resourceId) {
      keys.push(
        buildKey(
          request.tenantId,
          request.subjectType,
          request.subjectId,
          request.resourceType,
          request.resourceId,
        ),
      );
    }

    // 2. Resource-type match (if resourceId provided)
    if (request.resourceId && request.resourceType) {
      keys.push(
        buildKey(request.tenantId, request.subjectType, request.subjectId, request.resourceType),
      );
    }

    // 3. Subject-level (no resource)
    keys.push(buildKey(request.tenantId, request.subjectType, request.subjectId));

    // 4. Tenant-wide (if not checking tenant subject)
    if (request.subjectType !== 'tenant') {
      keys.push(buildKey(request.tenantId, 'tenant', request.tenantId));
    }

    return keys;
  }

  /**
   * Cache entry in Redis with TTL
   */
  private async cacheEntry(entry: DenyEntry): Promise<void> {
    const key = buildKeyFromEntry(entry);
    const value = serializeEntry(entry);

    // Calculate TTL based on entry expiration or default
    let ttl = this.ttlSeconds;
    if (entry.expiresAt) {
      const expiresIn = Math.floor((entry.expiresAt.getTime() - Date.now()) / 1000);
      if (expiresIn > 0) {
        ttl = Math.min(ttl, expiresIn);
      } else {
        // Already expired, don't cache
        return;
      }
    }

    await this.redis.setex(key, ttl, value);
  }

  /**
   * Warm cache from PostgreSQL
   */
  private async warmCache(): Promise<void> {
    // Load all active entries from PostgreSQL
    const entries = await this.postgres.loadAll('');

    // Batch set in Redis
    if (entries.length > 0) {
      const pipeline: Promise<unknown>[] = [];
      for (const entry of entries) {
        pipeline.push(this.cacheEntry(entry));
      }
      await Promise.all(pipeline);
    }

    this.stats.entries = entries.length;
  }

  /**
   * Set up pub/sub subscriber for invalidations
   */
  private async setupSubscriber(): Promise<void> {
    // Duplicate connection for subscriber (Redis requirement)
    this.subscriber = this.redis.duplicate();

    // Handle invalidation messages
    this.subscriber.on('message', (channel: string, message: string) => {
      if (channel === CHANNEL_INVALIDATE) {
        this.handleInvalidation(message).catch((err) => {
          console.error('Failed to handle deny ledger invalidation:', err);
        });
      }
    });

    await this.subscriber.subscribe(CHANNEL_INVALIDATE);
  }

  /**
   * Handle invalidation message from pub/sub
   */
  private async handleInvalidation(message: string): Promise<void> {
    try {
      const data = JSON.parse(message);

      switch (data.action) {
        case 'allow':
          // Key already removed by publisher, just update stats
          this.stats.entries = Math.max(0, this.stats.entries - 1);
          break;

        case 'deny':
          // Entry already cached by publisher, just update stats
          this.stats.entries++;
          break;

        case 'denyBatch':
        case 'allowBatch':
          // Refresh from PostgreSQL for batch operations
          await this.warmCache();
          break;
      }
    } catch {
      // Ignore malformed messages
    }
  }

  /**
   * Publish invalidation message
   */
  private async publishInvalidation(entry: DenyEntry, action: 'deny' | 'allow'): Promise<void> {
    await this.redis.publish(
      CHANNEL_INVALIDATE,
      JSON.stringify({
        action,
        key: buildKeyFromEntry(entry),
        entryId: entry.id,
      }),
    );
  }

  /**
   * Cleanup expired entries from Redis
   */
  private async cleanupExpiredRedis(): Promise<void> {
    // Use SCAN to iterate through keys
    let cursor = '0';
    do {
      const [nextCursor, keys] = await this.redis.scan(
        cursor,
        'MATCH',
        `${KEY_PREFIX}*`,
        'COUNT',
        100,
      );
      cursor = nextCursor;

      for (const key of keys) {
        const value = await this.redis.get(key);
        if (value) {
          const entry = deserializeEntry(value);
          if (entry.expiresAt && entry.expiresAt <= new Date()) {
            await this.redis.del(key);
            this.stats.entries = Math.max(0, this.stats.entries - 1);
          }
        }
      }
    } while (cursor !== '0');
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  /**
   * Check if provider is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { hits: number; misses: number; hitRate: number; entries: number } {
    const total = this.stats.hits + this.stats.misses;
    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate: total > 0 ? this.stats.hits / total : 0,
      entries: this.stats.entries,
    };
  }

  /**
   * Reset cache statistics
   */
  resetStats(): void {
    this.stats.hits = 0;
    this.stats.misses = 0;
  }

  /**
   * Force refresh cache for a tenant
   */
  async refreshTenant(tenantId: string): Promise<void> {
    // Clear existing tenant keys
    const pattern = buildTenantPattern(tenantId);
    const keys = await this.redis.keys(pattern);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }

    // Reload from PostgreSQL
    const entries = await this.postgres.loadAll(tenantId);
    for (const entry of entries) {
      await this.cacheEntry(entry);
    }
  }
}
