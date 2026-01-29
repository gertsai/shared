/**
 * Deny Ledger Interface (RFC-042)
 *
 * Abstract interface for deny ledger providers.
 * Implementations must provide persistent storage for access denials.
 *
 * Security Requirements:
 * - Denials MUST survive service restart
 * - Check operations MUST be fast (< 1ms for cache hit)
 * - Multi-tenant isolation MUST be enforced
 *
 * @see RFC-042 Appendix I.5 - Deny Ledger Architecture
 */

import type {
  DenyEntry,
  DenyEntryCreate,
  DenyCheckRequest,
  DenyCheckResult,
  DenyEntryFilter,
  DenyLedgerStats,
  DenySubjectType,
} from './types';

/**
 * Deny Ledger Provider Interface
 *
 * Implementations:
 * - MemoryDenyLedger: In-memory LRU + PostgreSQL (OSS)
 * - RedisDenyLedger: Redis primary + PostgreSQL (Enterprise)
 * - PostgresDenyLedger: PostgreSQL only (max durability)
 * - HybridDenyLedger: Combines cache + persistent providers
 */
export interface DenyLedgerProvider {
  // ==========================================================================
  // Core Operations
  // ==========================================================================

  /**
   * Check if access is denied for a subject
   *
   * This is the hot path - called on every request.
   * Must be fast (< 1ms for cache hit).
   *
   * Check order:
   * 1. Exact match (subjectType + subjectId + resourceType + resourceId)
   * 2. Resource-type match (subjectType + subjectId + resourceType)
   * 3. Global match (subjectType + subjectId only)
   * 4. Tenant-wide match (if subject is tenant)
   *
   * @param request - The deny check request
   * @returns Check result with denied flag and optional entry
   */
  isDenied(request: DenyCheckRequest): Promise<DenyCheckResult>;

  /**
   * Add a deny entry to the ledger
   *
   * @param entry - Entry to add (id and createdAt are auto-generated)
   * @returns The created entry with id and createdAt
   */
  deny(entry: DenyEntryCreate): Promise<DenyEntry>;

  /**
   * Remove a deny entry (allow access again)
   *
   * @param tenantId - Tenant context
   * @param subjectType - Type of subject
   * @param subjectId - Subject identifier
   * @param resourceType - Optional: specific resource type
   * @param resourceId - Optional: specific resource
   */
  allow(
    tenantId: string,
    subjectType: DenySubjectType,
    subjectId: string,
    resourceType?: string,
    resourceId?: string,
  ): Promise<void>;

  /**
   * Remove a deny entry by ID
   *
   * @param id - Entry ID to remove
   */
  allowById(id: string): Promise<void>;

  // ==========================================================================
  // Query Operations
  // ==========================================================================

  /**
   * Get a deny entry by ID
   *
   * @param id - Entry ID
   * @returns Entry or null if not found
   */
  get(id: string): Promise<DenyEntry | null>;

  /**
   * List deny entries for a tenant
   *
   * @param tenantId - Tenant context
   * @param filter - Optional filters
   * @returns List of matching entries
   */
  list(tenantId: string, filter?: DenyEntryFilter): Promise<DenyEntry[]>;

  /**
   * Count deny entries for a tenant
   *
   * @param tenantId - Tenant context
   * @param filter - Optional filters
   * @returns Count of matching entries
   */
  count(tenantId: string, filter?: DenyEntryFilter): Promise<number>;

  // ==========================================================================
  // Bulk Operations
  // ==========================================================================

  /**
   * Add multiple deny entries
   *
   * @param entries - Entries to add
   * @returns Created entries
   */
  denyBatch(entries: DenyEntryCreate[]): Promise<DenyEntry[]>;

  /**
   * Remove multiple deny entries by ID
   *
   * @param ids - Entry IDs to remove
   */
  allowBatch(ids: string[]): Promise<void>;

  // ==========================================================================
  // Maintenance Operations
  // ==========================================================================

  /**
   * Remove expired entries
   *
   * Should be called periodically (e.g., every minute).
   *
   * @returns Number of entries removed
   */
  cleanupExpired(): Promise<number>;

  /**
   * Get statistics
   *
   * @param tenantId - Optional tenant filter
   * @returns Ledger statistics
   */
  getStats(tenantId?: string): Promise<DenyLedgerStats>;

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  /**
   * Initialize the provider
   *
   * For cache-based providers, this loads entries from persistent storage.
   * Must be called before using the provider.
   */
  initialize(): Promise<void>;

  /**
   * Gracefully shutdown the provider
   *
   * Flushes pending writes and closes connections.
   */
  close(): Promise<void>;

  /**
   * Force sync from persistent storage
   *
   * Useful for disaster recovery or manual refresh.
   *
   * @param tenantId - Optional tenant filter
   */
  sync(tenantId?: string): Promise<void>;
}

/**
 * Factory function type for creating deny ledger providers
 */
export type DenyLedgerFactory = (config: unknown) => DenyLedgerProvider;

/**
 * Type guard for DenyLedgerProvider
 */
export function isDenyLedgerProvider(obj: unknown): obj is DenyLedgerProvider {
  if (!obj || typeof obj !== 'object') return false;
  const provider = obj as Partial<DenyLedgerProvider>;
  return (
    typeof provider.isDenied === 'function' &&
    typeof provider.deny === 'function' &&
    typeof provider.allow === 'function' &&
    typeof provider.initialize === 'function' &&
    typeof provider.close === 'function'
  );
}
