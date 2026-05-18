// Wave 14.2 (PRD-044 / EVID-057): MemoryDenyLedger now consumes the
// canonical core/lru-cache.LRUCache instead of inlining doubly-linked-
// list logic. Same-package consolidation — no cross-tier impact.

/**
 * Memory Deny Ledger Provider
 *
 * In-memory LRU cache implementation for OSS single-node deployments.
 *
 * Characteristics:
 * - Fast reads (< 0.1ms)
 * - Data lost on restart (use with HybridProvider for persistence)
 * - LRU eviction when maxSize reached
 * - Automatic expired entry cleanup
 *
 * @see RFC-042 Appendix I.5
 */

import { randomUUID } from 'crypto';
import { LRUCache, toCacheKey } from '../../lru-cache';
import type { DenyLedgerProvider } from '../interface';
import type {
  DenyEntry,
  DenyEntryCreate,
  DenyCheckRequest,
  DenyCheckResult,
  DenyEntryFilter,
  DenyLedgerStats,
  DenySubjectType,
  DenyReason,
  DenyLedgerConfig,
} from '../types';
import { DEFAULT_DENY_LEDGER_CONFIG } from '../types';

/**
 * Build a cache key for fast lookup
 */
function buildKey(
  tenantId: string,
  subjectType: DenySubjectType,
  subjectId: string,
  resourceType?: string,
  resourceId?: string,
): string {
  const parts = [tenantId, subjectType, subjectId];
  if (resourceType) parts.push(resourceType);
  if (resourceId) parts.push(resourceId);
  return parts.join(':');
}

/**
 * Memory-based Deny Ledger Provider.
 *
 * Backed by the shared {@link LRUCache} primitive for O(1) lookups with
 * automatic capacity eviction. Entry-level expiration is enforced by
 * `DenyEntry.expiresAt` (Date) rather than `LRUCache`'s numeric TTL, so
 * semantics match the pre-Wave-14 inline implementation. Hit/miss counters
 * are tracked at the ledger level (denial-checks, not per-key probes).
 */
export class MemoryDenyLedger implements DenyLedgerProvider {
  private readonly cache: LRUCache<DenyEntry>;
  private readonly byId: Map<string, DenyEntry> = new Map();
  private initialized = false;

  // Stats (denial-check level, not per-key cache probe)
  private hits = 0;
  private misses = 0;

  constructor(config?: Partial<DenyLedgerConfig>) {
    const maxSize = config?.maxCacheSize ?? DEFAULT_DENY_LEDGER_CONFIG.maxCacheSize;
    this.cache = new LRUCache<DenyEntry>({
      maxSize,
      // Keep secondary byId index in sync on every eviction trigger
      // (capacity/ttl/pattern/manual). Guard against same-key overwrite races:
      // only drop byId when it still points to THIS evicted entry instance.
      onEvict: (_key, value) => {
        const entry = value as DenyEntry;
        if (this.byId.get(entry.id) === entry) this.byId.delete(entry.id);
      },
    });
  }

  // ==========================================================================
  // Core Operations
  // ==========================================================================

  async isDenied(request: DenyCheckRequest): Promise<DenyCheckResult> {
    // Check order: exact → resource-type → global → tenant
    const checks = [
      // 1. Exact match
      buildKey(
        request.tenantId,
        request.subjectType,
        request.subjectId,
        request.resourceType,
        request.resourceId,
      ),
      // 2. Resource-type match (if resourceId provided)
      request.resourceId
        ? buildKey(request.tenantId, request.subjectType, request.subjectId, request.resourceType)
        : null,
      // 3. Global match (subject only)
      buildKey(request.tenantId, request.subjectType, request.subjectId),
      // 4. Tenant-wide (if checking non-tenant subject)
      request.subjectType !== 'tenant'
        ? buildKey(request.tenantId, 'tenant', request.tenantId)
        : null,
    ].filter((k): k is string => k !== null);

    const now = new Date();

    for (const key of checks) {
      // Peek first to avoid promoting LRU position on a miss-then-match
      // chain (we only want to promote the key that actually matched).
      const entry = this.cache.peek(toCacheKey(key));
      if (!entry) continue;

      // Check expiration (semantics: DenyEntry.expiresAt is canonical, not
      // LRUCache's internal TTL)
      if (entry.expiresAt && entry.expiresAt < now) {
        // Expired - remove and continue checking subsequent keys
        this.cache.delete(toCacheKey(key));
        // byId is removed via onEvict callback
        continue;
      }

      // Found active denial — promote this key to MRU position via get()
      this.cache.get(toCacheKey(key));
      this.hits++;

      return {
        denied: true,
        entry,
        message: `Access denied: ${entry.reason}`,
      };
    }

    this.misses++;
    return { denied: false };
  }

  async deny(input: DenyEntryCreate): Promise<DenyEntry> {
    const entry: DenyEntry = {
      ...input,
      id: randomUUID(),
      createdAt: new Date(),
    };

    const key = buildKey(
      entry.tenantId,
      entry.subjectType,
      entry.subjectId,
      entry.resourceType,
      entry.resourceId,
    );

    // Update byId BEFORE cache.set so that if set triggers a capacity
    // eviction, the onEvict handler sees byId in its expected state for
    // the evicted (old) entry. The newly-inserted entry's byId mapping
    // is set right after.
    const existingNode = this.cache.peek(toCacheKey(key));
    if (existingNode) {
      // Same-key overwrite: clear stale byId entry first so the new id
      // replaces the old without triggering the onEvict same-instance
      // guard incorrectly.
      this.byId.delete(existingNode.id);
    }
    this.byId.set(entry.id, entry);
    this.cache.set(toCacheKey(key), entry);

    return entry;
  }

