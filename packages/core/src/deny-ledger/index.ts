/**
 * Deny Ledger Module (RFC-042)
 *
 * Provides persistent storage for access denials to ensure
 * security state survives service restarts.
 *
 * @example
 * ```typescript
 * import {
 *   MemoryDenyLedger,
 *   type DenyLedgerProvider,
 *   type DenyEntry,
 * } from '@gerts/core/deny-ledger';
 *
 * // Create provider
 * const ledger: DenyLedgerProvider = new MemoryDenyLedger({ maxCacheSize: 10000 });
 * await ledger.initialize();
 *
 * // Deny access
 * await ledger.deny({
 *   tenantId: 'tenant-123',
 *   subjectType: 'user',
 *   subjectId: 'user-456',
 *   reason: 'brute-force',
 *   expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 min
 * });
 *
 * // Check access
 * const result = await ledger.isDenied({
 *   tenantId: 'tenant-123',
 *   subjectType: 'user',
 *   subjectId: 'user-456',
 * });
 *
 * if (result.denied) {
 *   console.log(`Access denied: ${result.message}`);
 * }
 * ```
 *
 * @see RFC-042 Appendix I.5 - Deny Ledger Architecture
 */

// Types
export {
  type DenySubjectType,
  type DenyReason,
  type DenyEntry,
  type DenyEntryCreate,
  type DenyCheckRequest,
  type DenyCheckResult,
  type DenyEntryFilter,
  type DenyLedgerMode,
  type DenyLedgerConfig,
  type DenyLedgerEventType,
  type DenyLedgerEvent,
  type DenyLedgerStats,
  DEFAULT_DENY_LEDGER_CONFIG,
} from './types';

// Interface
export { type DenyLedgerProvider, type DenyLedgerFactory, isDenyLedgerProvider } from './interface';

// Providers
export { MemoryDenyLedger } from './providers/memory';
export { PostgresDenyLedger, type PostgresDenyLedgerOptions } from './providers/postgres';
export { HybridDenyLedger, type HybridDenyLedgerOptions } from './providers/hybrid';
export {
  RedisDenyLedger,
  type RedisDenyLedgerOptions,
  type RedisClientLike,
} from './providers/redis';
