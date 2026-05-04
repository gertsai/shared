/**
 * PostgreSQL Rate Limit Adapter
 *
 * Alternative to Redis for rate limiting using PostgreSQL with row-level locking.
 * Implements both Sliding Window and GCRA algorithms.
 *
 * Uses:
 * - Prisma transactions for atomicity
 * - SELECT ... FOR UPDATE for row locking
 * - BigInt arrays for timestamp storage (Sliding Window)
 * - BigInt for TAT storage (GCRA)
 *
 * @module @gertsai/api-rlr/adapters
 */
import type { GCRAResult, SlidingWindowResult, StorageAdapter } from './StorageAdapter';

/**
 * Minimal transaction client — subset of Prisma's transaction client surface.
 * Compatible с Prisma, Drizzle, raw `pg`, etc. через structural typing.
 */
export interface TransactionClient {
  $queryRawUnsafe<T>(query: string, ...values: unknown[]): Promise<T>;
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>;
}

/**
 * Database client interface — structurally compatible с Prisma, Drizzle, raw pg, etc.
 *
 * Per ADR-011 (invariants I-1, I-2): @gertsai/api-rlr core НЕ зависит от
 * @gertsai/database или конкретного ORM. PrismaClient instances drop-in
 * совместимы через structural typing — потребители продолжают передавать
 * `prisma: prismaInstance` без изменений.
 */
export interface PgClient {
  $queryRawUnsafe<T>(query: string, ...values: unknown[]): Promise<T>;
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>;
  $transaction<T>(fn: (tx: TransactionClient) => Promise<T>): Promise<T>;
}

/**
 * Configuration for PostgreSQLAdapter
 */
export interface PostgreSQLAdapterConfig {
  /**
   * Database client instance (Prisma, Drizzle, raw pg — structurally compatible).
   */
  prisma: PgClient;

  /**
   * Optional prefix for rate limit keys
   * @default 'rl:'
   */
  keyPrefix?: string;

  /**
   * Reserved for future use: enable cleanup of expired buckets on each operation
   * Currently not implemented - use cleanup() method with a background job instead
   * @default false
   */
  autoCleanup?: boolean;
}

/**
 * PostgreSQL-based rate limiting adapter
 *
 * @example
 * ```typescript
 * import { PrismaClient } from '@prisma/client';
 * import { PostgreSQLAdapter } from '@gertsai/api-rlr';
 *
 * const prisma = new PrismaClient();
 * const adapter = new PostgreSQLAdapter({ prisma });
 *
 * // Sliding Window
 * const [allow, hits, remaining, reset] = await adapter.incrementSW(
 *   'user:123:api',
 *   60000,  // 1 minute
 *   100,    // 100 requests per minute
 *   Date.now()
 * );
 *
 * // GCRA
 * const [allow, remaining, retryAfter] = await adapter.gcraCheck(
 *   'user:123:api',
 *   60000,  // 1 minute
 *   100,    // 100 requests per minute
 *   10,     // burst capacity
 *   Date.now()
 * );
 * ```
 */
export class PostgreSQLAdapter implements StorageAdapter {
  private readonly prisma: PgClient;
  private readonly keyPrefix: string;

  constructor(config: PostgreSQLAdapterConfig) {
    this.prisma = config.prisma;
    this.keyPrefix = config.keyPrefix ?? 'rl:';
    // autoCleanup is reserved for future use (background cleanup)
  }

  /**
   * Sliding Window rate limiting algorithm
   *
   * Algorithm (matching Redis Lua script):
   * 1. Calculate current and previous window boundaries
   * 2. Remove old timestamps (older than previous window start)
   * 3. Count current window requests
   * 4. Count previous window requests with weighting (75% if in first quarter)
   * 5. If total < limit: add request, return allow=1
   * 6. Else: return allow=0 with reset time
   *
   * @param key - Rate limit key
   * @param timeFrame - Time window in milliseconds
   * @param limit - Maximum requests per timeFrame
   * @param now - Current timestamp in milliseconds
   * @returns [allowFlag, totalHits, remainingHits, resetMs]
   */
  async incrementSW(
    key: string,
    timeFrame: number,
    limit: number,
    now: number,
  ): Promise<SlidingWindowResult> {
    const fullKey = this.keyPrefix + key;

    // Calculate window boundaries
    const quarterTimeFrame = timeFrame / 4;
    const currentWindowStart = now - (now % timeFrame);
    const previousWindowEnd = currentWindowStart - 1;
    const previousWindowStart = previousWindowEnd - timeFrame;
    const windowElapsedTime = now - currentWindowStart;

    // Weight for previous window (75% if in first quarter of current window)
    const previousWindowWeight = windowElapsedTime <= quarterTimeFrame ? 0.75 : 0;

    // TTL: expire at end of next window
    const expiresAt = new Date(now + timeFrame * 2);

    // Use transaction with row locking for atomicity
    return await this.prisma.$transaction(async (tx: TransactionClient) => {
      // Try to get existing bucket with lock
      const bucket = await tx.$queryRawUnsafe<
        Array<{ key: string; timestamps: bigint[]; expires_at: Date }>
      >(
        `SELECT key, timestamps, expires_at
         FROM gerts_rate_limit_buckets
         WHERE key = $1
         FOR UPDATE`,
        fullKey,
      );

      let timestamps: bigint[] = [];

      if (bucket.length > 0) {
        timestamps = bucket[0].timestamps || [];
      }

      // Remove old timestamps (older than previous window start)
      const filteredTimestamps = timestamps.filter((ts) => Number(ts) >= previousWindowStart);

      // Count requests in current window
      const currentWindowRequests = filteredTimestamps.filter(
        (ts) => Number(ts) >= currentWindowStart && Number(ts) <= now,
      ).length;

      // Count requests in previous window
      const previousWindowRequests = filteredTimestamps.filter(
        (ts) => Number(ts) >= previousWindowStart && Number(ts) <= previousWindowEnd,
      ).length;

      // Apply weighting
      const weightedPreviousRequests = Math.floor(previousWindowRequests * previousWindowWeight);

      // Calculate total weighted requests
      const totalWeightedRequests = currentWindowRequests + weightedPreviousRequests;

      if (totalWeightedRequests < limit) {
        // Add current request timestamp
        const newTimestamps = [...filteredTimestamps, BigInt(now)];

        // Upsert bucket
        await tx.$executeRawUnsafe(
          `INSERT INTO gerts_rate_limit_buckets (key, timestamps, tat, expires_at, created_at, updated_at)
           VALUES ($1, $2, 0, $3, NOW(), NOW())
           ON CONFLICT (key) DO UPDATE SET
             timestamps = $2,
             expires_at = $3,
             updated_at = NOW()`,
          fullKey,
          newTimestamps,
          expiresAt,
        );

        // Return: allow=1, totalHits (after increment), remainingHits, resetMs
        return [
          1,
          totalWeightedRequests + 1,
          limit - totalWeightedRequests - 1,
          timeFrame - windowElapsedTime,
        ] as SlidingWindowResult;
      } else {
        // Rate limited - calculate reset time
        const oldestTimestamp = filteredTimestamps.length > 0 ? Number(filteredTimestamps[0]) : now;
        const resetTime = Math.max(oldestTimestamp + timeFrame - now, 0);

        // Return: allow=0, totalHits (at limit), remaining=0, resetMs
        return [0, limit, 0, resetTime] as SlidingWindowResult;
      }
    });
  }