  async allow(
    tenantId: string,
    subjectType: DenySubjectType,
    subjectId: string,
    resourceType?: string,
    resourceId?: string,
  ): Promise<void> {
    const key = buildKey(tenantId, subjectType, subjectId, resourceType, resourceId);
    this.cache.delete(toCacheKey(key));
    // byId cleanup via onEvict
  }

  async allowById(id: string): Promise<void> {
    const entry = this.byId.get(id);
    if (!entry) return;
    const key = buildKey(
      entry.tenantId,
      entry.subjectType,
      entry.subjectId,
      entry.resourceType,
      entry.resourceId,
    );
    this.cache.delete(toCacheKey(key));
    // Force byId cleanup in case the cache key didn't match (defensive)
    this.byId.delete(id);
  }

  // ==========================================================================
  // Query Operations
  // ==========================================================================

  async get(id: string): Promise<DenyEntry | null> {
    return this.byId.get(id) ?? null;
  }

  async list(tenantId: string, filter?: DenyEntryFilter): Promise<DenyEntry[]> {
    const now = new Date();
    const results: DenyEntry[] = [];

    for (const entry of this.byId.values()) {
      // Tenant filter
      if (entry.tenantId !== tenantId) continue;

      // Expiration filter
      if (!filter?.includeExpired && entry.expiresAt && entry.expiresAt < now) {
        continue;
      }

      // Other filters
      if (filter?.subjectType && entry.subjectType !== filter.subjectType) continue;
      if (filter?.subjectId && entry.subjectId !== filter.subjectId) continue;
      if (filter?.reason && entry.reason !== filter.reason) continue;
      if (filter?.resourceType && entry.resourceType !== filter.resourceType) continue;
      if (filter?.resourceId && entry.resourceId !== filter.resourceId) continue;

      results.push(entry);
    }

    // Sort by createdAt desc
    results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    // Pagination
    const offset = filter?.offset ?? 0;
    const limit = filter?.limit ?? 100;
    return results.slice(offset, offset + limit);
  }

  async count(tenantId: string, filter?: DenyEntryFilter): Promise<number> {
    const entries = await this.list(tenantId, { ...filter, limit: Number.MAX_SAFE_INTEGER });
    return entries.length;
  }

  // ==========================================================================
  // Bulk Operations
  // ==========================================================================

  async denyBatch(entries: DenyEntryCreate[]): Promise<DenyEntry[]> {
    const results: DenyEntry[] = [];
    for (const entry of entries) {
      results.push(await this.deny(entry));
    }
    return results;
  }

  async allowBatch(ids: string[]): Promise<void> {
    for (const id of ids) {
      await this.allowById(id);
    }
  }

  // ==========================================================================
  // Maintenance Operations
  // ==========================================================================

  async cleanupExpired(): Promise<number> {
    const now = new Date();
    let removed = 0;

    // Snapshot keys first since deletion mutates the underlying cache
    const keys = this.cache.keys();
    for (const key of keys) {
      const entry = this.cache.peek(toCacheKey(key));
      if (entry?.expiresAt && entry.expiresAt < now) {
        this.cache.delete(toCacheKey(key));
        // byId cleanup via onEvict
        removed++;
      }
    }

    return removed;
  }

  async getStats(tenantId?: string): Promise<DenyLedgerStats> {
    const bySubjectType: Record<DenySubjectType, number> = {
      user: 0,
      session: 0,
      certificate: 0,
      'api-key': 0,
      tenant: 0,
      'ip-address': 0,
      email: 0,
    };

    const byReason: Record<DenyReason, number> = {
      revoked: 0,
      expired: 0,
      suspended: 0,
      'brute-force': 0,
      'certificate-revoked': 0,
      'manual-block': 0,
      'policy-violation': 0,
      'security-incident': 0,
    };

    let total = 0;

    for (const entry of this.byId.values()) {
      if (tenantId && entry.tenantId !== tenantId) continue;
      total++;
      bySubjectType[entry.subjectType]++;
      byReason[entry.reason]++;
    }

    const totalChecks = this.hits + this.misses;
    const cacheHitRate = totalChecks > 0 ? this.hits / totalChecks : 0;

    return {
      totalEntries: total,
      bySubjectType,
      byReason,
      cacheHitRate,
      cacheSize: this.cache.size,
    };
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  async initialize(): Promise<void> {
    // Memory provider has nothing to initialize
    this.initialized = true;
  }

  async close(): Promise<void> {
    this.cache.clear();
    this.byId.clear();
    this.initialized = false;
  }

  async sync(_tenantId?: string): Promise<void> {
    // Memory provider has nothing to sync
    // HybridProvider will use this to reload from PostgreSQL
  }

  // ==========================================================================
  // Memory-specific Methods
  // ==========================================================================

  /**
   * Import entries from external source (e.g., PostgreSQL)
   * Used by HybridProvider during initialization
   */
  importEntries(entries: DenyEntry[]): void {
    for (const entry of entries) {
      const key = buildKey(
        entry.tenantId,
        entry.subjectType,
        entry.subjectId,
        entry.resourceType,
        entry.resourceId,
      );

      // Skip if already exists
      if (this.cache.has(toCacheKey(key))) continue;

      this.byId.set(entry.id, entry);
      this.cache.set(toCacheKey(key), entry);
    }
  }

  /**
   * Export all entries (for persistence)
   */
  exportEntries(): DenyEntry[] {
    return Array.from(this.byId.values());
  }

  /**
   * Reset cache stats
   */
  resetStats(): void {
    this.hits = 0;
    this.misses = 0;
    this.cache.resetStats();
  }

  /**
   * Check if initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }
}
