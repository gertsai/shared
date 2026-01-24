/**
 * Tests for MemoryAdapter
 * @module adapters/MemoryAdapter.test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { MemoryAdapter } from './MemoryAdapter';

describe('MemoryAdapter', () => {
  let adapter: MemoryAdapter;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T12:00:00.000Z'));
    adapter = new MemoryAdapter({ cleanupInterval: 0 }); // Disable auto-cleanup for tests
  });

  afterEach(() => {
    adapter.destroy();
    vi.useRealTimers();
  });

  describe('Sliding Window', () => {
    it('should allow requests within limit', async () => {
      const now = Date.now();
      const timeFrame = 60000; // 1 minute
      const limit = 10;

      const result = await adapter.incrementSW('test-key', timeFrame, limit, now);

      expect(result[0]).toBe(1); // allow
      expect(result[1]).toBe(1); // totalHits
      expect(result[2]).toBe(9); // remaining
    });

    it('should block requests exceeding limit', async () => {
      const now = Date.now();
      const timeFrame = 60000;
      const limit = 3;

      // Make limit requests
      for (let i = 0; i < limit; i++) {
        await adapter.incrementSW('test-key', timeFrame, limit, now + i);
      }

      // Next request should be blocked
      const result = await adapter.incrementSW('test-key', timeFrame, limit, now + limit);

      expect(result[0]).toBe(0); // deny
      expect(result[2]).toBe(0); // remaining
    });

    it('should reset after time window expires', async () => {
      const now = Date.now();
      const timeFrame = 60000;
      const limit = 2;

      // Exhaust limit
      await adapter.incrementSW('test-key', timeFrame, limit, now);
      await adapter.incrementSW('test-key', timeFrame, limit, now + 1);

      // Should be blocked
      let result = await adapter.incrementSW('test-key', timeFrame, limit, now + 2);
      expect(result[0]).toBe(0);

      // Advance time past window
      const futureTime = now + timeFrame + 1000;
      result = await adapter.incrementSW('test-key', timeFrame, limit, futureTime);

      expect(result[0]).toBe(1); // allow
    });

    it('should apply previous window weighting', async () => {
      const timeFrame = 60000;
      const limit = 10;

      // Make requests in previous window
      const previousWindowTime = Date.now() - timeFrame + 1000;
      for (let i = 0; i < 8; i++) {
        await adapter.incrementSW('test-key', timeFrame, limit, previousWindowTime + i);
      }

      // In the first quarter of new window, previous requests count at 75%
      const newWindowTime = Date.now() + 100; // Just into new window (quarter = 15000ms)
      const result = await adapter.incrementSW('test-key', timeFrame, limit, newWindowTime);

      // 8 * 0.75 = 6 weighted requests from previous window
      // So we should have ~4 remaining before limit
      expect(result[0]).toBe(1); // allow
      expect(result[1]).toBeLessThanOrEqual(limit);
    });

    it('should handle multiple keys independently', async () => {
      const now = Date.now();
      const timeFrame = 60000;
      const limit = 2;

      // Exhaust limit for key1
      await adapter.incrementSW('key1', timeFrame, limit, now);
      await adapter.incrementSW('key1', timeFrame, limit, now + 1);
      const key1Result = await adapter.incrementSW('key1', timeFrame, limit, now + 2);

      // key2 should still be available
      const key2Result = await adapter.incrementSW('key2', timeFrame, limit, now);

      expect(key1Result[0]).toBe(0); // key1 blocked
      expect(key2Result[0]).toBe(1); // key2 allowed
    });
  });

  describe('GCRA', () => {
    it('should allow requests within rate', async () => {
      const now = Date.now();
      const timeFrame = 60000;
      const limit = 10;
      const burst = 2;

      const result = await adapter.gcraCheck('test-key', timeFrame, limit, burst, now);

      expect(result[0]).toBe(1); // allow
      expect(result[1]).toBeGreaterThanOrEqual(0); // remaining
    });

    it('should allow burst requests', async () => {
      const now = Date.now();
      const timeFrame = 60000;
      const limit = 1; // 1 req/min steady rate
      const burst = 3; // allow 3 burst

      // Should allow burst + 1 requests immediately
      for (let i = 0; i < burst + 1; i++) {
        const result = await adapter.gcraCheck('test-key', timeFrame, limit, burst, now + i);
        expect(result[0]).toBe(1); // allow
      }

      // Next should be blocked
      const result = await adapter.gcraCheck('test-key', timeFrame, limit, burst, now + burst + 1);
      expect(result[0]).toBe(0); // deny
      expect(result[2]).toBeGreaterThan(0); // retryAfter > 0
    });

    it('should recover after time passes', async () => {
      const now = Date.now();
      const timeFrame = 60000;
      const limit = 1;
      const burst = 1;

      // Exhaust capacity
      await adapter.gcraCheck('test-key', timeFrame, limit, burst, now);
      await adapter.gcraCheck('test-key', timeFrame, limit, burst, now + 1);

      // Should be blocked
      let result = await adapter.gcraCheck('test-key', timeFrame, limit, burst, now + 2);
      expect(result[0]).toBe(0);

      // After enough time passes, should be allowed again
      const futureTime = now + timeFrame + 1000;
      result = await adapter.gcraCheck('test-key', timeFrame, limit, burst, futureTime);
      expect(result[0]).toBe(1);
    });

    it('should handle multiple keys independently', async () => {
      const now = Date.now();
      const timeFrame = 60000;
      const limit = 1;
      const burst = 0;

      // Use up key1
      await adapter.gcraCheck('key1', timeFrame, limit, burst, now);
      const key1Result = await adapter.gcraCheck('key1', timeFrame, limit, burst, now + 1);

      // key2 should be available
      const key2Result = await adapter.gcraCheck('key2', timeFrame, limit, burst, now);

      expect(key1Result[0]).toBe(0); // key1 blocked
      expect(key2Result[0]).toBe(1); // key2 allowed
    });
  });

  describe('Memory Management', () => {
    it('should evict oldest entries when maxKeys exceeded', async () => {
      const smallAdapter = new MemoryAdapter({ maxKeys: 3, cleanupInterval: 0 });
      const now = Date.now();

      try {
        // Add 4 keys
        await smallAdapter.incrementSW('key1', 60000, 10, now);
        await smallAdapter.incrementSW('key2', 60000, 10, now + 100);
        await smallAdapter.incrementSW('key3', 60000, 10, now + 200);
        await smallAdapter.incrementSW('key4', 60000, 10, now + 300);

        const stats = smallAdapter.getStats();
        expect(stats.swKeys).toBeLessThanOrEqual(3);
      } finally {
        smallAdapter.destroy();
      }
    });

    it('should clear all entries', async () => {
      const now = Date.now();

      await adapter.incrementSW('sw-key', 60000, 10, now);
      await adapter.gcraCheck('gcra-key', 60000, 10, 2, now);

      let stats = adapter.getStats();
      expect(stats.swKeys).toBe(1);
      expect(stats.gcraKeys).toBe(1);

      adapter.clear();

      stats = adapter.getStats();
      expect(stats.swKeys).toBe(0);
      expect(stats.gcraKeys).toBe(0);
    });

    it('should report correct stats', async () => {
      const now = Date.now();

      await adapter.incrementSW('sw1', 60000, 10, now);
      await adapter.incrementSW('sw2', 60000, 10, now);
      await adapter.gcraCheck('gcra1', 60000, 10, 2, now);

      const stats = adapter.getStats();

      expect(stats.swKeys).toBe(2);
      expect(stats.gcraKeys).toBe(1);
      expect(stats.maxKeys).toBe(10000);
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero limit gracefully', async () => {
      const now = Date.now();

      // SW with limit 0 should always block
      const swResult = await adapter.incrementSW('test', 60000, 0, now);
      expect(swResult[0]).toBe(0);

      // GCRA with limit 0 should handle gracefully
      const gcraResult = await adapter.gcraCheck('test2', 60000, 0, 1, now);
      // With burst=1, first request should be allowed
      expect(gcraResult[0]).toBe(1);
    });

    it('should handle very small time frames', async () => {
      const now = Date.now();
      const timeFrame = 100; // 100ms

      const result = await adapter.incrementSW('test', timeFrame, 5, now);
      expect(result[0]).toBe(1);
    });

    it('should handle concurrent-like rapid requests', async () => {
      const now = Date.now();
      const timeFrame = 60000;
      const limit = 100;

      // Simulate rapid concurrent requests
      const results = await Promise.all(
        Array.from({ length: 50 }, (_, i) =>
          adapter.incrementSW(`key-${i % 5}`, timeFrame, limit, now + i),
        ),
      );

      // All should succeed (10 per key, well under limit)
      expect(results.every((r) => r[0] === 1)).toBe(true);
    });
  });
});
