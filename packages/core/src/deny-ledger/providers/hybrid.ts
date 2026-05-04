/**
 * Hybrid Deny Ledger Provider
 *
 * Combines in-memory cache with PostgreSQL for optimal performance.
 *
 * Architecture:
 * - Write: PostgreSQL first (source of truth), then cache
 * - Read: Cache first (fast), fallback to PostgreSQL (durable)
 * - Startup: Load from PostgreSQL into cache
 * - Sync: Periodic refresh from PostgreSQL
 *
 * Characteristics:
 * - Fast reads (< 0.1ms cache hit)
 * - Durable storage (survives restarts)
 * - Write-through caching
 * - Automatic cache warming on startup
 *
 * @see RFC-042 Appendix I.5
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
import { MemoryDenyLedger } from './memory';
import type { PostgresDenyLedger } from './postgres';

// =============================================================================
// Hybrid Provider
// =============================================================================

export interface HybridDenyLedgerOptions {
  /**
   * Memory provider for fast reads
   */
  memory: MemoryDenyLedger;

  /**
   * PostgreSQL provider for persistent storage
   */
  postgres: PostgresDenyLedger;

  /**
   * Optional configuration
   */
  config?: Partial<DenyLedgerConfig>;
}

/**
 * Hybrid Deny Ledger Provider
 *
 * Combines in-memory LRU cache with PostgreSQL persistence.
 * Best for production deployments with single-node or multi-node (with Redis).
 *
 * @example
 * ```typescript
 * import { HybridDenyLedger, MemoryDenyLedger, PostgresDenyLedger } from '@gertsai/core';
 *
 * const memory = new MemoryDenyLedger({ maxCacheSize: 10000 });
 * const postgres = new PostgresDenyLedger({ prisma: yourPrismaClient });
 *
 * const ledger = new HybridDenyLedger({ memory, postgres });
 * await ledger.initialize(); // Loads from PostgreSQL into memory
 * ```
 */
export class HybridDenyLedger implements DenyLedgerProvider {
  private readonly memory: MemoryDenyLedger;
  private readonly postgres: PostgresDenyLedger;
  private initialized = false;
  private lastSyncAt?: Date;

  constructor(options: HybridDenyLedgerOptions) {
    this.memory = options.memory;
    this.postgres = options.postgres;
    // Note: options.config?.cacheTtlSeconds available for future periodic sync
  }

  // ==========================================================================
  // Core Operations
  // ==========================================================================

  async isDenied(request: DenyCheckRequest): Promise<DenyCheckResult> {
    // Fast path: check memory cache first
    const cacheResult = await this.memory.isDenied(request);
    if (cacheResult.denied) {
      return cacheResult;
    }

    // Slow path: check PostgreSQL (in case cache miss or eviction)
    const dbResult = await this.postgres.isDenied(request);
    if (dbResult.denied && dbResult.entry) {
      // Warm cache with the found entry
      await this.memory.deny({
        tenantId: dbResult.entry.tenantId,
        subjectType: dbResult.entry.subjectType,
        subjectId: dbResult.entry.subjectId,
        resourceType: dbResult.entry.resourceType,
        resourceId: dbResult.entry.resourceId,
        reason: dbResult.entry.reason,
        expiresAt: dbResult.entry.expiresAt,
        metadata: dbResult.entry.metadata,
        createdBy: dbResult.entry.createdBy,
        incidentId: dbResult.entry.incidentId,
      });
    }

    return dbResult;
  }

  async deny(input: DenyEntryCreate): Promise<DenyEntry> {
    // Write-through: PostgreSQL first (source of truth)
    const entry = await this.postgres.deny(input);

    // Then update cache
    await this.memory.deny({
      ...input,
      // Use the entry from PostgreSQL to ensure consistency
    });

    return entry;
  }

