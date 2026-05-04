/**
 * Deny Ledger Types (RFC-042)
 *
 * Defines the core types for the Deny Ledger system.
 * The Deny Ledger provides persistent storage for access denials,
 * ensuring security state survives service restarts.
 *
 * @see RFC-042 Appendix I.5 - Deny Ledger Architecture
 */

// ============================================================================
// Subject Types (Single Source of Truth)
// ============================================================================

/**
 * All valid subject types that can be denied access.
 * This array is the single source of truth - the type is derived from it.
 * Used for both compile-time type checking and runtime validation.
 */
export const DENY_SUBJECT_TYPES = [
  'user', // User account
  'session', // Active session (OIDC, JWT)
  'certificate', // mTLS certificate
  'api-key', // API key
  'tenant', // Entire tenant (suspension)
  'ip-address', // IP-based blocking
  'email', // Email blocklist
] as const;

/**
 * Types of subjects that can be denied access.
 * Derived from DENY_SUBJECT_TYPES array.
 */
export type DenySubjectType = (typeof DENY_SUBJECT_TYPES)[number];

/**
 * All valid denial reasons.
 * This array is the single source of truth - the type is derived from it.
 * Used for both compile-time type checking and runtime validation.
 */
export const DENY_REASONS = [
  'revoked', // Explicit revocation by admin
  'expired', // TTL expired (auto-cleanup)
  'suspended', // Tenant/account suspended
  'brute-force', // Too many failed auth attempts
  'certificate-revoked', // mTLS cert revoked
  'manual-block', // Manual admin block
  'policy-violation', // Automated policy enforcement
  'security-incident', // Security team action
] as const;

/**
 * Reasons for denial.
 * Derived from DENY_REASONS array.
 */
export type DenyReason = (typeof DENY_REASONS)[number];

// ============================================================================
// Entry Types
// ============================================================================

/**
 * A single deny entry in the ledger
 */
export interface DenyEntry {
  /** Unique identifier */
  id: string;

  /** Tenant this entry belongs to (for isolation) */
  tenantId: string;

  /** Type of subject being denied */
  subjectType: DenySubjectType;

  /** Identifier of the subject (userId, sessionId, etc.) */
  subjectId: string;

  /**
   * Optional: Specific resource type being denied
   * If null, denial applies to all resources
   */
  resourceType?: string;

  /**
   * Optional: Specific resource ID being denied
   * If null, denial applies to all resources of type
   */
  resourceId?: string;

  /** Reason for denial */
  reason: DenyReason;

  /**
   * Optional expiration time
   * Entry is auto-removed after this time
   * If null, entry is permanent until explicitly removed
   */
  expiresAt?: Date;

  /** Additional metadata (audit info, etc.) */
  metadata?: Record<string, unknown>;

  /** When this entry was created */
  createdAt: Date;

  /** Who created this entry (userId or system) */
  createdBy?: string;

  /** Optional: Related incident/ticket ID */
  incidentId?: string;
}

/**
 * Request to check if access is denied
 */
export interface DenyCheckRequest {
  /** Tenant context */
  tenantId: string;

  /** Type of subject to check */
  subjectType: DenySubjectType;

  /** Subject identifier */
  subjectId: string;

  /** Optional: Check for specific resource type */
  resourceType?: string;

  /** Optional: Check for specific resource */
  resourceId?: string;
}

/**
 * Result of a deny check
 */
export interface DenyCheckResult {
  /** Whether access is denied */
  denied: boolean;

  /** If denied, the matching entry */
  entry?: DenyEntry;

  /** If denied, human-readable reason */
  message?: string;
}

/**
 * Filter for listing deny entries
 */
export interface DenyEntryFilter {
  subjectType?: DenySubjectType;
  subjectId?: string;
  reason?: DenyReason;
  resourceType?: string;
  resourceId?: string;
  /** Include expired entries (default: false) */
  includeExpired?: boolean;
  /** Pagination */
  limit?: number;
  offset?: number;
}

/**
 * Input for creating a deny entry
 */
export type DenyEntryCreate = Omit<DenyEntry, 'id' | 'createdAt'>;

// ============================================================================
// Provider Configuration
// ============================================================================

/**
 * Deny Ledger provider mode
 *
 * - `memory`: In-memory LRU cache + PostgreSQL backup (OSS default)
 * - `redis`: Redis primary + PostgreSQL backup (Enterprise)
 * - `postgres-only`: PostgreSQL only, no cache (max durability)
 */
export type DenyLedgerMode = 'memory' | 'redis' | 'postgres-only';

/**
 * Configuration for the Deny Ledger
 */
export interface DenyLedgerConfig {
  /**
   * Provider mode
   * @default 'memory'
   */
  mode?: DenyLedgerMode;

  /**
   * Cache TTL for deny entries (seconds)
   * Entries are refreshed from PostgreSQL after this time
   * @default 3600 (1 hour)
   */
  cacheTtlSeconds?: number;

  /**
   * Default TTL for brute-force lockouts (seconds)
   * @default 900 (15 minutes)
   */
  bruteForceExpireSeconds?: number;

  /**
   * Max entries in memory cache (LRU eviction)
   * @default 10000
   */
  maxCacheSize?: number;

  /**
   * Redis connection options (only for mode: 'redis')
   */
  redis?: {
    /** Redis key prefix */
    keyPrefix?: string;
    /** TTL for Redis entries (seconds) */
    ttlSeconds?: number;
  };

  /**
   * Enable NATS pub/sub for multi-node sync
   * @default false
   */
  enableNatsSync?: boolean;

  /**
   * NATS subject for deny ledger updates
   * @default 'gerts.deny-ledger.updates'
   */
  natsSubject?: string;
}

/**
 * Required configuration type (all fields filled)
 */
export type RequiredDenyLedgerConfig = Required<Omit<DenyLedgerConfig, 'redis' | 'natsSubject'>> & {
  redis: Required<NonNullable<DenyLedgerConfig['redis']>>;
  natsSubject: string;
};

/**
 * Default configuration (immutable via as const + satisfies)
 * Use `as const` to prevent accidental mutations
 */
export const DEFAULT_DENY_LEDGER_CONFIG = {
  mode: 'memory',
  cacheTtlSeconds: 3600,
  bruteForceExpireSeconds: 900,
  maxCacheSize: 10000,
  redis: {
    keyPrefix: 'gerts:deny:',
    ttlSeconds: 86400, // 24 hours
  },
  enableNatsSync: false,
  natsSubject: 'gerts.deny-ledger.updates',
} as const satisfies RequiredDenyLedgerConfig;

// ============================================================================
// Events (for NATS sync)
// ============================================================================

/**
 * Event types for deny ledger changes
 */
export type DenyLedgerEventType = 'deny' | 'allow' | 'expire' | 'sync';

/**
 * Event published when deny ledger changes
 */
export interface DenyLedgerEvent {
  type: DenyLedgerEventType;
  tenantId: string;
  entry?: DenyEntry;
  entryId?: string;
  timestamp: Date;
  nodeId?: string; // Source node for deduplication
}

// ============================================================================
// Statistics
// ============================================================================

/**
 * Deny ledger statistics
 */
export interface DenyLedgerStats {
  /** Total entries in ledger */
  totalEntries: number;

  /** Entries by subject type */
  bySubjectType: Record<DenySubjectType, number>;

  /** Entries by reason */
  byReason: Record<DenyReason, number>;

  /** Cache hit rate (if applicable) */
  cacheHitRate?: number;

  /** Cache size */
  cacheSize?: number;

  /** Last sync time (for multi-node) */
  lastSyncAt?: Date;
}
