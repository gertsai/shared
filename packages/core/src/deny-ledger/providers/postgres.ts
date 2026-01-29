/**
 * PostgreSQL Deny Ledger Provider
 *
 * Persistent storage implementation using Prisma.
 * Provides durability and recovery on restart.
 *
 * Characteristics:
 * - Durable storage (survives restarts)
 * - ACID transactions
 * - Slower reads than Memory/Redis (~1-5ms)
 * - Supports complex queries
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
  DenyReason,
} from '../types';

// =============================================================================
// Prisma Enums (must match schema.prisma)
// =============================================================================

type PrismaDenySubjectType =
  | 'USER'
  | 'SESSION'
  | 'CERTIFICATE'
  | 'API_KEY'
  | 'TENANT'
  | 'IP_ADDRESS'
  | 'EMAIL';

type PrismaDenyReason =
  | 'REVOKED'
  | 'EXPIRED'
  | 'SUSPENDED'
  | 'BRUTE_FORCE'
  | 'CERTIFICATE_REVOKED'
  | 'MANUAL_BLOCK'
  | 'POLICY_VIOLATION'
  | 'SECURITY_INCIDENT';

// =============================================================================
// Prisma Types (duck typing to avoid circular dependency)
// =============================================================================

interface PrismaDenyLedgerEntry {
  id: string;
  tenantId: string;
  subjectType: PrismaDenySubjectType;
  subjectId: string;
  resourceType: string | null;
  resourceId: string | null;
  reason: PrismaDenyReason;
  expiresAt: Date | null;
  metadata: unknown;
  createdBy: string | null;
  incidentId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Minimal PrismaClient interface for deny ledger operations
 * Uses duck typing to avoid circular dependency on @gerts/database
 */
interface PrismaClientLike {
  denyLedgerEntry: {
    findFirst: (args: unknown) => Promise<PrismaDenyLedgerEntry | null>;
    findUnique: (args: unknown) => Promise<PrismaDenyLedgerEntry | null>;
    findMany: (args: unknown) => Promise<PrismaDenyLedgerEntry[]>;
    create: (args: unknown) => Promise<PrismaDenyLedgerEntry>;
    upsert: (args: unknown) => Promise<PrismaDenyLedgerEntry>;
    delete: (args: unknown) => Promise<PrismaDenyLedgerEntry>;
    deleteMany: (args: unknown) => Promise<{ count: number }>;
    count: (args?: unknown) => Promise<number>;
    groupBy: (
      args: unknown,
    ) => Promise<
      Array<{ _count: number; subjectType?: PrismaDenySubjectType; reason?: PrismaDenyReason }>
    >;
  };
  $transaction: <T>(operations: Promise<T>[]) => Promise<T[]>;
}

// =============================================================================
// Type Mappings
// =============================================================================

const SUBJECT_TYPE_TO_PRISMA: Record<DenySubjectType, PrismaDenySubjectType> = {
  user: 'USER',
  session: 'SESSION',
  certificate: 'CERTIFICATE',
  'api-key': 'API_KEY',
  tenant: 'TENANT',
  'ip-address': 'IP_ADDRESS',
  email: 'EMAIL',
};

const SUBJECT_TYPE_FROM_PRISMA: Record<PrismaDenySubjectType, DenySubjectType> = {
  USER: 'user',
  SESSION: 'session',
  CERTIFICATE: 'certificate',
  API_KEY: 'api-key',
  TENANT: 'tenant',
  IP_ADDRESS: 'ip-address',
  EMAIL: 'email',
};

const REASON_TO_PRISMA: Record<DenyReason, PrismaDenyReason> = {
  revoked: 'REVOKED',
  expired: 'EXPIRED',
  suspended: 'SUSPENDED',
  'brute-force': 'BRUTE_FORCE',
  'certificate-revoked': 'CERTIFICATE_REVOKED',
  'manual-block': 'MANUAL_BLOCK',
  'policy-violation': 'POLICY_VIOLATION',
  'security-incident': 'SECURITY_INCIDENT',
};