  /**
   * GCRA (Generic Cell Rate Algorithm) rate limiting
   *
   * Algorithm (matching Redis Lua script):
   * 1. I = timeFrame / limit (inter-arrival time)
   * 2. L = burst capacity
   * 3. Get TAT (Theoretical Arrival Time)
   * 4. earliest = TAT - (L * I)
   * 5. If now >= earliest: allow, update TAT
   * 6. Else: block, retryAfter = earliest - now
   *
   * @param key - Rate limit key
   * @param timeFrame - Time window in milliseconds
   * @param limit - Maximum requests per timeFrame
   * @param burst - Additional burst capacity
   * @param now - Current timestamp in milliseconds
   * @returns [allowFlag, remaining, retryAfterMs]
   */
  async gcraCheck(
    key: string,
    timeFrame: number,
    limit: number,
    burst: number,
    now: number,
  ): Promise<GCRAResult> {
    const fullKey = this.keyPrefix + key;

    // Inter-arrival time per request
    const I = Math.floor(timeFrame / Math.max(1, limit));
    // Burst capacity
    const L = burst;

    // TTL: expire at end of next window
    const expiresAt = new Date(now + timeFrame * 2);

    // Use transaction with row locking for atomicity
    return await this.prisma.$transaction(async (tx: TransactionClient) => {
      // Try to get existing bucket with lock
      const bucket = await tx.$queryRawUnsafe<
        Array<{ key: string; tat: bigint; expires_at: Date }>
      >(
        `SELECT key, tat, expires_at
         FROM gerts_rate_limit_buckets
         WHERE key = $1
         FOR UPDATE`,
        fullKey,
      );

      let tat = 0;

      if (bucket.length > 0) {
        tat = Number(bucket[0].tat) || 0;
      }

      // Initialize TAT if zero
      if (tat === 0) {
        tat = now;
      }

      // Calculate earliest allowed time
      const earliest = tat - L * I;

      let allow = 0;
      let retryAfter = 0;
      let remaining = 0;

      if (now >= earliest) {
        // Request allowed
        allow = 1;
        const newTat = Math.max(tat, now) + I;

        // Upsert bucket with new TAT
        await tx.$executeRawUnsafe(
          `INSERT INTO gerts_rate_limit_buckets (key, tat, timestamps, expires_at, created_at, updated_at)
           VALUES ($1, $2, '{}', $3, NOW(), NOW())
           ON CONFLICT (key) DO UPDATE SET
             tat = $2,
             expires_at = $3,
             updated_at = NOW()`,
          fullKey,
          BigInt(newTat),
          expiresAt,
        );

        // Remaining capacity after this request (matches GCRA Lua formula)
        remaining = Math.max(0, Math.floor((now + L * I - newTat) / I));
      } else {
        // Request blocked
        allow = 0;
        retryAfter = earliest - now;
        remaining = 0;
      }

      return [allow, remaining, retryAfter] as GCRAResult;
    });
  }

  /**
   * Clean up expired buckets
   *
   * Call this periodically via cron/scheduler to remove old entries.
   *
   * @returns Number of deleted buckets
   */
  async cleanup(): Promise<number> {
    const result = await this.prisma.$executeRawUnsafe(
      `DELETE FROM gerts_rate_limit_buckets WHERE expires_at < NOW()`,
    );
    return result;
  }

  /**
   * Delete a specific bucket
   *
   * @param key - Rate limit key to delete
   */
  async delete(key: string): Promise<void> {
    const fullKey = this.keyPrefix + key;
    await this.prisma.$executeRawUnsafe(
      `DELETE FROM gerts_rate_limit_buckets WHERE key = $1`,
      fullKey,
    );
  }

  /**
   * Reset all buckets (for testing)
   */
  async reset(): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `DELETE FROM gerts_rate_limit_buckets WHERE key LIKE $1`,
      `${this.keyPrefix}%`,
    );
  }
}
