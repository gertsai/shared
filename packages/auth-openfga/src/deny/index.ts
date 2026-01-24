/**
 * Deny Layer for Instant Revoke
 *
 * Implements explicit deny semantics for instant permission revocation.
 * OpenFGA is allow-only (Zanzibar model), so we need a separate deny layer.
 *
 * Architecture:
 * - Redis for fast path (in-memory check)
 * - Optional Postgres persistence (survive restarts)
 *
 * Flow:
 * 1. Check deny ledger first (Redis)
 * 2. If denied, return false immediately
 * 3. Otherwise, proceed to OpenFGA check
 *
 * @module @gerts/auth-openfga/deny
 */

import type { FgaResourceType } from '../types.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Deny entry in the ledger.
 */
export interface DenyEntry {
  /** User or subject being denied */
  userId: string;
  /** Resource type */
  resourceType: FgaResourceType;
  /** Resource ID (or '*' for all resources of type) */
  resourceId: string;
  /** Relation being denied (or '*' for all relations) */
  relation: string;
  /** Reason for denial */
  reason: string;
  /** Who created this deny entry */
  deniedBy: string;
  /** When the deny was created */
  deniedAt: Date;
  /** When the deny expires (null = permanent) */
  expiresAt: Date | null;
}

/**
 * Deny check request.
 */
export interface DenyCheckRequest {
  userId: string;
  resourceType: FgaResourceType;
  resourceId: string;
  relation: string;
}

/**
 * Deny check result.
 */
export interface DenyCheckResult {
  denied: boolean;
  reason?: string;
  deniedAt?: Date;
  expiresAt?: Date | null;
}

// =============================================================================
// In-Memory Deny Ledger (for development/testing)
// =============================================================================

/**
 * Simple in-memory deny ledger.
 * Use RedisDenyLedger for production.
 */
export class InMemoryDenyLedger {
  private entries: Map<string, DenyEntry> = new Map();

  /**
   * Generates key for the ledger.
   */
  private makeKey(
    userId: string,
    resourceType: string,
    resourceId: string,
    relation: string,
  ): string {
    return `deny:${userId}:${resourceType}:${resourceId}:${relation}`;
  }

  /**
   * Adds a deny entry.
   */
  async deny(entry: DenyEntry): Promise<void> {
    const key = this.makeKey(entry.userId, entry.resourceType, entry.resourceId, entry.relation);
    this.entries.set(key, entry);
  }

  /**
   * Removes a deny entry.
   */
  async allow(
    userId: string,
    resourceType: FgaResourceType,
    resourceId: string,
    relation: string,
  ): Promise<boolean> {
    const key = this.makeKey(userId, resourceType, resourceId, relation);
    return this.entries.delete(key);
  }

  /**
   * Checks if access is denied.
   */
  async check(request: DenyCheckRequest): Promise<DenyCheckResult> {
    const now = new Date();

    // Check exact match
    const exactKey = this.makeKey(
      request.userId,
      request.resourceType,
      request.resourceId,
      request.relation,
    );
    const exactEntry = this.entries.get(exactKey);
    if (exactEntry && (!exactEntry.expiresAt || exactEntry.expiresAt > now)) {
      return {
        denied: true,
        reason: exactEntry.reason,
        deniedAt: exactEntry.deniedAt,
        expiresAt: exactEntry.expiresAt,
      };
    }

    // Check wildcard resource
    const wildcardResourceKey = this.makeKey(
      request.userId,
      request.resourceType,
      '*',
      request.relation,
    );
    const wildcardResourceEntry = this.entries.get(wildcardResourceKey);
    if (
      wildcardResourceEntry &&
      (!wildcardResourceEntry.expiresAt || wildcardResourceEntry.expiresAt > now)
    ) {
      return {
        denied: true,
        reason: wildcardResourceEntry.reason,
        deniedAt: wildcardResourceEntry.deniedAt,
        expiresAt: wildcardResourceEntry.expiresAt,
      };
    }

    // Check wildcard relation
    const wildcardRelationKey = this.makeKey(
      request.userId,
      request.resourceType,
      request.resourceId,
      '*',
    );
    const wildcardRelationEntry = this.entries.get(wildcardRelationKey);
    if (
      wildcardRelationEntry &&
      (!wildcardRelationEntry.expiresAt || wildcardRelationEntry.expiresAt > now)
    ) {
      return {
        denied: true,
        reason: wildcardRelationEntry.reason,
        deniedAt: wildcardRelationEntry.deniedAt,
        expiresAt: wildcardRelationEntry.expiresAt,
      };
    }

    // Check full wildcard (deny all for user on resource type)
    const fullWildcardKey = this.makeKey(request.userId, request.resourceType, '*', '*');
    const fullWildcardEntry = this.entries.get(fullWildcardKey);
    if (fullWildcardEntry && (!fullWildcardEntry.expiresAt || fullWildcardEntry.expiresAt > now)) {
      return {
        denied: true,
        reason: fullWildcardEntry.reason,
        deniedAt: fullWildcardEntry.deniedAt,
        expiresAt: fullWildcardEntry.expiresAt,
      };
    }

    return { denied: false };
  }