const REASON_FROM_PRISMA: Record<PrismaDenyReason, DenyReason> = {
  REVOKED: 'revoked',
  EXPIRED: 'expired',
  SUSPENDED: 'suspended',
  BRUTE_FORCE: 'brute-force',
  CERTIFICATE_REVOKED: 'certificate-revoked',
  MANUAL_BLOCK: 'manual-block',
  POLICY_VIOLATION: 'policy-violation',
  SECURITY_INCIDENT: 'security-incident',
};

// =============================================================================
// Conversion Functions
// =============================================================================

/**
 * Sentinel value for "no resource" in composite unique constraint.
 * Prisma can't use NULL in unique constraint lookups for upsert,
 * so we use empty string to represent "no resource specified".
 */
const NO_RESOURCE = '';

function toPrismaEntry(
  entry: DenyEntryCreate,
): Omit<PrismaDenyLedgerEntry, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    tenantId: entry.tenantId,
    subjectType: SUBJECT_TYPE_TO_PRISMA[entry.subjectType],
    subjectId: entry.subjectId,
    // Use empty string instead of null for composite unique constraint
    resourceType: entry.resourceType ?? NO_RESOURCE,
    resourceId: entry.resourceId ?? NO_RESOURCE,
    reason: REASON_TO_PRISMA[entry.reason],
    expiresAt: entry.expiresAt ?? null,
    metadata: entry.metadata ?? null,
    createdBy: entry.createdBy ?? null,
    incidentId: entry.incidentId ?? null,
  };
}

function fromPrismaEntry(prisma: PrismaDenyLedgerEntry): DenyEntry {
  return {
    id: prisma.id,
    tenantId: prisma.tenantId,
    subjectType: SUBJECT_TYPE_FROM_PRISMA[prisma.subjectType],
    subjectId: prisma.subjectId,
    // Convert empty string sentinel back to undefined
    resourceType: prisma.resourceType || undefined,
    resourceId: prisma.resourceId || undefined,
    reason: REASON_FROM_PRISMA[prisma.reason],
    expiresAt: prisma.expiresAt ?? undefined,
    metadata: prisma.metadata as Record<string, unknown> | undefined,
    createdBy: prisma.createdBy ?? undefined,
    incidentId: prisma.incidentId ?? undefined,
    createdAt: prisma.createdAt,
  };
}

// =============================================================================
// PostgreSQL Provider
// =============================================================================

export interface PostgresDenyLedgerOptions {
  /**
   * Prisma client instance
   * Pass `getDatabase()` from @gerts/database
   */
  prisma: PrismaClientLike;
}

/**
 * PostgreSQL-based Deny Ledger Provider
 *
 * Uses Prisma for persistent storage.
 *
 * @example
 * ```typescript
 * import { getDatabase } from '@gerts/database';
 * import { PostgresDenyLedger } from '@gerts/core';
 *
 * const ledger = new PostgresDenyLedger({ prisma: getDatabase() });
 * await ledger.initialize();
 * ```
 */
export class PostgresDenyLedger implements DenyLedgerProvider {
  private readonly prisma: PrismaClientLike;
  private initialized = false;

  constructor(options: PostgresDenyLedgerOptions) {
    this.prisma = options.prisma;
  }

  // ==========================================================================
  // Core Operations
  // ==========================================================================

