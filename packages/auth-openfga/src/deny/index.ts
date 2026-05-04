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
 * @module @gertsai/auth-openfga/deny
 */

import type { FgaResourceType } from '../types.js';
import type { DenyLedgerProvider as CoreDenyLedgerProvider } from '@gertsai/core';

// =============================================================================
// Types
// =============================================================================

/**
 * Deny entry in the ledger.
 */
export interface DenyEntry {
  /** Tenant context (for multi-tenant isolation) */
  tenantId?: string;
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
  /** Tenant context (for multi-tenant isolation) */
  tenantId?: string;
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
 *
 * @deprecated Use RedisDenyLedgerAdapter for production to persist deny entries.
 */
export class InMemoryDenyLedger {
  private entries: Map<string, DenyEntry> = new Map();

  /**
   * Generates key for the ledger.
   * Includes tenantId for multi-tenant isolation.
   */
  private makeKey(
    tenantId: string | undefined,
    userId: string,
    resourceType: string,
    resourceId: string,
    relation: string,
  ): string {
    const tenant = tenantId ?? '_default_';
    return `deny:${tenant}:${userId}:${resourceType}:${resourceId}:${relation}`;
  }

  /**
   * Adds a deny entry.
   */
  async deny(entry: DenyEntry): Promise<void> {
    const key = this.makeKey(
      entry.tenantId,
      entry.userId,
      entry.resourceType,
      entry.resourceId,
      entry.relation,
    );
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
    tenantId?: string,
  ): Promise<boolean> {
    const key = this.makeKey(tenantId, userId, resourceType, resourceId, relation);
    return this.entries.delete(key);
  }

  /**
   * Checks if access is denied.
   */
  async check(request: DenyCheckRequest): Promise<DenyCheckResult> {
    const now = new Date();
    const { tenantId } = request;

    // Check exact match
    const exactKey = this.makeKey(
      tenantId,
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
      tenantId,
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
      tenantId,
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
    const fullWildcardKey = this.makeKey(tenantId, request.userId, request.resourceType, '*', '*');
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
  async listForUser(userId: string, tenantId?: string): Promise<DenyEntry[]> {
    const results: DenyEntry[] = [];
    const tenant = tenantId ?? '_default_';
    const prefix = `deny:${tenant}:${userId}:`;
    for (const [key, entry] of this.entries) {
      if (key.startsWith(prefix)) {
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
// Redis Deny Ledger Adapter (Production)
// =============================================================================

/**
 * Configuration for RedisDenyLedgerAdapter
 */
export interface RedisDenyLedgerAdapterConfig {
  /**
   * Default tenant ID for requests without explicit tenantId.
   * @default '_default_'
   */
  defaultTenantId?: string;
}

/**
 * Redis-backed Deny Ledger Adapter for production use.
 *
 * Wraps @gertsai/core's DenyLedgerProvider to implement the auth-openfga DenyLedger interface.
 * Provides persistence and multi-node sync through Redis + PostgreSQL.
 *
 * @example
 * ```typescript
 * import { RedisDenyLedger, PostgresDenyLedger } from '@gertsai/core';
 * import Redis from 'ioredis';
 *
 * const redis = new Redis();
 * const postgres = new PostgresDenyLedger({ prisma: yourPrismaClient });
 * const coreLedger = new RedisDenyLedger({ redis, postgres });
 * await coreLedger.initialize();
 *
 * const adapter = new RedisDenyLedgerAdapter(coreLedger);
 * setDenyLedger(adapter);
 * ```
 */
export class RedisDenyLedgerAdapter implements DenyLedger {
  private readonly defaultTenantId: string;

  constructor(
    private readonly coreLedger: CoreDenyLedgerProvider,
    config?: RedisDenyLedgerAdapterConfig,
  ) {
    this.defaultTenantId = config?.defaultTenantId ?? '_default_';
  }

  async deny(entry: DenyEntry): Promise<void> {
    const tenantId = entry.tenantId ?? this.defaultTenantId;
    await this.coreLedger.deny({
      tenantId,
      subjectType: 'user',
      subjectId: entry.userId,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId,
      reason: 'revoked', // Map from string reason to DenyReason
      metadata: {
        relation: entry.relation,
        reason: entry.reason,
        deniedBy: entry.deniedBy,
      },
      expiresAt: entry.expiresAt ?? undefined,
      createdBy: entry.deniedBy,
    });
  }

  async allow(
    userId: string,
    resourceType: FgaResourceType,
    resourceId: string,
    _relation: string, // Note: relation is stored in metadata, not used for lookup key
    tenantId?: string,
  ): Promise<boolean> {
    const tenant = tenantId ?? this.defaultTenantId;
    try {
      await this.coreLedger.allow(tenant, 'user', userId, resourceType, resourceId);
      return true;
    } catch {
      return false;
    }
  }

  async check(request: DenyCheckRequest): Promise<DenyCheckResult> {
    const tenantId = request.tenantId ?? this.defaultTenantId;
    const result = await this.coreLedger.isDenied({
      tenantId,
      subjectType: 'user',
      subjectId: request.userId,
      resourceType: request.resourceType,
      resourceId: request.resourceId,
    });

    if (result.denied && result.entry) {
      const metadata = result.entry.metadata as
        | {
            relation?: string;
            reason?: string;
            deniedBy?: string;
          }
        | undefined;
      return {
        denied: true,
        reason: metadata?.reason ?? result.entry.reason,
        deniedAt: result.entry.createdAt,
        expiresAt: result.entry.expiresAt ?? null,
      };
    }

    return { denied: false };
  }

  async listForUser(userId: string, tenantId?: string): Promise<DenyEntry[]> {
    const tenant = tenantId ?? this.defaultTenantId;
    const entries = await this.coreLedger.list(tenant, {
      subjectType: 'user',
      subjectId: userId,
    });

    return entries.map((entry) => {
      const metadata = entry.metadata as
        | {
            relation?: string;
            reason?: string;
            deniedBy?: string;
          }
        | undefined;
      return {
        tenantId: entry.tenantId,
        userId: entry.subjectId,
        resourceType: (entry.resourceType ?? '*') as FgaResourceType,
        resourceId: entry.resourceId ?? '*',
        relation: metadata?.relation ?? '*',
        reason: metadata?.reason ?? entry.reason,
        deniedBy: metadata?.deniedBy ?? entry.createdBy ?? 'system',
        deniedAt: entry.createdAt,
        expiresAt: entry.expiresAt ?? null,
      };
    });
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
    tenantId?: string,
  ): Promise<boolean>;
  check(request: DenyCheckRequest): Promise<DenyCheckResult>;
  listForUser(userId: string, tenantId?: string): Promise<DenyEntry[]>;
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
