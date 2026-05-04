/**
 * Integration Tests for PostgreSQL Deny Ledger Provider
 *
 * These tests verify persistent deny ledger operations:
 * - CRUD operations with real PostgreSQL
 * - Expiration handling
 * - Upsert behavior (composite unique constraint)
 * - Bulk operations
 * - Statistics aggregation
 *
 * @requires PostgreSQL database
 * @see RFC-042 Appendix I.5 - Deny Ledger Architecture
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { PostgresDenyLedger } from '../providers/postgres';
import type { DenyEntryCreate } from '../types';

// ============================================================================
// Test Configuration
// ============================================================================

/**
 * Skip tests if PostgreSQL is not available
 */
const HAS_POSTGRES =
  process.env.HAS_POSTGRES === '1' ||
  process.env.DATABASE_URL?.includes('postgres') ||
  process.env.DATABASE_URL?.includes('postgresql');

const describeIntegration = HAS_POSTGRES ? describe : describe.skip;

// Test constants with unique prefix to avoid collisions
const TEST_PREFIX = `deny_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const TEST_TENANT = `${TEST_PREFIX}_tenant`;

// ============================================================================
// Test Utilities
// ============================================================================

// Type for PrismaClient (duck typed to avoid dependency)
interface PrismaClientForTest {
  $connect: () => Promise<void>;
  $disconnect: () => Promise<void>;
  $executeRawUnsafe: (sql: string) => Promise<unknown>;
}

/**
 * Creates a minimal PrismaClient for testing
 * Uses dynamic import to avoid @prisma/client dependency in @gertsai/core
 *
 * @note Run from monorepo root: `pnpm --filter @gertsai/core test -- postgres.integration`
 */
async function createTestPrisma(): Promise<{
  prisma: unknown;
  cleanup: () => Promise<void>;
  disconnect: () => Promise<void>;
}> {
  // Dynamic import - available when running from monorepo with @gertsai/database built
  // @ts-expect-error - @gertsai/database is not a direct dependency but available in monorepo
  const { PrismaClient } = await import('@gertsai/database');
  const prisma = new PrismaClient() as PrismaClientForTest;
  await prisma.$connect();

  const cleanup = async () => {
    try {
      // Delete test entries by tenant prefix
      await prisma.$executeRawUnsafe(`
        DELETE FROM gerts_deny_ledger
        WHERE tenant_id LIKE '${TEST_PREFIX}%'
      `);
    } catch {
      // Table might not exist yet
    }
  };

  const disconnect = async () => {
    await prisma.$disconnect();
  };

  return { prisma, cleanup, disconnect };
}

function createDenyEntry(overrides: Partial<DenyEntryCreate> = {}): DenyEntryCreate {
  return {
    tenantId: TEST_TENANT,
    subjectType: 'user',
    subjectId: `user-${Math.random().toString(36).slice(2, 8)}`,
    reason: 'brute-force',
    ...overrides,
  };
}

// ============================================================================
// Integration Tests
// ============================================================================

describeIntegration('PostgresDenyLedger Integration Tests', () => {
  let prisma: unknown;
  let cleanup: () => Promise<void>;
  let disconnect: () => Promise<void>;
  let ledger: PostgresDenyLedger;

  beforeAll(async () => {
    const result = await createTestPrisma();
    prisma = result.prisma;
    cleanup = result.cleanup;
    disconnect = result.disconnect;

    ledger = new PostgresDenyLedger({ prisma: prisma as never });
    await ledger.initialize();
  });

  afterAll(async () => {
    await cleanup();
    await ledger.close();
    await disconnect();
  });

  beforeEach(async () => {
    await cleanup();
  });

  afterEach(async () => {
    await cleanup();
  });

  // ==========================================================================
  // deny() - Create/Upsert
  // ==========================================================================

  describe('deny()', () => {
    it('should create a deny entry in PostgreSQL', async () => {
      const input = createDenyEntry({
        subjectId: 'user-001',
        reason: 'brute-force',
        metadata: { attempts: 5 },
      });

      const entry = await ledger.deny(input);

      expect(entry.id).toBeDefined();
      expect(entry.tenantId).toBe(TEST_TENANT);
      expect(entry.subjectType).toBe('user');
      expect(entry.subjectId).toBe('user-001');
      expect(entry.reason).toBe('brute-force');
      expect(entry.metadata).toEqual({ attempts: 5 });
      expect(entry.createdAt).toBeInstanceOf(Date);
    });

    it('should upsert existing entry with same composite key', async () => {
      const input1 = createDenyEntry({
        subjectId: 'user-002',
        reason: 'brute-force',
        expiresAt: new Date(Date.now() + 10000),
      });

      const entry1 = await ledger.deny(input1);

      // Same key, different reason
      const input2 = createDenyEntry({
        subjectId: 'user-002',
        reason: 'manual-block',
        expiresAt: new Date(Date.now() + 20000),
      });

      const entry2 = await ledger.deny(input2);

      // Should have same ID (upserted)
      expect(entry2.id).toBe(entry1.id);
      expect(entry2.reason).toBe('manual-block');
    });

    it('should handle optional fields', async () => {
      const input = createDenyEntry({
        subjectId: 'user-003',
        resourceType: 'document',
        resourceId: 'doc-123',
        expiresAt: new Date(Date.now() + 60000),
        createdBy: 'admin-001',
        incidentId: 'incident-456',
      });

      const entry = await ledger.deny(input);

      expect(entry.resourceType).toBe('document');
      expect(entry.resourceId).toBe('doc-123');
      expect(entry.expiresAt).toBeInstanceOf(Date);
      expect(entry.createdBy).toBe('admin-001');
      expect(entry.incidentId).toBe('incident-456');
    });
  });

  // ==========================================================================
  // isDenied() - Check
  // ==========================================================================

  describe('isDenied()', () => {
    it('should return denied=false for non-existent entry', async () => {
      const result = await ledger.isDenied({
        tenantId: TEST_TENANT,
        subjectType: 'user',
        subjectId: 'non-existent-user',
      });

      expect(result.denied).toBe(false);
      expect(result.entry).toBeUndefined();
    });

    it('should return denied=true for existing entry', async () => {
      await ledger.deny(
        createDenyEntry({
          subjectId: 'user-check-001',
          reason: 'suspended',
        }),
      );

      const result = await ledger.isDenied({
        tenantId: TEST_TENANT,
        subjectType: 'user',
        subjectId: 'user-check-001',
      });

      expect(result.denied).toBe(true);
      expect(result.entry).toBeDefined();
      expect(result.entry?.reason).toBe('suspended');
      expect(result.message).toContain('suspended');
    });

    it('should return denied=false for expired entry', async () => {
      await ledger.deny(
        createDenyEntry({
          subjectId: 'user-expired-001',
          expiresAt: new Date(Date.now() - 1000), // Already expired
        }),
      );

      const result = await ledger.isDenied({
        tenantId: TEST_TENANT,
        subjectType: 'user',
        subjectId: 'user-expired-001',
      });

      expect(result.denied).toBe(false);
    });

    it('should check resource-specific denials', async () => {
      await ledger.deny(
        createDenyEntry({
          subjectId: 'user-resource-001',
          resourceType: 'api',
          resourceId: 'endpoint-123',
        }),
      );

      // Without resource - not denied
      const result1 = await ledger.isDenied({
        tenantId: TEST_TENANT,
        subjectType: 'user',
        subjectId: 'user-resource-001',
      });

      // User-level not denied (only resource-specific)
      expect(result1.denied).toBe(false);

      // With resource - denied
      const result2 = await ledger.isDenied({
        tenantId: TEST_TENANT,
        subjectType: 'user',
        subjectId: 'user-resource-001',
        resourceType: 'api',
        resourceId: 'endpoint-123',
      });

      expect(result2.denied).toBe(true);
    });
  });

  // ==========================================================================
  // allow() - Remove
  // ==========================================================================

  describe('allow()', () => {
    it('should remove deny entry', async () => {
      await ledger.deny(
        createDenyEntry({
          subjectId: 'user-allow-001',
        }),
      );

      // Verify denied
      let result = await ledger.isDenied({
        tenantId: TEST_TENANT,
        subjectType: 'user',
        subjectId: 'user-allow-001',
      });
      expect(result.denied).toBe(true);

      // Remove
      await ledger.allow(TEST_TENANT, 'user', 'user-allow-001');

      // Verify allowed
      result = await ledger.isDenied({
        tenantId: TEST_TENANT,
        subjectType: 'user',
        subjectId: 'user-allow-001',
      });
      expect(result.denied).toBe(false);
    });

    it('should not throw when removing non-existent entry', async () => {
      await expect(ledger.allow(TEST_TENANT, 'user', 'non-existent-user')).resolves.not.toThrow();
    });
  });

  // ==========================================================================
  // get() - Retrieve by ID
  // ==========================================================================

  describe('get()', () => {
    it('should retrieve entry by ID', async () => {
      const created = await ledger.deny(
        createDenyEntry({
          subjectId: 'user-get-001',
        }),
      );

      const entry = await ledger.get(created.id);

      expect(entry).not.toBeNull();
      expect(entry?.id).toBe(created.id);
      expect(entry?.subjectId).toBe('user-get-001');
    });

    it('should return null for non-existent ID', async () => {
      const entry = await ledger.get('non-existent-id');
      expect(entry).toBeNull();
    });
  });

  // ==========================================================================
  // list() - Query
  // ==========================================================================

  describe('list()', () => {
    beforeEach(async () => {
      // Create test entries
      await ledger.denyBatch([
        createDenyEntry({ subjectId: 'list-user-001', reason: 'brute-force' }),
        createDenyEntry({ subjectId: 'list-user-002', reason: 'suspended' }),
        createDenyEntry({ subjectId: 'list-user-003', reason: 'brute-force' }),
        createDenyEntry({
          subjectId: 'list-user-004',
          reason: 'expired',
          expiresAt: new Date(Date.now() - 1000),
        }),
      ]);
    });

    it('should list all active entries for tenant', async () => {
      const entries = await ledger.list(TEST_TENANT);

      // Should not include expired entry
      expect(entries.length).toBe(3);
    });

    it('should filter by reason', async () => {
      const entries = await ledger.list(TEST_TENANT, { reason: 'brute-force' });

      expect(entries.length).toBe(2);
      entries.forEach((e) => expect(e.reason).toBe('brute-force'));
    });

    it('should include expired with filter', async () => {
      const entries = await ledger.list(TEST_TENANT, { includeExpired: true });

      expect(entries.length).toBe(4);
    });

    it('should respect limit and offset', async () => {
      const page1 = await ledger.list(TEST_TENANT, { limit: 2, offset: 0 });
      const page2 = await ledger.list(TEST_TENANT, { limit: 2, offset: 2 });

      expect(page1.length).toBe(2);
      expect(page2.length).toBe(1);
    });
  });

  // ==========================================================================
  // count() - Count
  // ==========================================================================

  describe('count()', () => {
    it('should count active entries', async () => {
      await ledger.denyBatch([
        createDenyEntry({ subjectId: 'count-001' }),
        createDenyEntry({ subjectId: 'count-002' }),
        createDenyEntry({
          subjectId: 'count-003',
          expiresAt: new Date(Date.now() - 1000),
        }),
      ]);

      const count = await ledger.count(TEST_TENANT);
      expect(count).toBe(2);
    });
  });

  // ==========================================================================
  // Bulk Operations
  // ==========================================================================

  describe('denyBatch()', () => {
    it('should create multiple entries atomically', async () => {
      const entries = await ledger.denyBatch([
        createDenyEntry({ subjectId: 'batch-001' }),
        createDenyEntry({ subjectId: 'batch-002' }),
        createDenyEntry({ subjectId: 'batch-003' }),
      ]);

      expect(entries.length).toBe(3);
      expect(entries.every((e) => e.id)).toBe(true);
    });
  });

  describe('allowBatch()', () => {
    it('should remove multiple entries', async () => {
      const created = await ledger.denyBatch([
        createDenyEntry({ subjectId: 'allow-batch-001' }),
        createDenyEntry({ subjectId: 'allow-batch-002' }),
      ]);

      await ledger.allowBatch(created.map((e) => e.id));

      const count = await ledger.count(TEST_TENANT);
      expect(count).toBe(0);
    });
  });

  // ==========================================================================
  // Maintenance
  // ==========================================================================

  describe('cleanupExpired()', () => {
    it('should remove expired entries', async () => {
      await ledger.denyBatch([
        createDenyEntry({
          subjectId: 'cleanup-001',
          expiresAt: new Date(Date.now() - 10000),
        }),
        createDenyEntry({
          subjectId: 'cleanup-002',
          expiresAt: new Date(Date.now() - 5000),
        }),
        createDenyEntry({
          subjectId: 'cleanup-003',
          expiresAt: new Date(Date.now() + 60000),
        }), // Not expired
        createDenyEntry({ subjectId: 'cleanup-004' }), // No expiry
      ]);

      const cleaned = await ledger.cleanupExpired();
      expect(cleaned).toBe(2);

      const remaining = await ledger.count(TEST_TENANT);
      expect(remaining).toBe(2);
    });
  });

  // ==========================================================================
  // Statistics
  // ==========================================================================

  describe('getStats()', () => {
    it('should return aggregated statistics', async () => {
      await ledger.denyBatch([
        createDenyEntry({ subjectType: 'user', reason: 'brute-force' }),
        createDenyEntry({ subjectType: 'user', reason: 'brute-force' }),
        createDenyEntry({ subjectType: 'session', reason: 'revoked' }),
        createDenyEntry({ subjectType: 'api-key', reason: 'suspended' }),
      ]);

      const stats = await ledger.getStats(TEST_TENANT);

      expect(stats.totalEntries).toBe(4);
      expect(stats.bySubjectType.user).toBe(2);
      expect(stats.bySubjectType.session).toBe(1);
      expect(stats.bySubjectType['api-key']).toBe(1);
      expect(stats.byReason['brute-force']).toBe(2);
      expect(stats.byReason.revoked).toBe(1);
    });
  });

  // ==========================================================================
  // loadAll() - For Hybrid Provider
  // ==========================================================================

  describe('loadAll()', () => {
    it('should load all active entries for tenant', async () => {
      await ledger.denyBatch([
        createDenyEntry({ subjectId: 'load-001' }),
        createDenyEntry({ subjectId: 'load-002' }),
        createDenyEntry({
          subjectId: 'load-003',
          expiresAt: new Date(Date.now() - 1000),
        }),
      ]);

      const entries = await ledger.loadAll(TEST_TENANT);

      expect(entries.length).toBe(2);
    });
  });
});
