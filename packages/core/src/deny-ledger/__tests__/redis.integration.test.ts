/**
 * Integration Tests for Redis Deny Ledger Provider
 *
 * These tests verify:
 * - Redis caching with PostgreSQL backup
 * - Eager cache warming on startup
 * - Cache hit/miss behavior
 * - Pub/sub invalidation (simulated)
 * - Multi-key lookup patterns
 *
 * @requires Redis server
 * @requires PostgreSQL database
 * @see RFC-042 Appendix I.5 - Deny Ledger Architecture
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { RedisDenyLedger, type RedisClientLike } from '../providers/redis';
import { PostgresDenyLedger } from '../providers/postgres';
import type { DenyEntryCreate } from '../types';

// ============================================================================
// Test Configuration
// ============================================================================

/**
 * Skip tests if Redis/PostgreSQL is not available
 */
const HAS_REDIS =
  process.env.HAS_REDIS === '1' ||
  process.env.REDIS_URL?.includes('redis://') ||
  process.env.QUEUE_REDIS_HOST;

const HAS_POSTGRES =
  process.env.HAS_POSTGRES === '1' ||
  process.env.DATABASE_URL?.includes('postgres') ||
  process.env.DATABASE_URL?.includes('postgresql');

const HAS_BOTH = HAS_REDIS && HAS_POSTGRES;

const describeIntegration = HAS_BOTH ? describe : describe.skip;

