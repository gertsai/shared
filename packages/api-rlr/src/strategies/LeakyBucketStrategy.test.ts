/**
 * Tests for LeakyBucketStrategy
 * @module strategies/LeakyBucketStrategy.test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { MemoryAdapter } from '../adapters/MemoryAdapter';

import { LeakyBucketStrategy } from './LeakyBucketStrategy';

describe('LeakyBucketStrategy', () => {
  let adapter: MemoryAdapter;
  let strategy: LeakyBucketStrategy;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T12:00:00.000Z'));
    adapter = new MemoryAdapter({ cleanupInterval: 0 });
    strategy = new LeakyBucketStrategy(adapter);
  });

  afterEach(() => {
    adapter.destroy();
    vi.useRealTimers();
  });

  describe('Basic functionality', () => {
    it('should allow requests when bucket has capacity', async () => {
      const result = await strategy.execute({
        key: 'test-key',
        limit: 10, // 10 requests per second
        timeFrame: 1000, // 1 second
        now: Date.now(),
        burst: 5, // capacity of 5
      });

      expect(result.allow).toBe(true);
      expect(result.totalHits).toBe(1);
      expect(result.remainingHits).toBe(4);
    });

    it('should block requests when bucket is full', async () => {
      const now = Date.now();
      const limit = 10;
      const timeFrame = 1000;
      const capacity = 3;

      // Fill the bucket
      for (let i = 0; i < capacity; i++) {
        await strategy.execute({
          key: 'test-key',
          limit,
          timeFrame,
          now,
          burst: capacity,
        });
      }

      // Next request should be blocked
      const result = await strategy.execute({
        key: 'test-key',
        limit,
        timeFrame,
        now,
        burst: capacity,
      });

      expect(result.allow).toBe(false);
      expect(result.remainingHits).toBe(0);
      expect(result.retryAfter).toBeGreaterThan(0);
    });

    it('should allow requests after bucket drains', async () => {
      const now = Date.now();
      const limit = 10; // 10 req/s
      const timeFrame = 1000;
      const capacity = 2;

      // Fill the bucket
      await strategy.execute({
        key: 'test-key',
        limit,
        timeFrame,
        now,
        burst: capacity,
      });
      await strategy.execute({
        key: 'test-key',
        limit,
        timeFrame,
        now,
        burst: capacity,
      });

      // Should be full
      let result = await strategy.execute({
        key: 'test-key',
        limit,
        timeFrame,
        now,
        burst: capacity,
      });
      expect(result.allow).toBe(false);

      // Wait for 1 request to drain (100ms at 10 req/s)
      const later = now + 150; // 150ms later, ~1.5 requests should drain
      result = await strategy.execute({
        key: 'test-key',
        limit,
        timeFrame,
        now: later,
        burst: capacity,
      });

      expect(result.allow).toBe(true);
    });
  });

  describe('Drain rate', () => {
    it('should drain at correct rate', async () => {
      const now = Date.now();
      const limit = 1; // 1 req/s
      const timeFrame = 1000;
      const capacity = 2;

      // Add 2 requests
      await strategy.execute({
        key: 'drain-test',
        limit,
        timeFrame,
        now,
        burst: capacity,
      });
      await strategy.execute({
        key: 'drain-test',
        limit,
        timeFrame,
        now,
        burst: capacity,
      });

      // Should be full
      let result = await strategy.execute({
        key: 'drain-test',
        limit,
        timeFrame,
        now,
        burst: capacity,
      });
      expect(result.allow).toBe(false);

      // After 1 second, 1 unit should drain
      const oneSecLater = now + 1000;
      result = await strategy.execute({
        key: 'drain-test',
        limit,
        timeFrame,
        now: oneSecLater,
        burst: capacity,
      });
      expect(result.allow).toBe(true);
    });

    it('should respect higher drain rates', async () => {
      const now = Date.now();
      const limit = 100; // 100 req/s = drains 1 request every 10ms
      const timeFrame = 1000;
      const capacity = 10;

      // Fill half the bucket
      for (let i = 0; i < 5; i++) {
        await strategy.execute({
          key: 'high-drain',
          limit,
          timeFrame,
          now,
          burst: capacity,
        });
      }

      // After 50ms, 5 more requests should have drained
      const later = now + 50;
      const result = await strategy.execute({
        key: 'high-drain',
        limit,
        timeFrame,
        now: later,
        burst: capacity,
      });

      // Bucket was at 5, drained ~5, now should be near 0, then add 1
      expect(result.allow).toBe(true);
      expect(result.remainingHits).toBeGreaterThanOrEqual(4);
    });
  });

  describe('Multiple keys', () => {
    it('should track keys independently', async () => {
      const now = Date.now();
      const limit = 10;
      const timeFrame = 1000;
      const capacity = 1;

      // Fill key1
      await strategy.execute({
        key: 'key1',
        limit,
        timeFrame,
        now,
        burst: capacity,
      });

      const key1Result = await strategy.execute({
        key: 'key1',
        limit,
        timeFrame,
        now,
        burst: capacity,
      });

      // key2 should still have capacity
      const key2Result = await strategy.execute({
        key: 'key2',
        limit,
        timeFrame,
        now,
        burst: capacity,
      });

      expect(key1Result.allow).toBe(false);
      expect(key2Result.allow).toBe(true);
    });
  });

  describe('Edge cases', () => {
    it('should handle zero limit gracefully', async () => {
      const result = await strategy.execute({
        key: 'zero-limit',
        limit: 0,
        timeFrame: 1000,
        now: Date.now(),
        burst: 1,
      });

      // With 0 drain rate, bucket should still work with burst
      expect(result.allow).toBe(true);
    });

    it('should default burst to limit', async () => {
      const now = Date.now();
      const limit = 5;
      const timeFrame = 1000;

      // Without explicit burst, should use limit as capacity
      for (let i = 0; i < 5; i++) {
        await strategy.execute({
          key: 'default-burst',
          limit,
          timeFrame,
          now,
          // No burst specified
        });
      }

      const result = await strategy.execute({
        key: 'default-burst',
        limit,
        timeFrame,
        now,
      });

      expect(result.allow).toBe(false);
    });

    it('should provide meaningful retryAfter', async () => {
      const now = Date.now();
      const limit = 10; // 10 req/s = 1 request every 100ms
      const timeFrame = 1000;
      const capacity = 1;

      // Fill bucket
      await strategy.execute({
        key: 'retry-test',
        limit,
        timeFrame,
        now,
        burst: capacity,
      });

      const result = await strategy.execute({
        key: 'retry-test',
        limit,
        timeFrame,
        now,
        burst: capacity,
      });

      expect(result.allow).toBe(false);
      expect(result.retryAfter).toBe(100); // 1000ms / 10 = 100ms per request
    });
  });

  describe('Traffic shaping', () => {
    it('should smooth bursty traffic over time', async () => {
      const limit = 10; // 10 req/s
      const timeFrame = 1000;
      const capacity = 5;
      let now = Date.now();

      // Simulate bursty traffic - 20 requests in rapid succession
      let allowed = 0;
      let blocked = 0;

      for (let i = 0; i < 20; i++) {
        const result = await strategy.execute({
          key: 'bursty',
          limit,
          timeFrame,
          now,
          burst: capacity,
        });

        if (result.allow) {
          allowed++;
        } else {
          blocked++;
        }

        // Advance time slightly (10ms between each request)
        now += 10;
      }

      // Should have allowed some (burst capacity + drained during the 200ms)
      // At 10 req/s and 200ms total, should drain ~2 requests
      // So allowed = 5 (burst) + 2 (drained) ≈ 7
      expect(allowed).toBeGreaterThanOrEqual(5);
      expect(allowed).toBeLessThanOrEqual(10);
      expect(blocked).toBeGreaterThan(0);
    });
  });
});
