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
    it('deletes health check keys', async () => {
      const testKeys = ['__rlr_health_check__123', '__rlr_health_check__456'];
      mockStore.keys = vi.fn().mockResolvedValue(testKeys);

      await healthCheck.cleanup();

      expect(mockStore.keys).toHaveBeenCalledWith('__rlr_health_check__*');
      expect(mockStore.del).toHaveBeenCalledWith(...testKeys);
    });

    it('handles cleanup errors gracefully', async () => {
      mockStore.keys = vi.fn().mockRejectedValue(new Error('Keys error'));

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
