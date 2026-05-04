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
 * LRU Node for doubly-linked list
 */
interface LRUNode {
  key: string;
  entry: DenyEntry;
  prev: LRUNode | null;
  next: LRUNode | null;
}

/**
 * Memory-based Deny Ledger Provider
 *
 * Uses LRU cache for O(1) lookups with automatic eviction.
 */
export class MemoryDenyLedger implements DenyLedgerProvider {
  private readonly maxSize: number;
  private readonly cache: Map<string, LRUNode> = new Map();
  private readonly byId: Map<string, DenyEntry> = new Map();
  private head: LRUNode | null = null;
  private tail: LRUNode | null = null;
  private initialized = false;

  // Stats
  private hits = 0;
  private misses = 0;

  constructor(config?: Partial<DenyLedgerConfig>) {
    this.maxSize = config?.maxCacheSize ?? DEFAULT_DENY_LEDGER_CONFIG.maxCacheSize;
  }

  // ==========================================================================
  // LRU Operations (private)
  // ==========================================================================

  private moveToHead(node: LRUNode): void {
    if (node === this.head) return;

    // Remove from current position
    if (node.prev) node.prev.next = node.next;
    if (node.next) node.next.prev = node.prev;
    if (node === this.tail) this.tail = node.prev;

    // Move to head
    node.prev = null;
    node.next = this.head;
    if (this.head) this.head.prev = node;
    this.head = node;
    if (!this.tail) this.tail = node;
  }

  private addToHead(node: LRUNode): void {
    node.prev = null;
    node.next = this.head;
    if (this.head) this.head.prev = node;
    this.head = node;
    if (!this.tail) this.tail = node;
  }

  private removeTail(): LRUNode | null {
    if (!this.tail) return null;
    const node = this.tail;
    this.tail = node.prev;
    if (this.tail) this.tail.next = null;
    if (node === this.head) this.head = null;
    return node;
  }

  private removeNode(node: LRUNode): void {
    if (node.prev) node.prev.next = node.next;
    if (node.next) node.next.prev = node.prev;
    if (node === this.head) this.head = node.next;
    if (node === this.tail) this.tail = node.prev;
  }

  private evictIfNeeded(): void {
    while (this.cache.size >= this.maxSize) {
      const removed = this.removeTail();
      if (removed) {
        this.cache.delete(removed.key);
        this.byId.delete(removed.entry.id);
      }
    }
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
      const node = this.cache.get(key);
      if (node) {
        const entry = node.entry;

        // Check expiration
        if (entry.expiresAt && entry.expiresAt < now) {
          // Expired - remove and continue
          this.removeNode(node);
          this.cache.delete(key);
          this.byId.delete(entry.id);
          continue;
        }

        // Found active denial
        this.hits++;
        this.moveToHead(node);

        return {
          denied: true,
          entry,
          message: `Access denied: ${entry.reason}`,
        };
      }
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

    // Evict if needed
    this.evictIfNeeded();

    // Check if exists
    const existing = this.cache.get(key);
    if (existing) {
      // Update existing
      existing.entry = entry;
      this.byId.set(entry.id, entry);
      this.moveToHead(existing);
    } else {
      // Add new
      const node: LRUNode = { key, entry, prev: null, next: null };
      this.cache.set(key, node);
      this.byId.set(entry.id, entry);
      this.addToHead(node);
    }

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
    const node = this.cache.get(key);
    if (node) {
      this.removeNode(node);
      this.cache.delete(key);
      this.byId.delete(node.entry.id);
    }
  }

  async allowById(id: string): Promise<void> {
    const entry = this.byId.get(id);
    if (entry) {
      const key = buildKey(
        entry.tenantId,
        entry.subjectType,
        entry.subjectId,
        entry.resourceType,
        entry.resourceId,
      );
      const node = this.cache.get(key);
      if (node) {
        this.removeNode(node);
        this.cache.delete(key);
      }
      this.byId.delete(id);
    }
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

    for (const [key, node] of this.cache.entries()) {
      if (node.entry.expiresAt && node.entry.expiresAt < now) {
        this.removeNode(node);
        this.cache.delete(key);
        this.byId.delete(node.entry.id);
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
    this.head = null;
    this.tail = null;
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
      if (this.cache.has(key)) continue;

      this.evictIfNeeded();

      const node: LRUNode = { key, entry, prev: null, next: null };
      this.cache.set(key, node);
      this.byId.set(entry.id, entry);
      this.addToHead(node);
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
  }

  /**
   * Check if initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }
}
