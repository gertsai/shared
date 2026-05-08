import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RateLimitHealthCheck } from './RateLimitHealthCheck';
import type { RLRRedis } from '../utils/types';

describe('RateLimitHealthCheck', () => {
  let mockStore: Partial<RLRRedis>;
  let healthCheck: RateLimitHealthCheck;

  beforeEach(() => {
    mockStore = {
      ping: vi.fn().mockResolvedValue('PONG'),
      del: vi.fn().mockResolvedValue(1),
      keys: vi.fn().mockResolvedValue([]),
      info: vi.fn().mockResolvedValue(`
# Stats
connected_clients:5
uptime_in_seconds:1000
used_memory_human:1.5M
      `),
      incrementSW: vi.fn().mockResolvedValue([4, 1, 1000, 1]),
    };

    healthCheck = new RateLimitHealthCheck(mockStore as RLRRedis);
  });

  describe('check', () => {
    it('returns healthy status when Redis is available', async () => {
      const result = await healthCheck.check();

      expect(result.status).toBe('healthy');
      expect(result.latency).toBeGreaterThanOrEqual(0);
      expect(result.timestamp).toBeDefined();
      expect(result.details?.redisConnection).toBe(true);
      expect(result.details?.luaScriptsLoaded).toBe(true);
    });

    it('returns degraded status when latency is high', async () => {
      // Simulate high latency
      mockStore.ping = vi
        .fn()
        .mockImplementation(
          () => new Promise((resolve) => setTimeout(() => resolve('PONG'), 1100)),
        );

      const result = await healthCheck.check();

      expect(result.status).toBe('degraded');
      expect(result.latency).toBeGreaterThan(1000);
    });

    it('returns unhealthy status when Redis is unavailable', async () => {
      mockStore.ping = vi.fn().mockRejectedValue(new Error('Connection refused'));

      const result = await healthCheck.check();

      expect(result.status).toBe('unhealthy');
      expect(result.error).toBe('Connection refused');
      expect(result.details?.redisConnection).toBe(false);
    });

    it('handles Lua script failures gracefully', async () => {
      mockStore.incrementSW = vi.fn().mockRejectedValue(new Error('Script error'));

      const result = await healthCheck.check();

      expect(result.status).toBe('healthy');
      expect(result.details?.luaScriptsLoaded).toBe(false);
    });
  });

  describe('ping', () => {
    it('returns true when Redis is available', async () => {
      const result = await healthCheck.ping();

      expect(result).toBe(true);
      expect(mockStore.ping).toHaveBeenCalled();
    });

    it('returns false when Redis is unavailable', async () => {
      mockStore.ping = vi.fn().mockRejectedValue(new Error('Connection refused'));

      const result = await healthCheck.ping();

      expect(result).toBe(false);
    });
  });

  describe('cleanup', () => {
    it('deletes health check keys using scanStream', async () => {
      const testKeys = ['__rlr_health_check__123', '__rlr_health_check__456'];

      // Mock scanStream as async iterator
      const mockStream = {
        async *[Symbol.asyncIterator]() {
          yield testKeys;
        },
      };
      mockStore.scanStream = vi.fn().mockReturnValue(mockStream);

      await healthCheck.cleanup();

      expect(mockStore.scanStream).toHaveBeenCalledWith({
        match: '__rlr_health_check__*',
        count: 100,
      });
      expect(mockStore.del).toHaveBeenCalledWith(...testKeys);
    });

    it('falls back to SCAN when scanStream is not available', async () => {
      const testKeys = ['__rlr_health_check__123', '__rlr_health_check__456'];

      // Remove scanStream to test fallback
      delete mockStore.scanStream;
      mockStore.scan = vi.fn().mockResolvedValue(['0', testKeys]);

      await healthCheck.cleanup();

      expect(mockStore.scan).toHaveBeenCalledWith(
        '0',
        'MATCH',
        '__rlr_health_check__*',
        'COUNT',
        100,
      );
      expect(mockStore.del).toHaveBeenCalledWith(...testKeys);
    });

    it('handles SCAN pagination with multiple pages', async () => {
      const page1Keys = ['__rlr_health_check__1', '__rlr_health_check__2'];
      const page2Keys = ['__rlr_health_check__3', '__rlr_health_check__4'];
      const page3Keys = ['__rlr_health_check__5'];

      // Remove scanStream to test SCAN fallback with pagination
      delete mockStore.scanStream;

      // First call returns cursor='123' (more pages), second returns cursor='456', third returns '0' (done)
      mockStore.scan = vi
        .fn()
        .mockResolvedValueOnce(['123', page1Keys])
        .mockResolvedValueOnce(['456', page2Keys])
        .mockResolvedValueOnce(['0', page3Keys]);

      await healthCheck.cleanup();

      // Should call SCAN 3 times with different cursors
      expect(mockStore.scan).toHaveBeenCalledTimes(3);
      expect(mockStore.scan).toHaveBeenNthCalledWith(
        1,
        '0',
        'MATCH',
        '__rlr_health_check__*',
        'COUNT',
        100,
      );
      expect(mockStore.scan).toHaveBeenNthCalledWith(
        2,
        '123',
        'MATCH',
        '__rlr_health_check__*',
        'COUNT',
        100,
      );
      expect(mockStore.scan).toHaveBeenNthCalledWith(
        3,
        '456',
        'MATCH',
        '__rlr_health_check__*',
        'COUNT',
        100,
      );

      // Should delete all 5 keys
      expect(mockStore.del).toHaveBeenCalledWith(...page1Keys, ...page2Keys, ...page3Keys);
    });

    it('handles scanStream with multiple batches', async () => {
      const batch1 = ['__rlr_health_check__a', '__rlr_health_check__b'];
      const batch2 = ['__rlr_health_check__c'];

      // Mock scanStream yielding multiple batches
      const mockStream = {
        async *[Symbol.asyncIterator]() {
          yield batch1;
          yield batch2;
        },
      };
      mockStore.scanStream = vi.fn().mockReturnValue(mockStream);

      await healthCheck.cleanup();

      // Should delete all keys from all batches
      expect(mockStore.del).toHaveBeenCalledWith(...batch1, ...batch2);
    });

    it('handles cleanup errors gracefully', async () => {
      mockStore.scanStream = vi.fn().mockImplementation(() => {
        throw new Error('Stream error');
      });

      // Should not throw
      await expect(healthCheck.cleanup()).resolves.toBeUndefined();
    });
  });

  describe('getMetrics', () => {
    it('parses Redis info correctly', async () => {
      const metrics = await healthCheck.getMetrics();

      expect(metrics.memoryUsage).toBe('1.5M');
      expect(metrics.connectedClients).toBe(5);
      expect(metrics.uptime).toBe(1000);
    });

    it('returns empty object on error', async () => {
      mockStore.info = vi.fn().mockRejectedValue(new Error('Info error'));

      const metrics = await healthCheck.getMetrics();

      expect(metrics).toEqual({});
    });
  });
});