  /**
   * Lists all deny entries for a user.
   */
  async listForUser(userId: string): Promise<DenyEntry[]> {
    const results: DenyEntry[] = [];
    for (const [key, entry] of this.entries) {
      if (key.startsWith(`deny:${userId}:`)) {
        results.push(entry);
      }
    }
    return results;
  }

  /**
   * Clears all entries (for testing).
   */
  clear(): void {
    this.entries.clear();
  }

  /**
   * Returns count of entries.
   */
  size(): number {
    return this.entries.size;
  }
}

// =============================================================================
// Deny Ledger Interface
// =============================================================================

/**
 * Interface for deny ledger implementations.
 */
export interface DenyLedger {
  deny(entry: DenyEntry): Promise<void>;
  allow(
    userId: string,
    resourceType: FgaResourceType,
    resourceId: string,
    relation: string,
  ): Promise<boolean>;
  check(request: DenyCheckRequest): Promise<DenyCheckResult>;
  listForUser(userId: string): Promise<DenyEntry[]>;
}

// =============================================================================
// Singleton Instance
// =============================================================================

let denyLedger: DenyLedger | null = null;

/**
 * Gets or creates the deny ledger instance.
 */
export function getDenyLedger(): DenyLedger {
  if (!denyLedger) {
    // Default to in-memory for now
    // TODO: Switch to Redis-based implementation for production
    denyLedger = new InMemoryDenyLedger();
  }
  return denyLedger;
}

/**
 * Sets a custom deny ledger implementation.
 */
export function setDenyLedger(ledger: DenyLedger): void {
  denyLedger = ledger;
}

/**
 * Resets the deny ledger (for testing).
 */
export function resetDenyLedger(): void {
  denyLedger = null;
}

// =============================================================================
// Convenience Functions
// =============================================================================

/**
 * Denies access for a user to a resource.
 *
 * @example
 * ```typescript
 * // Deny user from viewing project immediately
 * await denyAccess({
 *   userId: 'user-123',
 *   resourceType: 'project',
 *   resourceId: 'project-456',
 *   relation: 'can_view',
 *   reason: 'Access revoked by admin',
 *   deniedBy: 'admin-user',
 * });
 * ```
 */
export async function denyAccess(
  entry: Omit<DenyEntry, 'deniedAt'> & { deniedAt?: Date },
): Promise<void> {
  const ledger = getDenyLedger();
  await ledger.deny({
    ...entry,
    deniedAt: entry.deniedAt ?? new Date(),
  });
}

/**
 * Removes a deny entry, restoring access.
 */
export async function restoreAccess(
  userId: string,
  resourceType: FgaResourceType,
  resourceId: string,
  relation: string,
): Promise<boolean> {
  const ledger = getDenyLedger();
  return ledger.allow(userId, resourceType, resourceId, relation);
}

/**
 * Checks if access is denied.
 */
export async function isDenied(request: DenyCheckRequest): Promise<DenyCheckResult> {
  const ledger = getDenyLedger();
  return ledger.check(request);
}

/**
 * Lists all deny entries for a user.
 */
export async function listDeniedAccess(userId: string): Promise<DenyEntry[]> {
  const ledger = getDenyLedger();
  return ledger.listForUser(userId);
}