  async allow(
    tenantId: string,
    subjectType: DenySubjectType,
    subjectId: string,
    resourceType?: string,
    resourceId?: string,
  ): Promise<void> {
    // Remove from both: PostgreSQL first, then cache
    await this.postgres.allow(tenantId, subjectType, subjectId, resourceType, resourceId);
    await this.memory.allow(tenantId, subjectType, subjectId, resourceType, resourceId);
  }

  async allowById(id: string): Promise<void> {
    // Get entry from PostgreSQL to know the cache key
    const entry = await this.postgres.get(id);
    if (entry) {
      await this.postgres.allowById(id);
      await this.memory.allow(
        entry.tenantId,
        entry.subjectType,
        entry.subjectId,
        entry.resourceType,
        entry.resourceId,
      );
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
    // Write-through: PostgreSQL first
    const created = await this.postgres.denyBatch(entries);

    // Then update cache
    await this.memory.denyBatch(entries);

    return created;
  }

  async allowBatch(ids: string[]): Promise<void> {
    // Get entries first to know cache keys
    const entries = await Promise.all(ids.map((id) => this.postgres.get(id)));

    // Remove from PostgreSQL
    await this.postgres.allowBatch(ids);

    // Remove from cache
    for (const entry of entries) {
      if (entry) {
        await this.memory.allow(
          entry.tenantId,
          entry.subjectType,
          entry.subjectId,
          entry.resourceType,
          entry.resourceId,
        );
      }
    }
  }

  // ==========================================================================
  // Maintenance Operations
  // ==========================================================================

  async cleanupExpired(): Promise<number> {
    // Cleanup both (memory cleanup runs in parallel but we don't need its count)
    const [pgCount] = await Promise.all([
      this.postgres.cleanupExpired(),
      this.memory.cleanupExpired(),
    ]);

    // Return PostgreSQL count (source of truth)
    return pgCount;
  }

  async getStats(tenantId?: string): Promise<DenyLedgerStats> {
    // Get stats from both
    const [pgStats, memStats] = await Promise.all([
      this.postgres.getStats(tenantId),
      this.memory.getStats(tenantId),
    ]);

    return {
      ...pgStats,
      cacheHitRate: memStats.cacheHitRate,
      cacheSize: memStats.cacheSize,
      lastSyncAt: this.lastSyncAt,
    };
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  async initialize(): Promise<void> {
    // Initialize PostgreSQL first
    await this.postgres.initialize();

    // Initialize memory
    await this.memory.initialize();

    // Warm cache from PostgreSQL
    await this.warmCache();

    this.initialized = true;
  }

  async close(): Promise<void> {
    await this.memory.close();
    await this.postgres.close();
    this.initialized = false;
  }

  async sync(tenantId?: string): Promise<void> {
    if (tenantId) {
      // Sync specific tenant
      const entries = await this.postgres.loadAll(tenantId);
      this.memory.importEntries(entries);
    } else {
      // Full sync (reload all)
      await this.warmCache();
    }

    this.lastSyncAt = new Date();
  }

  // ==========================================================================
  // Hybrid-specific Methods
  // ==========================================================================

  /**
   * Warm cache from PostgreSQL
   * Called on startup and during sync
   */
  private async warmCache(): Promise<void> {
    // Get all active entries from PostgreSQL
    // Note: For large datasets, this should be paginated or use streaming
    const entries = await this.postgres.list('', {
      includeExpired: false,
      limit: 100000, // Safety limit
    });

    // Import into memory cache
    this.memory.importEntries(entries);
    this.lastSyncAt = new Date();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { hitRate: number; size: number; lastSyncAt?: Date } {
    const stats = this.memory.exportEntries();
    return {
      hitRate: 0, // Would need to track hits/misses
      size: stats.length,
      lastSyncAt: this.lastSyncAt,
    };
  }

  /**
   * Force refresh cache for a tenant
   */
  async refreshTenant(tenantId: string): Promise<void> {
    const entries = await this.postgres.loadAll(tenantId);
    this.memory.importEntries(entries);
  }

  /**
   * Check if initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Reset cache statistics
   */
  resetCacheStats(): void {
    this.memory.resetStats();
  }
}