// Test constants
const TEST_PREFIX = `redis_deny_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const TEST_TENANT = `${TEST_PREFIX}_tenant`;

// ============================================================================
// Test Utilities
// ============================================================================

// Type for PrismaClient
interface PrismaClientForTest {
  $connect: () => Promise<void>;
  $disconnect: () => Promise<void>;
  $executeRawUnsafe: (sql: string) => Promise<unknown>;
}

/**
 * Create Redis client for testing
 */
async function createTestRedis(): Promise<{
  redis: RedisClientLike;
  cleanup: () => Promise<void>;
  disconnect: () => Promise<void>;
}> {
  // @ts-expect-error - ioredis is available in test environment
  const Redis = (await import('ioredis')).default;

  const host = process.env.QUEUE_REDIS_HOST || 'localhost';
  const port = parseInt(process.env.QUEUE_REDIS_PORT || '6379', 10);

  const redis = new Redis({ host, port, lazyConnect: true });
  await redis.connect();

  const cleanup = async () => {
    // Delete test keys
    const keys = await redis.keys(`deny:${TEST_PREFIX}*`);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  };

  const disconnect = async () => {
    redis.disconnect();
  };

  return { redis: redis as RedisClientLike, cleanup, disconnect };
}

/**
 * Create Prisma client for testing
 */
async function createTestPrisma(): Promise<{
  prisma: unknown;
  cleanup: () => Promise<void>;
  disconnect: () => Promise<void>;
}> {
  // @ts-expect-error - @gerts/database is available in test environment
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
      // Table might not exist
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

describeIntegration('RedisDenyLedger Integration Tests', () => {
  let redis: RedisClientLike;
  let redisCleanup: () => Promise<void>;
  let redisDisconnect: () => Promise<void>;

  let prisma: unknown;
  let prismaCleanup: () => Promise<void>;
  let prismaDisconnect: () => Promise<void>;

  let postgres: PostgresDenyLedger;
  let ledger: RedisDenyLedger;

  beforeAll(async () => {
    // Set up Redis
    const redisResult = await createTestRedis();
    redis = redisResult.redis;
    redisCleanup = redisResult.cleanup;
    redisDisconnect = redisResult.disconnect;

    // Set up PostgreSQL
    const prismaResult = await createTestPrisma();
    prisma = prismaResult.prisma;
    prismaCleanup = prismaResult.cleanup;
    prismaDisconnect = prismaResult.disconnect;

    // Create providers
    postgres = new PostgresDenyLedger({ prisma: prisma as never });
    ledger = new RedisDenyLedger({
      redis,
      postgres,
      warmupMode: 'eager',
      enablePubSub: false, // Disable pub/sub for tests (requires separate connection)
    });

    await ledger.initialize();
  });

  afterAll(async () => {
    await redisCleanup();
    await prismaCleanup();
    await ledger.close();
    await redisDisconnect();
    await prismaDisconnect();
  });

  beforeEach(async () => {
    await redisCleanup();
    await prismaCleanup();
    ledger.resetStats();
  });

  afterEach(async () => {
    await redisCleanup();
    await prismaCleanup();
  });

  // ==========================================================================
  // Cache Behavior
  // ==========================================================================

  describe('Cache behavior', () => {
    it('should cache entry in Redis after deny()', async () => {
      const entry = await ledger.deny(
        createDenyEntry({
          subjectId: 'cache-test-001',
        }),
      );

      // Verify in Redis
      const key = `deny:${TEST_TENANT}:user:cache-test-001::`;
      const cached = await redis.get(key);
      expect(cached).not.toBeNull();

      const parsed = JSON.parse(cached!);
      expect(parsed.id).toBe(entry.id);
    });

    it('should return from Redis cache (cache hit)', async () => {
      await ledger.deny(
        createDenyEntry({
          subjectId: 'cache-hit-001',
        }),
      );

      // First check (might be from cache)
      const result1 = await ledger.isDenied({
        tenantId: TEST_TENANT,
        subjectType: 'user',
        subjectId: 'cache-hit-001',
      });
      expect(result1.denied).toBe(true);

      // Second check (definitely from cache)
      const result2 = await ledger.isDenied({
        tenantId: TEST_TENANT,
        subjectType: 'user',
        subjectId: 'cache-hit-001',
      });
      expect(result2.denied).toBe(true);

      // Check stats
      const stats = ledger.getCacheStats();
      expect(stats.hits).toBeGreaterThan(0);
    });

    it('should fallback to PostgreSQL on cache miss', async () => {
      // Insert directly to PostgreSQL (bypassing Redis)
      await postgres.deny(
        createDenyEntry({
          subjectId: 'cache-miss-001',
        }),
      );

      // Clear Redis cache
      await redisCleanup();

      // Check (should fallback to PostgreSQL)
      const result = await ledger.isDenied({
        tenantId: TEST_TENANT,
        subjectType: 'user',
        subjectId: 'cache-miss-001',
      });

      expect(result.denied).toBe(true);

      // Should have warmed cache
      const key = `deny:${TEST_TENANT}:user:cache-miss-001::`;
      const cached = await redis.get(key);
      expect(cached).not.toBeNull();
    });

    it('should remove from Redis on allow()', async () => {
      await ledger.deny(
        createDenyEntry({
          subjectId: 'allow-test-001',
        }),
      );

      // Verify cached
      let cached = await redis.get(`deny:${TEST_TENANT}:user:allow-test-001::`);
      expect(cached).not.toBeNull();

      // Allow
      await ledger.allow(TEST_TENANT, 'user', 'allow-test-001');

      // Verify removed from cache
      cached = await redis.get(`deny:${TEST_TENANT}:user:allow-test-001::`);
      expect(cached).toBeNull();

      // Verify removed from PostgreSQL
      const result = await ledger.isDenied({
        tenantId: TEST_TENANT,
        subjectType: 'user',
        subjectId: 'allow-test-001',
      });
      expect(result.denied).toBe(false);
    });
  });

  // ==========================================================================
  // Eager Warming
  // ==========================================================================

  describe('Eager warming', () => {
    it('should warm cache from PostgreSQL on initialize', async () => {
      // Insert entries directly to PostgreSQL (use unique tenant to avoid cleanup interference)
      const warmTenant = `${TEST_PREFIX}_warm_tenant`;
      await postgres.denyBatch([
        createDenyEntry({ tenantId: warmTenant, subjectId: 'warm-001' }),
        createDenyEntry({ tenantId: warmTenant, subjectId: 'warm-002' }),
        createDenyEntry({ tenantId: warmTenant, subjectId: 'warm-003' }),
      ]);

      // Clear Redis to ensure fresh state
      const existingKeys = await redis.keys(`deny:${warmTenant}:*`);
      if (existingKeys.length > 0) {
        await redis.del(...existingKeys);
      }

      // Create new ledger instance (shares postgres connection)
      const freshLedger = new RedisDenyLedger({
        redis,
        postgres,
        warmupMode: 'eager',
        enablePubSub: false,
      });

      await freshLedger.initialize();

      // Verify entries are in Redis
      const keys = await redis.keys(`deny:${warmTenant}:*`);
      expect(keys.length).toBeGreaterThanOrEqual(3);

      // Cleanup
      await freshLedger.close();
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    });
  });

  // ==========================================================================
  // TTL and Expiration
  // ==========================================================================

  describe('TTL and expiration', () => {
    it('should set TTL on cached entries', async () => {
      await ledger.deny(
        createDenyEntry({
          subjectId: 'ttl-test-001',
        }),
      );

      const key = `deny:${TEST_TENANT}:user:ttl-test-001::`;
      const ttl = await redis.ttl(key);

      // Should have TTL set (default is 3600)
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(3600);
    });

    it('should not cache expired entries', async () => {
      // Create entry with past expiration
      await postgres.deny(
        createDenyEntry({
          subjectId: 'expired-001',
          expiresAt: new Date(Date.now() - 1000), // Already expired
        }),
      );

      // Try to check (should not cache)
      const result = await ledger.isDenied({
        tenantId: TEST_TENANT,
        subjectType: 'user',
        subjectId: 'expired-001',
      });

      expect(result.denied).toBe(false);
    });

    it('should handle entry expiration in cache', async () => {
      // Create entry that will expire
      await ledger.deny(
        createDenyEntry({
          subjectId: 'expiring-001',
          expiresAt: new Date(Date.now() + 100), // Expires in 100ms
        }),
      );

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Check should return not denied (or clean up)
      const result = await ledger.isDenied({
        tenantId: TEST_TENANT,
        subjectType: 'user',
        subjectId: 'expiring-001',
      });

      expect(result.denied).toBe(false);
    });
  });

  // ==========================================================================
  // Bulk Operations
  // ==========================================================================

  describe('Bulk operations', () => {
    it('should cache all entries from denyBatch()', async () => {
      const entries = await ledger.denyBatch([
        createDenyEntry({ subjectId: 'batch-001' }),
        createDenyEntry({ subjectId: 'batch-002' }),
        createDenyEntry({ subjectId: 'batch-003' }),
      ]);

      expect(entries.length).toBe(3);

      // Verify all cached
      for (const entry of entries) {
        const key = `deny:${TEST_TENANT}:user:${entry.subjectId}::`;
        const cached = await redis.get(key);
        expect(cached).not.toBeNull();
      }
    });

    it('should remove all from Redis on allowBatch()', async () => {
      const created = await ledger.denyBatch([
        createDenyEntry({ subjectId: 'allow-batch-001' }),
        createDenyEntry({ subjectId: 'allow-batch-002' }),
      ]);

      await ledger.allowBatch(created.map((e) => e.id));

      // Verify all removed
      const keys = await redis.keys(`deny:${TEST_TENANT}:user:allow-batch-*`);
      expect(keys.length).toBe(0);
    });
  });

  // ==========================================================================
  // Statistics
  // ==========================================================================

  describe('Statistics', () => {
    it('should track cache hit/miss stats', async () => {
      // Create entry
      await ledger.deny(
        createDenyEntry({
          subjectId: 'stats-001',
        }),
      );

      // Cache hit
      await ledger.isDenied({
        tenantId: TEST_TENANT,
        subjectType: 'user',
        subjectId: 'stats-001',
      });

      // Cache miss (non-existent)
      await ledger.isDenied({
        tenantId: TEST_TENANT,
        subjectType: 'user',
        subjectId: 'non-existent',
      });

      const stats = ledger.getCacheStats();
      expect(stats.hits).toBeGreaterThanOrEqual(1);
      // Note: misses only counted when entry found in PostgreSQL
    });

    it('should reset stats', async () => {
      await ledger.deny(createDenyEntry({ subjectId: 'reset-stats-001' }));
      await ledger.isDenied({
        tenantId: TEST_TENANT,
        subjectType: 'user',
        subjectId: 'reset-stats-001',
      });

      ledger.resetStats();

      const stats = ledger.getCacheStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
    });
  });

  // ==========================================================================
  // Tenant Refresh
  // ==========================================================================

  describe('Tenant refresh', () => {
    it('should refresh tenant cache from PostgreSQL', async () => {
      // Create entry via ledger
      await ledger.deny(
        createDenyEntry({
          subjectId: 'refresh-001',
        }),
      );

      // Add entry directly to PostgreSQL (simulating another node)
      await postgres.deny(
        createDenyEntry({
          subjectId: 'refresh-002',
        }),
      );

      // Refresh tenant
      await ledger.refreshTenant(TEST_TENANT);

      // Both should be in cache
      const keys = await redis.keys(`deny:${TEST_TENANT}:*`);
      expect(keys.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ==========================================================================
  // Cleanup
  // ==========================================================================

  describe('Cleanup', () => {
    it('should cleanup expired entries from Redis', async () => {
      // Create expired entry directly in Redis
      const key = `deny:${TEST_TENANT}:user:cleanup-001::`;
      const expiredEntry = {
        id: 'test-id',
        tenantId: TEST_TENANT,
        subjectType: 'user',
        subjectId: 'cleanup-001',
        reason: 'brute-force',
        expiresAt: new Date(Date.now() - 1000).toISOString(),
        createdAt: new Date().toISOString(),
      };
      await redis.set(key, JSON.stringify(expiredEntry));

      // Run cleanup
      await ledger.cleanupExpired();

      // Verify removed
      const cached = await redis.get(key);
      expect(cached).toBeNull();
    });
  });
});
