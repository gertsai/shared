/**
 * RFC-053: Database Domain Error Codes
 *
 * Error codes specific to database operations and Prisma errors.
 *
 * @module @gerts/api-core/error/codes/database
 */

/**
 * Database domain error codes.
 * Maps to common Prisma and PostgreSQL error scenarios.
 */
export const DatabaseErrorCodes = {
  // ─────────────────────────────────────────────────────────────────────────
  // Connection Errors
  // ─────────────────────────────────────────────────────────────────────────
  /** Database connection failed */
  CONNECTION_FAILED: 'DB_CONNECTION_FAILED',
  /** Database connection timed out */
  CONNECTION_TIMEOUT: 'DB_CONNECTION_TIMEOUT',
  /** Database connection pool exhausted */
  POOL_EXHAUSTED: 'DB_POOL_EXHAUSTED',

  // ─────────────────────────────────────────────────────────────────────────
  // Constraint Errors
  // ─────────────────────────────────────────────────────────────────────────
  /** Unique constraint violation (Prisma P2002) */
  UNIQUE_CONSTRAINT: 'DB_UNIQUE_CONSTRAINT',
  /** Foreign key constraint violation (Prisma P2003) */
  FOREIGN_KEY_CONSTRAINT: 'DB_FOREIGN_KEY_CONSTRAINT',
  /** Check constraint violation */
  CHECK_CONSTRAINT: 'DB_CHECK_CONSTRAINT',
  /** Not null constraint violation (Prisma P2011) */
  NOT_NULL_CONSTRAINT: 'DB_NOT_NULL_CONSTRAINT',

  // ─────────────────────────────────────────────────────────────────────────
  // Record Errors
  // ─────────────────────────────────────────────────────────────────────────
  /** Record not found (Prisma P2025) */
  RECORD_NOT_FOUND: 'DB_RECORD_NOT_FOUND',
  /** Record already exists */
  RECORD_EXISTS: 'DB_RECORD_EXISTS',
  /** Related record not found (Prisma P2018) */
  RELATED_NOT_FOUND: 'DB_RELATED_NOT_FOUND',

  // ─────────────────────────────────────────────────────────────────────────
  // Transaction Errors
  // ─────────────────────────────────────────────────────────────────────────
  /** Transaction failed */
  TRANSACTION_FAILED: 'DB_TRANSACTION_FAILED',
  /** Deadlock detected */
  DEADLOCK: 'DB_DEADLOCK',
  /** Serialization failure (optimistic locking) */
  SERIALIZATION_FAILURE: 'DB_SERIALIZATION_FAILURE',
  /** Transaction timeout */
  TRANSACTION_TIMEOUT: 'DB_TRANSACTION_TIMEOUT',

  // ─────────────────────────────────────────────────────────────────────────
  // Query Errors
  // ─────────────────────────────────────────────────────────────────────────
  /** Invalid query parameters */
  INVALID_QUERY: 'DB_INVALID_QUERY',
  /** Query timed out */
  QUERY_TIMEOUT: 'DB_QUERY_TIMEOUT',
  /** Too many results */
  TOO_MANY_RESULTS: 'DB_TOO_MANY_RESULTS',

  // ─────────────────────────────────────────────────────────────────────────
  // Migration Errors
  // ─────────────────────────────────────────────────────────────────────────
  /** Migration failed */
  MIGRATION_FAILED: 'DB_MIGRATION_FAILED',
  /** Schema out of sync */
  SCHEMA_DRIFT: 'DB_SCHEMA_DRIFT',
} as const;

export type DatabaseErrorCode = (typeof DatabaseErrorCodes)[keyof typeof DatabaseErrorCodes];

/**
 * Map Prisma error codes to our domain codes.
 *
 * @see https://www.prisma.io/docs/reference/api-reference/error-reference
 */
export const PRISMA_ERROR_MAP: Record<string, DatabaseErrorCode> = {
  P2002: DatabaseErrorCodes.UNIQUE_CONSTRAINT,
  P2003: DatabaseErrorCodes.FOREIGN_KEY_CONSTRAINT,
  P2011: DatabaseErrorCodes.NOT_NULL_CONSTRAINT,
  P2018: DatabaseErrorCodes.RELATED_NOT_FOUND,
  P2025: DatabaseErrorCodes.RECORD_NOT_FOUND,
};
