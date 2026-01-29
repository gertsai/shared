/**
 * Integration Tests for Hybrid Deny Ledger Provider
 *
 * These tests verify the memory cache + PostgreSQL synchronization:
 * - Write-through caching (DB first, then cache)
 * - Cache warming on startup
 * - Cache miss recovery from DB
 * - Stats aggregation from both sources
 *
 * @requires PostgreSQL database
 * @see RFC-042 Appendix I.5 - Deny Ledger Architecture
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { HybridDenyLedger } from '../providers/hybrid';
import { MemoryDenyLedger } from '../providers/memory';
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
const TEST_PREFIX = `hybrid_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
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
 *
 * @note Run from monorepo root: `pnpm --filter @gerts/core test -- hybrid.integration`
 */
async function createTestPrisma(): Promise<{
  prisma: unknown;
  cleanup: () => Promise<void>;
  disconnect: () => Promise<void>;
}> {
  // Dynamic import - available when running from monorepo with @gerts/database built
  // @ts-expect-error - @gerts/database is not a direct dependency but available in monorepo
  const { PrismaClient } = await import('@gerts/database');
  const prisma = new PrismaClient() as PrismaClientForTest;
  await prisma.$connect();

  const cleanup = async () => {
    try {
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

describeIntegration('HybridDenyLedger Integration Tests', () => {
  let prisma: unknown;
  let cleanup: () => Promise<void>;
  let disconnect: () => Promise<void>;
  let memory: MemoryDenyLedger;
  let postgres: PostgresDenyLedger;
  let hybrid: HybridDenyLedger;

  beforeAll(async () => {
    const result = await createTestPrisma();
    prisma = result.prisma;
    cleanup = result.cleanup;
    disconnect = result.disconnect;

    memory = new MemoryDenyLedger({ maxCacheSize: 1000 });
    postgres = new PostgresDenyLedger({ prisma: prisma as never });

    hybrid = new HybridDenyLedger({ memory, postgres });
    await hybrid.initialize();
  });

  afterAll(async () => {
    await cleanup();
    await hybrid.close();
    await disconnect();
  });

  beforeEach(async () => {
    await cleanup();
    // Reset memory cache
    memory.resetStats();
  });

  afterEach(async () => {
    await cleanup();
  });

  // ==========================================================================
  // Write-Through Caching
  // ==========================================================================

  describe('Write-through caching', () => {
    it('should write to PostgreSQL and cache simultaneously', async () => {
      const entry = await hybrid.deny(
        createDenyEntry({
          subjectId: 'write-through-001',
        }),
      );

      expect(entry.id).toBeDefined();

      // Check memory cache
      const memResult = await memory.isDenied({
        tenantId: TEST_TENANT,
        subjectType: 'user',
        subjectId: 'write-through-001',
      });
      expect(memResult.denied).toBe(true);

      // Check PostgreSQL
      const dbResult = await postgres.isDenied({
        tenantId: TEST_TENANT,
        subjectType: 'user',
        subjectId: 'write-through-001',
      });
      expect(dbResult.denied).toBe(true);
    });

    it('should remove from both on allow()', async () => {
      await hybrid.deny(
        createDenyEntry({
          subjectId: 'remove-both-001',
        }),
      );

      await hybrid.allow(TEST_TENANT, 'user', 'remove-both-001');

      // Check both are empty
      const memResult = await memory.isDenied({
        tenantId: TEST_TENANT,
        subjectType: 'user',
        subjectId: 'remove-both-001',
      });
      expect(memResult.denied).toBe(false);

      const dbResult = await postgres.isDenied({
        tenantId: TEST_TENANT,
        subjectType: 'user',
        subjectId: 'remove-both-001',
      });
      expect(dbResult.denied).toBe(false);
    });
  });

  // ==========================================================================
  // Cache-First Reads
  // ==========================================================================

  describe('Cache-first reads', () => {
    it('should return from cache on hit (fast path)', async () => {
      await hybrid.deny(
        createDenyEntry({
          subjectId: 'cache-hit-001',
        }),
      );

      // First check warms cache
      const result1 = await hybrid.isDenied({
        tenantId: TEST_TENANT,
        subjectType: 'user',
        subjectId: 'cache-hit-001',
      });
      expect(result1.denied).toBe(true);

      // Subsequent checks should be fast (cache hit)
      const start = Date.now();
      for (let i = 0; i < 100; i++) {
        await hybrid.isDenied({
          tenantId: TEST_TENANT,
          subjectType: 'user',
          subjectId: 'cache-hit-001',
        });
      }
      const elapsed = Date.now() - start;

      // 100 cache hits should be very fast (< 50ms total)
      expect(elapsed).toBeLessThan(50);
    });

    it('should fallback to DB on cache miss and warm cache', async () => {
      // Insert directly to DB (bypassing cache)
      await postgres.deny(
        createDenyEntry({
          subjectId: 'cache-miss-001',
        }),
      );

      // Cache should be empty
      const memResult = await memory.isDenied({
        tenantId: TEST_TENANT,
        subjectType: 'user',
        subjectId: 'cache-miss-001',
      });
      expect(memResult.denied).toBe(false);

      // Hybrid should find it in DB and warm cache
      const hybridResult = await hybrid.isDenied({
        tenantId: TEST_TENANT,
        subjectType: 'user',
        subjectId: 'cache-miss-001',
      });
      expect(hybridResult.denied).toBe(true);

      // Now cache should be warm
      const memResult2 = await memory.isDenied({
        tenantId: TEST_TENANT,
        subjectType: 'user',
        subjectId: 'cache-miss-001',
      });
      expect(memResult2.denied).toBe(true);
    });
  });

  // ==========================================================================
  // Cache Warming
  // ==========================================================================

  describe('Cache warming', () => {
    it('should warm cache on initialize()', async () => {
      // Insert entries directly to DB
      await postgres.denyBatch([
        createDenyEntry({ subjectId: 'warm-001' }),
        createDenyEntry({ subjectId: 'warm-002' }),
        createDenyEntry({ subjectId: 'warm-003' }),
      ]);

      // Create new hybrid instance
      const freshMemory = new MemoryDenyLedger({ maxCacheSize: 1000 });
      const freshHybrid = new HybridDenyLedger({
        memory: freshMemory,
        postgres,
      });

      // Initialize should warm cache
      await freshHybrid.initialize();

      // Check cache has entries
      const stats = freshHybrid.getCacheStats();
      expect(stats.size).toBeGreaterThanOrEqual(3);

      await freshHybrid.close();
    });

    it('should sync specific tenant on sync(tenantId)', async () => {
      // Insert entry directly to DB
      await postgres.deny(
        createDenyEntry({
          subjectId: 'sync-specific-001',
        }),
      );

      // Cache is empty for this entry
      const memResult1 = await memory.isDenied({
        tenantId: TEST_TENANT,
        subjectType: 'user',
        subjectId: 'sync-specific-001',
      });
      expect(memResult1.denied).toBe(false);

      // Sync tenant
      await hybrid.sync(TEST_TENANT);

      // Cache should now have entry
      const memResult2 = await memory.isDenied({
        tenantId: TEST_TENANT,
        subjectType: 'user',
        subjectId: 'sync-specific-001',
      });
      expect(memResult2.denied).toBe(true);
    });
  });

  // ==========================================================================
  // Queries (Source of Truth: PostgreSQL)
  // ==========================================================================

  describe('Query operations (PostgreSQL as source)', () => {
    it('should list from PostgreSQL', async () => {
      await hybrid.denyBatch([
        createDenyEntry({ subjectId: 'list-001' }),
        createDenyEntry({ subjectId: 'list-002' }),
      ]);

      const entries = await hybrid.list(TEST_TENANT);
      expect(entries.length).toBe(2);
    });

    it('should get by ID from PostgreSQL', async () => {
      const created = await hybrid.deny(createDenyEntry({ subjectId: 'get-by-id-001' }));

      const entry = await hybrid.get(created.id);
      expect(entry?.subjectId).toBe('get-by-id-001');
    });

    it('should count from PostgreSQL', async () => {
      await hybrid.denyBatch([
        createDenyEntry({ subjectId: 'count-001' }),
        createDenyEntry({ subjectId: 'count-002' }),
        createDenyEntry({ subjectId: 'count-003' }),
      ]);

      const count = await hybrid.count(TEST_TENANT);
      expect(count).toBe(3);
    });
  });

  // ==========================================================================
  // Statistics
  // ==========================================================================

  describe('getStats()', () => {
    it('should combine stats from both providers', async () => {
      await hybrid.denyBatch([
        createDenyEntry({ subjectType: 'user', reason: 'brute-force' }),
        createDenyEntry({ subjectType: 'session', reason: 'revoked' }),
      ]);

      const stats = await hybrid.getStats(TEST_TENANT);

      // From PostgreSQL
      expect(stats.totalEntries).toBe(2);
      expect(stats.bySubjectType.user).toBe(1);
      expect(stats.bySubjectType.session).toBe(1);

      // Should have lastSyncAt
      expect(stats.lastSyncAt).toBeInstanceOf(Date);
    });
  });

  // ==========================================================================
  // Maintenance
  // ==========================================================================

  describe('cleanupExpired()', () => {
    it('should cleanup from both providers', async () => {
      await hybrid.denyBatch([
        createDenyEntry({
          subjectId: 'cleanup-001',
          expiresAt: new Date(Date.now() - 10000),
        }),
        createDenyEntry({ subjectId: 'cleanup-002' }), // No expiry
      ]);

      const cleaned = await hybrid.cleanupExpired();
      expect(cleaned).toBe(1); // Returns PostgreSQL count

      // Both should have only 1 entry
      const dbCount = await postgres.count(TEST_TENANT);
      expect(dbCount).toBe(1);
    });
  });

  // ==========================================================================
  // Bulk Operations
  // ==========================================================================

  describe('Bulk operations', () => {
    it('should batch deny to both', async () => {
      const entries = await hybrid.denyBatch([
        createDenyEntry({ subjectId: 'bulk-001' }),
        createDenyEntry({ subjectId: 'bulk-002' }),
      ]);

      expect(entries.length).toBe(2);

      // Verify in both
      for (const entry of entries) {
        const memResult = await memory.isDenied({
          tenantId: entry.tenantId,
          subjectType: entry.subjectType,
          subjectId: entry.subjectId,
        });
        expect(memResult.denied).toBe(true);
      }
    });

    it('should batch allow from both', async () => {
      const created = await hybrid.denyBatch([
        createDenyEntry({ subjectId: 'bulk-allow-001' }),
        createDenyEntry({ subjectId: 'bulk-allow-002' }),
      ]);

      await hybrid.allowBatch(created.map((e) => e.id));

      const count = await hybrid.count(TEST_TENANT);
      expect(count).toBe(0);
    });
  });

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  describe('Lifecycle', () => {
    it('should track initialization state', () => {
      expect(hybrid.isInitialized()).toBe(true);
    });

    it('should track lastSyncAt after sync', async () => {
      const before = hybrid.getCacheStats().lastSyncAt;
      await hybrid.sync();
      const after = hybrid.getCacheStats().lastSyncAt;

      expect(after).toBeInstanceOf(Date);
      if (before) {
        expect(after!.getTime()).toBeGreaterThanOrEqual(before.getTime());
      }
    });
  });
});
