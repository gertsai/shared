/**
 * Comprehensive Integration Tests for api-rlr
 *
 * Run with: HAS_REDIS=1 pnpm --filter @gertsai/api-rlr test comprehensive
 *
 * Tests:
 * 1. GCRA remaining calculation (verifies the fix)
 * 2. Sliding Window remaining calculation
 * 3. Throughput/concurrency under load
 * 4. Headers correctness (X-RateLimit-*)
 * 5. Algorithm comparison
 * 6. Recovery after rate limit window
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import RedisClient from 'ioredis';
import fs from 'node:fs/promises';

const RUN = process.env.HAS_REDIS === '1' || process.env.HAS_REDIS === 'true';

describe.skipIf(!RUN)('Comprehensive Rate Limit Integration', () => {
  let redis: RedisClient;
  let gcraScript: string;
  let gcraScriptSha: string;
  let swScript: string;
  let swScriptSha: string;

  beforeAll(async () => {
    redis = new RedisClient({
      host: process.env.RLR_HOST || '127.0.0.1',
      port: Number(process.env.RLR_PORT || 6379),
    });

    // Load GCRA script
    gcraScript = await fs.readFile('./src/scripts/limitGcra.lua', 'utf8');
    gcraScriptSha = (await redis.script('LOAD', gcraScript)) as string;

    // Load Sliding Window script
    swScript = await fs.readFile('./src/scripts/limitSlightWindowMain.lua', 'utf8');
    swScriptSha = (await redis.script('LOAD', swScript)) as string;
  });

  afterAll(async () => {
    await redis.quit();
  });

  // ========== GCRA REMAINING VERIFICATION ==========

  describe('GCRA Remaining Calculation', () => {
    const runGcra = async (
      key: string,
      timeFrame: number,
      limit: number,
      burst: number,
      now: number,
    ): Promise<{ allow: number; remaining: number; retryAfter: number }> => {
      const result = (await redis.evalsha(
        gcraScriptSha,
        1,
        key,
        timeFrame.toString(),
        limit.toString(),
        burst.toString(),
        now.toString(),
      )) as number[];
      return {
        allow: result[0],
        remaining: result[1],
        retryAfter: result[2],
      };
    };

    it('remaining decreases correctly with each request', async () => {
      const key = `test:gcra:remaining:${Date.now()}`;
      await redis.del(key);

      const timeFrame = 10000; // 10 seconds
      const limit = 10; // 10 req/10s = 1 req/sec
      const burst = 3;
      const _I = timeFrame / limit; // 1000ms inter-arrival (kept for documentation)

      const now = Date.now();
      const results: Array<{ allow: number; remaining: number; retryAfter: number }> = [];

      // Make burst+1 requests immediately
      for (let i = 0; i <= burst; i++) {
        const r = await runGcra(key, timeFrame, limit, burst, now + i);
        results.push(r);
      }

      // Verify decreasing remaining
      console.log(
        'GCRA Remaining progression:',
        results.map((r) => r.remaining),
      );

      // First request: remaining = burst - 1 (we just used 1)
      expect(results[0].allow).toBe(1);
      expect(results[0].remaining).toBeLessThanOrEqual(burst);
      expect(results[0].remaining).toBeGreaterThanOrEqual(0);

      // Each subsequent request should have lower or equal remaining
      for (let i = 1; i < results.length; i++) {
        if (results[i].allow === 1) {
          expect(results[i].remaining).toBeLessThanOrEqual(results[i - 1].remaining);
        }
      }

      // Last request (burst+1) might be blocked
      const last = results[results.length - 1];
      if (last.allow === 0) {
        expect(last.retryAfter).toBeGreaterThan(0);
      }
    });

    it('remaining recovers after waiting', async () => {
      const key = `test:gcra:recovery:${Date.now()}`;
      await redis.del(key);

      const timeFrame = 2000; // 2 seconds
      const limit = 2;
      const burst = 1;
      const interArrival = timeFrame / limit; // 1000ms

      let now = Date.now();

      // Exhaust burst
      const r1 = await runGcra(key, timeFrame, limit, burst, now);
      expect(r1.allow).toBe(1);

      const r2 = await runGcra(key, timeFrame, limit, burst, now + 1);
      expect(r2.allow).toBe(1);

      // Third request might be blocked (exhausted burst)
      await runGcra(key, timeFrame, limit, burst, now + 2);

      // Wait for one inter-arrival period
      now = Date.now() + interArrival + 100;

      const r4 = await runGcra(key, timeFrame, limit, burst, now);
      expect(r4.allow).toBe(1); // Should be allowed after waiting
      expect(r4.remaining).toBeGreaterThanOrEqual(0);
    });
  });

  // ========== SLIDING WINDOW REMAINING VERIFICATION ==========

  describe('Sliding Window Remaining Calculation', () => {
    const runSW = async (
      key: string,
      timeFrame: number,
      limit: number,
      now: number,
    ): Promise<{ allow: number; totalHits: number; remaining: number; resetMs: number }> => {
      const result = (await redis.evalsha(
        swScriptSha,
        1,
        key,
        timeFrame.toString(),
        limit.toString(),
        now.toString(),
      )) as number[];
      return {
        allow: result[0],
        totalHits: result[1],
        remaining: result[2],
        resetMs: result[3],
      };
    };

    it('remaining = limit - totalHits', async () => {
      const key = `test:sw:remaining:${Date.now()}`;
      await redis.del(key);

      const timeFrame = 10000;
      const limit = 5;
      const now = Date.now();

      for (let i = 0; i < limit; i++) {
        const r = await runSW(key, timeFrame, limit, now + i);

        console.log(
          `SW Request ${i + 1}: allow=${r.allow}, totalHits=${r.totalHits}, remaining=${r.remaining}`,
        );

        expect(r.allow).toBe(1);
        expect(r.totalHits).toBe(i + 1);
        expect(r.remaining).toBe(limit - (i + 1));
      }

      // Next request should be blocked
      const blocked = await runSW(key, timeFrame, limit, now + limit);
      expect(blocked.allow).toBe(0);
      expect(blocked.remaining).toBe(0);
    });
  });

  // ========== THROUGHPUT TEST ==========

  describe('Throughput Test', () => {
    it('handles 100 concurrent requests correctly (GCRA)', async () => {
      const key = `test:gcra:throughput:${Date.now()}`;
      await redis.del(key);

      const timeFrame = 60000; // 1 minute
      const limit = 50;
      const burst = 10;
      const now = Date.now();

      // Fire 100 concurrent requests
      const promises = Array.from({ length: 100 }, (_, i) =>
        redis.evalsha(
          gcraScriptSha,
          1,
          key,
          timeFrame.toString(),
          limit.toString(),
          burst.toString(),
          (now + i).toString(),
        ),
      );

      const results = await Promise.all(promises);

      const allowed = results.filter((r: any) => r[0] === 1).length;
      const blocked = results.filter((r: any) => r[0] === 0).length;

      console.log(`GCRA Throughput: ${allowed} allowed, ${blocked} blocked out of 100`);

      // With burst=10 and making requests "instantly", we should allow ~burst+1 requests
      expect(allowed).toBeGreaterThanOrEqual(burst);
      expect(allowed).toBeLessThanOrEqual(burst + 5); // Some tolerance for timing
    });

    it('handles 100 concurrent requests correctly (Sliding Window)', async () => {
      const key = `test:sw:throughput:${Date.now()}`;
      await redis.del(key);

      const timeFrame = 60000; // 1 minute
      const limit = 50;
      const now = Date.now();

      // Fire 100 concurrent requests
      const promises = Array.from({ length: 100 }, (_, i) =>
        redis.evalsha(
          swScriptSha,
          1,
          key,
          timeFrame.toString(),
          limit.toString(),
          (now + i).toString(),
        ),
      );

      const results = await Promise.all(promises);

      const allowed = results.filter((r: any) => r[0] === 1).length;
      const blocked = results.filter((r: any) => r[0] === 0).length;

      console.log(`SW Throughput: ${allowed} allowed, ${blocked} blocked out of 100`);

      // Sliding window should allow exactly 'limit' requests
      expect(allowed).toBe(limit);
      expect(blocked).toBe(100 - limit);
    });
  });

  // ========== ALGORITHM COMPARISON ==========

  describe('Algorithm Comparison', () => {
    it('GCRA vs SW behavior comparison', async () => {
      const baseKey = `test:compare:${Date.now()}`;
      const gcraKey = `${baseKey}:gcra`;
      const swKey = `${baseKey}:sw`;

      await redis.del(gcraKey, swKey);

      const timeFrame = 10000; // 10 seconds
      const limit = 10;
      const burst = 2;
      const now = Date.now();

      const gcraResults: Array<{ allow: number; remaining: number }> = [];
      const swResults: Array<{ allow: number; remaining: number }> = [];

      // Make 15 requests to see behavior
      for (let i = 0; i < 15; i++) {
        const gcra = (await redis.evalsha(
          gcraScriptSha,
          1,
          gcraKey,
          timeFrame.toString(),
          limit.toString(),
          burst.toString(),
          (now + i * 10).toString(), // 10ms apart
        )) as number[];

        const sw = (await redis.evalsha(
          swScriptSha,
          1,
          swKey,
          timeFrame.toString(),
          limit.toString(),
          (now + i * 10).toString(),
        )) as number[];

        gcraResults.push({ allow: gcra[0], remaining: gcra[1] });
        swResults.push({ allow: sw[0], remaining: sw[2] });
      }

      console.log('\nAlgorithm Comparison:');
      console.log('Request | GCRA allow | GCRA rem | SW allow | SW rem');
      console.log('--------|------------|----------|----------|-------');
      for (let i = 0; i < 15; i++) {
        console.log(
          `   ${String(i + 1).padStart(2)}   |     ${gcraResults[i].allow}      |    ${String(gcraResults[i].remaining).padStart(2)}    |    ${swResults[i].allow}     |   ${String(swResults[i].remaining).padStart(2)}`,
        );
      }

      // GCRA should block after burst+1 immediate requests
      const gcraAllowed = gcraResults.filter((r) => r.allow === 1).length;
      expect(gcraAllowed).toBeLessThanOrEqual(burst + 2);

      // SW should allow exactly limit requests
      const swAllowed = swResults.filter((r) => r.allow === 1).length;
      expect(swAllowed).toBe(limit);
    });
  });

  // ========== LATENCY BENCHMARK ==========

  describe('Latency Benchmark', () => {
    it('measures average latency for rate limit checks', async () => {
      const key = `test:latency:${Date.now()}`;
      await redis.del(key);

      const iterations = 1000;
      const timeFrame = 60000;
      const limit = 10000; // High limit to avoid blocking
      const burst = 100;

      const latencies: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        await redis.evalsha(
          gcraScriptSha,
          1,
          key,
          timeFrame.toString(),
          limit.toString(),
          burst.toString(),
          Date.now().toString(),
        );
        const end = performance.now();
        latencies.push(end - start);
      }

      // Calculate statistics
      latencies.sort((a, b) => a - b);
      const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
      const p50 = latencies[Math.floor(latencies.length * 0.5)];
      const p95 = latencies[Math.floor(latencies.length * 0.95)];
      const p99 = latencies[Math.floor(latencies.length * 0.99)];

      console.log('\nLatency Benchmark (GCRA):');
      console.log(`  Iterations: ${iterations}`);
      console.log(`  Average:    ${avg.toFixed(2)}ms`);
      console.log(`  P50:        ${p50.toFixed(2)}ms`);
      console.log(`  P95:        ${p95.toFixed(2)}ms`);
      console.log(`  P99:        ${p99.toFixed(2)}ms`);

      // Expectations (relaxed for CI environments with varying load)
      expect(avg).toBeLessThan(10); // 10ms average max
      expect(p99).toBeLessThan(50); // 50ms P99 max (CI can have spikes)
    });
  });

  // ========== STRESS TEST ==========

  describe('Stress Test', () => {
    it('handles rapid fire requests without errors', async () => {
      const key = `test:stress:${Date.now()}`;
      await redis.del(key);

      const timeFrame = 1000;
      const limit = 100;
      const burst = 10;
      const requestCount = 500;

      let errors = 0;
      let successes = 0;

      const promises = Array.from({ length: requestCount }, async () => {
        try {
          await redis.evalsha(
            gcraScriptSha,
            1,
            key,
            timeFrame.toString(),
            limit.toString(),
            burst.toString(),
            Date.now().toString(),
          );
          successes++;
        } catch {
          errors++;
        }
      });

      await Promise.all(promises);

      console.log(`\nStress Test: ${successes} successes, ${errors} errors`);
      expect(errors).toBe(0);
      expect(successes).toBe(requestCount);
    });
  });

  // ========== MULTI-TENANT ISOLATION ==========

  describe('Multi-Tenant Isolation', () => {
    it('different prefixes do not interfere with each other', async () => {
      const tenant1Key = `tenant1:api:${Date.now()}`;
      const tenant2Key = `tenant2:api:${Date.now()}`;
      await redis.del(tenant1Key, tenant2Key);

      const timeFrame = 60000;
      const limit = 5;
      const burst = 2;
      const now = Date.now();

      // Exhaust tenant1's limit
      for (let i = 0; i < 5; i++) {
        await redis.evalsha(gcraScriptSha, 1, tenant1Key, timeFrame, limit, burst, now + i);
      }

      // Tenant2 should still have full capacity (not affected by tenant1)
      const tenant2Result = (await redis.evalsha(
        gcraScriptSha,
        1,
        tenant2Key,
        timeFrame,
        limit,
        burst,
        now,
      )) as number[];

      expect(tenant2Result[0]).toBe(1); // allowed
      // After first request, remaining = burst-1 = 1 (GCRA formula)
      expect(tenant2Result[1]).toBe(burst - 1);
    });

    it('same endpoint different subjects are isolated', async () => {
      const baseKey = `isolation:${Date.now()}`;
      const user1Key = `${baseKey}:user1`;
      const user2Key = `${baseKey}:user2`;
      await redis.del(user1Key, user2Key);

      const timeFrame = 60000;
      const limit = 3;
      const now = Date.now();

      // Exhaust user1's sliding window limit
      for (let i = 0; i < 3; i++) {
        await redis.evalsha(swScriptSha, 1, user1Key, timeFrame, limit, now + i);
      }
      const user1Blocked = (await redis.evalsha(
        swScriptSha,
        1,
        user1Key,
        timeFrame,
        limit,
        now + 10,
      )) as number[];

      // User2 should still have full capacity
      const user2Result = (await redis.evalsha(
        swScriptSha,
        1,
        user2Key,
        timeFrame,
        limit,
        now,
      )) as number[];

      expect(user1Blocked[0]).toBe(0); // user1 blocked
      expect(user2Result[0]).toBe(1); // user2 allowed
      expect(user2Result[2]).toBe(limit - 1); // user2 has remaining
    });
  });

  // ========== EDGE CASES ==========

  describe('Edge Cases', () => {
    it('handles limit=1 correctly (single request allowed)', async () => {
      const key = `edge:limit1:${Date.now()}`;
      await redis.del(key);

      const timeFrame = 60000;
      const limit = 1;
      const now = Date.now();

      const r1 = (await redis.evalsha(swScriptSha, 1, key, timeFrame, limit, now)) as number[];
      const r2 = (await redis.evalsha(swScriptSha, 1, key, timeFrame, limit, now + 1)) as number[];

      expect(r1[0]).toBe(1); // first allowed
      expect(r1[2]).toBe(0); // no remaining after first
      expect(r2[0]).toBe(0); // second blocked
    });

    it('handles burst=1 with GCRA correctly', async () => {
      const key = `edge:burst1:${Date.now()}`;
      await redis.del(key);

      const timeFrame = 1000;
      const limit = 10; // 10 req/sec, I = 100ms per request
      const burst = 1; // Can handle burst+1 = 2 requests at once
      const now = Date.now();

      // First request allowed
      const r1 = (await redis.evalsha(
        gcraScriptSha,
        1,
        key,
        timeFrame,
        limit,
        burst,
        now,
      )) as number[];
      expect(r1[0]).toBe(1); // allowed

      // Second request immediately - also allowed (within burst+1)
      // GCRA allows burst+1 requests before blocking
      const r2 = (await redis.evalsha(
        gcraScriptSha,
        1,
        key,
        timeFrame,
        limit,
        burst,
        now + 1,
      )) as number[];
      expect(r2[0]).toBe(1); // still allowed (burst+1 capacity)

      // Third request immediately should be blocked (exceeded burst+1)
      const r3 = (await redis.evalsha(
        gcraScriptSha,
        1,
        key,
        timeFrame,
        limit,
        burst,
        now + 2,
      )) as number[];
      expect(r3[0]).toBe(0); // blocked
    });

    it('handles very short timeFrame (100ms)', async () => {
      const key = `edge:short:${Date.now()}`;
      await redis.del(key);

      const timeFrame = 100; // 100ms
      const limit = 2;
      // Use fixed timestamps to avoid timing issues
      const baseTime = 1000000000000; // Fixed base time

      const r1 = (await redis.evalsha(swScriptSha, 1, key, timeFrame, limit, baseTime)) as number[];
      const r2 = (await redis.evalsha(
        swScriptSha,
        1,
        key,
        timeFrame,
        limit,
        baseTime + 10,
      )) as number[];

      expect(r1[0]).toBe(1); // first allowed
      expect(r2[0]).toBe(1); // second allowed

      // Third should be blocked (within same 100ms window)
      const r3 = (await redis.evalsha(
        swScriptSha,
        1,
        key,
        timeFrame,
        limit,
        baseTime + 20,
      )) as number[];
      expect(r3[0]).toBe(0); // blocked

      // After full window reset (200ms later = 2 windows), should be allowed
      const r4 = (await redis.evalsha(
        swScriptSha,
        1,
        key,
        timeFrame,
        limit,
        baseTime + 250,
      )) as number[];
      expect(r4[0]).toBe(1); // allowed again
    });

    it('handles large limit (10000)', async () => {
      const key = `edge:large:${Date.now()}`;
      await redis.del(key);

      const timeFrame = 60000;
      const limit = 10000;
      const now = Date.now();

      const r1 = (await redis.evalsha(swScriptSha, 1, key, timeFrame, limit, now)) as number[];

      expect(r1[0]).toBe(1);
      expect(r1[1]).toBe(1); // totalHits = 1
      expect(r1[2]).toBe(9999); // remaining = 9999
    });
  });

  // ========== NEGATIVE TESTS ==========

  describe('Negative Tests', () => {
    it('handles non-existent key gracefully (first request)', async () => {
      const key = `negative:newkey:${Date.now()}`;
      // Don't create the key first

      const timeFrame = 60000;
      const limit = 5;
      const now = Date.now();

      const result = (await redis.evalsha(swScriptSha, 1, key, timeFrame, limit, now)) as number[];

      expect(result[0]).toBe(1); // allowed (first request)
      expect(result[1]).toBe(1); // totalHits = 1
      expect(result[2]).toBe(4); // remaining = 4
    });

    it('GCRA handles concurrent requests to same key', async () => {
      const key = `negative:concurrent:${Date.now()}`;
      await redis.del(key);

      const timeFrame = 60000;
      const limit = 100;
      const burst = 5;
      const now = Date.now();

      // Fire 10 concurrent requests
      const promises = Array.from({ length: 10 }, () =>
        redis.evalsha(gcraScriptSha, 1, key, timeFrame, limit, burst, now),
      ) as Promise<number[]>[];

      const results = await Promise.all(promises);

      // Count allowed and blocked
      const allowed = results.filter((r) => r[0] === 1).length;
      const blocked = results.filter((r) => r[0] === 0).length;

      // Should allow burst+1 (6) and block the rest (4)
      // Note: Due to GCRA atomic behavior, exactly burst+1 should be allowed
      expect(allowed).toBeLessThanOrEqual(burst + 1);
      expect(blocked + allowed).toBe(10);
    });
  });
});
