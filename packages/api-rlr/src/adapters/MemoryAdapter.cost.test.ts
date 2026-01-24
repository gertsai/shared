/**
 * Tests for cost-based rate limiting in MemoryAdapter
 * @module adapters/MemoryAdapter.cost.test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { MemoryAdapter } from './MemoryAdapter';

describe('MemoryAdapter - Cost-based rate limiting', () => {
  let adapter: MemoryAdapter;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T12:00:00.000Z'));
    adapter = new MemoryAdapter({ cleanupInterval: 0 });
  });

  afterEach(() => {
    adapter.destroy();
    vi.useRealTimers();
  });

  describe('Sliding Window with cost', () => {
    it('should consume multiple tokens with cost > 1', async () => {
      const now = Date.now();
      const limit = 10;
      const timeFrame = 1000;

      // Request with cost=3 should consume 3 tokens
      const result = await adapter.incrementSW('test-key', timeFrame, limit, now, 3);

      expect(result[0]).toBe(1); // allowed
      expect(result[1]).toBe(3); // totalHits = 3
      expect(result[2]).toBe(7); // remaining = 10 - 3 = 7
    });

    it('should block when cost exceeds remaining capacity', async () => {
      const now = Date.now();
      const limit = 10;
      const timeFrame = 1000;

      // First request: cost=8
      await adapter.incrementSW('test-key', timeFrame, limit, now, 8);

      // Second request: cost=5 should be blocked (8 + 5 > 10)
      const result = await adapter.incrementSW('test-key', timeFrame, limit, now, 5);

      expect(result[0]).toBe(0); // blocked
      expect(result[2]).toBe(0); // no remaining
    });

    it('should allow request when cost exactly fills limit', async () => {
      const now = Date.now();
      const limit = 10;
      const timeFrame = 1000;

      // Request with cost=10 should exactly fill the limit
      const result = await adapter.incrementSW('test-key', timeFrame, limit, now, 10);

      expect(result[0]).toBe(1); // allowed
      expect(result[1]).toBe(10); // totalHits = 10
      expect(result[2]).toBe(0); // remaining = 0
    });

    it('should default to cost=1 when not specified', async () => {
      const now = Date.now();
      const limit = 10;
      const timeFrame = 1000;

      // Request without cost (defaults to 1)
      const result = await adapter.incrementSW('test-key', timeFrame, limit, now);

      expect(result[0]).toBe(1);
      expect(result[1]).toBe(1);
      expect(result[2]).toBe(9);
    });
  });

  describe('GCRA with cost', () => {
    it('should consume multiple tokens with cost > 1', async () => {
      const now = Date.now();
      const limit = 10;
      const timeFrame = 1000;
      const burst = 5;

      // Request with cost=3
      const result = await adapter.gcraCheck('test-key', timeFrame, limit, burst, now, 3);

      expect(result[0]).toBe(1); // allowed
      // Remaining should reflect cost consumption
      expect(result[1]).toBeGreaterThanOrEqual(0);
    });

    it('should block high-cost request when near limit', async () => {
      const now = Date.now();
      const limit = 10;
      const timeFrame = 1000;
      const burst = 3;

      // GCRA with limit=10, timeFrame=1000ms means I = 100ms per token
      // burst=3 means we can "owe" up to 3 * I = 300ms
      // Fill up burst by consuming more than burst capacity
      for (let i = 0; i < 5; i++) {
        await adapter.gcraCheck('test-key', timeFrame, limit, burst, now, 1);
      }

      // After 5 requests (500ms consumed), TAT is now + 500ms
      // earliest = TAT - burst * I = now + 500 - 300 = now + 200
      // Since now < now + 200, next request should be blocked
      const result = await adapter.gcraCheck('test-key', timeFrame, limit, burst, now, 1);

      expect(result[0]).toBe(0); // blocked
      expect(result[2]).toBeGreaterThan(0); // retryAfter > 0
    });

    it('should default to cost=1 when not specified', async () => {
      const now = Date.now();
      const limit = 10;
      const timeFrame = 1000;
      const burst = 5;

      const result1 = await adapter.gcraCheck('key1', timeFrame, limit, burst, now);
      const result2 = await adapter.gcraCheck('key2', timeFrame, limit, burst, now, 1);

      // Both should have same remaining
      expect(result1[1]).toBe(result2[1]);
    });
  });

  describe('Leaky Bucket with cost', () => {
    it('should consume multiple tokens with cost > 1', async () => {
      const now = Date.now();
      const capacity = 10;
      const drainRate = 10; // 10 req/s

      // Request with cost=3
      const result = await adapter.leakyBucket('test-key', capacity, drainRate, now, 3);

      expect(result[0]).toBe(1); // allowed
      expect(result[1]).toBe(3); // current level = 3
      expect(result[2]).toBe(capacity);
    });

    it('should block when cost exceeds remaining capacity', async () => {
      const now = Date.now();
      const capacity = 5;
      const drainRate = 10;

      // Fill bucket with cost=4
      await adapter.leakyBucket('test-key', capacity, drainRate, now, 4);

      // Request with cost=3 should be blocked (4 + 3 > 5)
      const result = await adapter.leakyBucket('test-key', capacity, drainRate, now, 3);

      expect(result[0]).toBe(0); // blocked
      expect(result[4]).toBeGreaterThan(0); // retryAfter > 0
    });

    it('should calculate retryAfter based on cost overflow', async () => {
      const now = Date.now();
      const capacity = 5;
      const drainRate = 10; // 10 req/s = 1 req per 100ms

      // Fill bucket completely
      await adapter.leakyBucket('test-key', capacity, drainRate, now, 5);

      // Request with cost=2 needs 2 units to drain
      const result = await adapter.leakyBucket('test-key', capacity, drainRate, now, 2);

      expect(result[0]).toBe(0);
      // Should wait for 2 units to drain: 2 / 10 * 1000 = 200ms
      expect(result[4]).toBe(200);
    });

    it('should allow high-cost request after sufficient draining', async () => {
      let now = Date.now();
      const capacity = 5;
      const drainRate = 10; // 10 req/s

      // Fill bucket
      await adapter.leakyBucket('test-key', capacity, drainRate, now, 5);

      // Wait for 3 units to drain (300ms)
      now += 300;

      // Now request with cost=3 should be allowed
      const result = await adapter.leakyBucket('test-key', capacity, drainRate, now, 3);

      expect(result[0]).toBe(1); // allowed
    });

    it('should default to cost=1 when not specified', async () => {
      const now = Date.now();
      const capacity = 10;
      const drainRate = 10;

      const result = await adapter.leakyBucket('test-key', capacity, drainRate, now);

      expect(result[0]).toBe(1);
      expect(result[1]).toBe(1); // level = 1
    });
  });

  describe('Cost-based real-world scenarios', () => {
    it('should handle AI inference costing more than simple reads', async () => {
      const now = Date.now();
      const limit = 100; // 100 tokens per minute
      const timeFrame = 60000;

      // Simulate: 10 simple GETs (cost=1 each)
      for (let i = 0; i < 10; i++) {
        const result = await adapter.incrementSW('api-user-1', timeFrame, limit, now, 1);
        expect(result[0]).toBe(1);
      }

      // 5 AI inference calls (cost=10 each)
      for (let i = 0; i < 5; i++) {
        const result = await adapter.incrementSW('api-user-1', timeFrame, limit, now, 10);
        expect(result[0]).toBe(1);
      }

      // Total: 10 + 50 = 60 tokens used
      // 6th AI call (cost=10) should still be allowed (60 + 10 = 70 <= 100)
      const result = await adapter.incrementSW('api-user-1', timeFrame, limit, now, 10);
      expect(result[0]).toBe(1);
      expect(result[1]).toBe(70);
      expect(result[2]).toBe(30);

      // Try to use remaining 30 with a cost=40 request - should be blocked
      const blocked = await adapter.incrementSW('api-user-1', timeFrame, limit, now, 40);
      expect(blocked[0]).toBe(0);
    });

    it('should handle bulk operations costing more', async () => {
      const now = Date.now();
      const capacity = 50;
      const drainRate = 10;

      // 10 regular requests (cost=1)
      for (let i = 0; i < 10; i++) {
        await adapter.leakyBucket('bulk-test', capacity, drainRate, now, 1);
      }

      // 1 bulk export (cost=30)
      const bulkResult = await adapter.leakyBucket('bulk-test', capacity, drainRate, now, 30);
      expect(bulkResult[0]).toBe(1);
      expect(bulkResult[1]).toBe(40); // 10 + 30

      // Another bulk (cost=15) should be blocked
      const blocked = await adapter.leakyBucket('bulk-test', capacity, drainRate, now, 15);
      expect(blocked[0]).toBe(0);
    });
  });
});
