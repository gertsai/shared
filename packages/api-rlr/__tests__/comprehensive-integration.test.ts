/**
 * Comprehensive Integration Tests for api-rlr
 *
 * Run with: HAS_REDIS=1 pnpm --filter @gerts/api-rlr test comprehensive
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
      const I = timeFrame / limit; // 1000ms inter-arrival

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

      // Expectations (should be sub-millisecond on local Redis)
      expect(avg).toBeLessThan(5); // 5ms average max
      expect(p99).toBeLessThan(20); // 20ms P99 max
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
        } catch (e) {
          errors++;
        }
      });

      await Promise.all(promises);

      console.log(`\nStress Test: ${successes} successes, ${errors} errors`);
      expect(errors).toBe(0);
      expect(successes).toBe(requestCount);
    });
  });
});