  async isDenied(request: DenyCheckRequest): Promise<DenyCheckResult> {
    const now = new Date();

    // Build OR conditions for check order:
    // 1. Exact match
    // 2. Resource-type match (if resourceId provided)
    // 3. Global match (subject only)
    // 4. Tenant-wide (if checking non-tenant subject)

    const orConditions: Array<{
      subjectType: PrismaDenySubjectType;
      subjectId: string;
      resourceType?: string;
      resourceId?: string;
    }> = [
      // 1. Exact match
      {
        subjectType: SUBJECT_TYPE_TO_PRISMA[request.subjectType],
        subjectId: request.subjectId,
        resourceType: request.resourceType ?? NO_RESOURCE,
        resourceId: request.resourceId ?? NO_RESOURCE,
      },
      // 3. Global match (subject only, no resource)
      {
        subjectType: SUBJECT_TYPE_TO_PRISMA[request.subjectType],
        subjectId: request.subjectId,
        resourceType: NO_RESOURCE,
        resourceId: NO_RESOURCE,
      },
    ];

    // 2. Resource-type match (if resourceId provided)
    if (request.resourceId) {
      orConditions.splice(1, 0, {
        subjectType: SUBJECT_TYPE_TO_PRISMA[request.subjectType],
        subjectId: request.subjectId,
        resourceType: request.resourceType ?? NO_RESOURCE,
        resourceId: NO_RESOURCE,
      });
    }

    // 4. Tenant-wide (if checking non-tenant subject)
    if (request.subjectType !== 'tenant') {
      orConditions.push({
        subjectType: 'TENANT',
        subjectId: request.tenantId,
        resourceType: NO_RESOURCE,
        resourceId: NO_RESOURCE,
      });
    }

    const entry = await this.prisma.denyLedgerEntry.findFirst({
      where: {
        tenantId: request.tenantId,
        AND: [
          { OR: orConditions },
          // Not expired
          { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
        ],
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (entry) {
      return {
        denied: true,
        entry: fromPrismaEntry(entry),
        message: `Access denied: ${REASON_FROM_PRISMA[entry.reason]}`,
      };
    }

    return { denied: false };
  }

  async deny(input: DenyEntryCreate): Promise<DenyEntry> {
    const data = toPrismaEntry(input);

    // Upsert to handle existing entries with same key
    const entry = await this.prisma.denyLedgerEntry.upsert({
      where: {
        uk_deny_ledger_subject_resource: {
          tenantId: data.tenantId,
          subjectType: data.subjectType,
          subjectId: data.subjectId,
          resourceType: data.resourceType,
          resourceId: data.resourceId,
        },
      },
      create: data,
      update: {
        reason: data.reason,
        expiresAt: data.expiresAt,
        metadata: data.metadata,
        createdBy: data.createdBy,
        incidentId: data.incidentId,
      },
    });

    return fromPrismaEntry(entry);
  }

  async allow(
    tenantId: string,
    subjectType: DenySubjectType,
    subjectId: string,
    resourceType?: string,
    resourceId?: string,
  ): Promise<void> {
    await this.prisma.denyLedgerEntry.deleteMany({
      where: {
        tenantId,
        subjectType: SUBJECT_TYPE_TO_PRISMA[subjectType],
        subjectId,
        resourceType: resourceType ?? NO_RESOURCE,
        resourceId: resourceId ?? NO_RESOURCE,
      },
    });
  }

  async allowById(id: string): Promise<void> {
    try {
      await this.prisma.denyLedgerEntry.delete({
        where: { id },
      });
    } catch {
      // Ignore if not found
    }
  }

  // ==========================================================================
  // Query Operations
  // ==========================================================================

  async get(id: string): Promise<DenyEntry | null> {
    const entry = await this.prisma.denyLedgerEntry.findUnique({
      where: { id },
    });
    return entry ? fromPrismaEntry(entry) : null;
  }

  async list(tenantId: string, filter?: DenyEntryFilter): Promise<DenyEntry[]> {
    const now = new Date();

    const where: Record<string, unknown> = {};

    // Empty tenantId means "all tenants" (for cache warming)
    if (tenantId) {
      where.tenantId = tenantId;
    }

    if (filter?.subjectType) {
      where.subjectType = SUBJECT_TYPE_TO_PRISMA[filter.subjectType];
    }
    if (filter?.subjectId) {
      where.subjectId = filter.subjectId;
    }
    if (filter?.reason) {
      where.reason = REASON_TO_PRISMA[filter.reason];
    }
    if (filter?.resourceType) {
      where.resourceType = filter.resourceType;
    }
    if (filter?.resourceId) {
      where.resourceId = filter.resourceId;
    }
    if (!filter?.includeExpired) {
      where.OR = [{ expiresAt: null }, { expiresAt: { gt: now } }];
    }

    const entries = await this.prisma.denyLedgerEntry.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: filter?.limit ?? 100,
      skip: filter?.offset ?? 0,
    });

    return entries.map(fromPrismaEntry);
  }

  async count(tenantId: string, filter?: DenyEntryFilter): Promise<number> {
    const now = new Date();

    const where: Record<string, unknown> = {};

    // Empty tenantId means "all tenants"
    if (tenantId) {
      where.tenantId = tenantId;
    }

    if (filter?.subjectType) {
      where.subjectType = SUBJECT_TYPE_TO_PRISMA[filter.subjectType];
    }
    if (filter?.subjectId) {
      where.subjectId = filter.subjectId;
    }
    if (filter?.reason) {
      where.reason = REASON_TO_PRISMA[filter.reason];
    }
    if (filter?.resourceType) {
      where.resourceType = filter.resourceType;
    }
    if (filter?.resourceId) {
      where.resourceId = filter.resourceId;
    }
    if (!filter?.includeExpired) {
      where.OR = [{ expiresAt: null }, { expiresAt: { gt: now } }];
    }

    return this.prisma.denyLedgerEntry.count({ where });
  }

  // ==========================================================================
  // Bulk Operations
  // ==========================================================================

  async denyBatch(entries: DenyEntryCreate[]): Promise<DenyEntry[]> {
    // Use transaction for atomicity
    const operations = entries.map((entry) => {
      const data = toPrismaEntry(entry);
      return this.prisma.denyLedgerEntry.upsert({
        where: {
          uk_deny_ledger_subject_resource: {
            tenantId: data.tenantId,
            subjectType: data.subjectType,
            subjectId: data.subjectId,
            resourceType: data.resourceType,
            resourceId: data.resourceId,
          },
        },
        create: data,
        update: {
          reason: data.reason,
          expiresAt: data.expiresAt,
          metadata: data.metadata,
          createdBy: data.createdBy,
          incidentId: data.incidentId,
        },
      });
    });

    const results = await this.prisma.$transaction(operations);
    return results.map(fromPrismaEntry);
  }

  async allowBatch(ids: string[]): Promise<void> {
    await this.prisma.denyLedgerEntry.deleteMany({
      where: {
        id: { in: ids },
      },
    });
  }

  // ==========================================================================
  // Maintenance Operations
  // ==========================================================================

  async cleanupExpired(): Promise<number> {
    const result = await this.prisma.denyLedgerEntry.deleteMany({
      where: {
        expiresAt: {
          lt: new Date(),
        },
      },
    });

    return result.count;
  }

  async getStats(tenantId?: string): Promise<DenyLedgerStats> {
    const where = tenantId ? { tenantId } : {};

    // Total count
    const totalEntries = await this.prisma.denyLedgerEntry.count({ where });

    // By subject type
    const bySubjectTypeRaw = await this.prisma.denyLedgerEntry.groupBy({
      by: ['subjectType'],
      where,
      _count: true,
    });

    const bySubjectType: Record<DenySubjectType, number> = {
      user: 0,
      session: 0,
      certificate: 0,
      'api-key': 0,
      tenant: 0,
      'ip-address': 0,
      email: 0,
    };

    for (const row of bySubjectTypeRaw) {
      if (row.subjectType) {
        bySubjectType[SUBJECT_TYPE_FROM_PRISMA[row.subjectType]] = row._count;
      }
    }

    // By reason
    const byReasonRaw = await this.prisma.denyLedgerEntry.groupBy({
      by: ['reason'],
      where,
      _count: true,
    });

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

    for (const row of byReasonRaw) {
      if (row.reason) {
        byReason[REASON_FROM_PRISMA[row.reason]] = row._count;
      }
    }

    return {
      totalEntries,
      bySubjectType,
      byReason,
    };
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  async initialize(): Promise<void> {
    // Verify connection by running a simple query
    await this.prisma.denyLedgerEntry.count();
    this.initialized = true;
  }

  async close(): Promise<void> {
    // Prisma client is shared, don't disconnect
    this.initialized = false;
  }

  async sync(_tenantId?: string): Promise<void> {
    // PostgreSQL is the source of truth, nothing to sync
  }

  // ==========================================================================
  // PostgreSQL-specific Methods
  // ==========================================================================

  /**
   * Load all entries for a tenant (for cache warming)
   * @param tenantId - Tenant ID to filter, or empty string to load all tenants
   */
  async loadAll(tenantId: string): Promise<DenyEntry[]> {
    const now = new Date();

    const entries = await this.prisma.denyLedgerEntry.findMany({
      where: {
        // Filter by tenant only if specified, otherwise load all
        ...(tenantId ? { tenantId } : {}),
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
    });

    return entries.map(fromPrismaEntry);
  }

  /**
   * Check if initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }
}
