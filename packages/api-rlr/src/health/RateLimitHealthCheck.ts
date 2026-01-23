/**
 * Health check service for rate limiter
 * Provides health status and monitoring capabilities
 */

import type { RLRRedis } from '../utils/types';

export interface HealthStatus {
  status: 'healthy' | 'unhealthy' | 'degraded';
  latency: number;
  timestamp: string;
  error?: string;
  details?: {
    redisConnection: boolean;
    luaScriptsLoaded: boolean;
    lastCheckDuration?: number;
  };
}

export class RateLimitHealthCheck {
  private readonly testKeyPrefix = '__rlr_health_check__';
  private readonly debug: boolean =
    process.env.RLR_DEBUG === '1' ||
    process.env.RLR_DEBUG === 'true' ||
    process.env.RLR_DEBUG === 'verbose';

  constructor(private store: RLRRedis) {}

  /**
   * Performs a comprehensive health check
   */
  async check(): Promise<HealthStatus> {
    const start = Date.now();
    const timestamp = new Date().toISOString();

    try {
      // Test Redis connection
      await this.store.ping();

      // Test Lua script functionality if available
      let luaScriptsLoaded = false;
      if (this.store.incrementSW) {
        const testKey = `${this.testKeyPrefix}${Date.now()}`;
        try {
          await this.store.incrementSW(testKey, 1000, 1, Date.now());
          await this.store.del(testKey);
          luaScriptsLoaded = true;
        } catch (err) {
          if (this.debug) {
            console.warn('[RLR Health] Lua script test failed:', err);
          }
        }
      }

      const totalLatency = Date.now() - start;

      // Determine health status based on latency
      let status: HealthStatus['status'] = 'healthy';
      if (totalLatency > 1000) {
        status = 'degraded';
      }

      return {
        status,
        latency: totalLatency,
        timestamp,
        details: {
          redisConnection: true,
          luaScriptsLoaded,
          lastCheckDuration: totalLatency,
        },
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error instanceof Error ? error.message : String(error),
        latency: Date.now() - start,
        timestamp,
        details: {
          redisConnection: false,
          luaScriptsLoaded: false,
        },
      };
    }
  }

  /**
   * Quick health check for liveness probes
   */
  async ping(): Promise<boolean> {
    try {
      await this.store.ping();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Cleanup test keys from previous health checks
   * Uses SCAN instead of KEYS to avoid blocking Redis (CWE-400)
   */
  async cleanup(): Promise<void> {
    try {
      // Use SCAN iterator instead of KEYS to avoid blocking Redis
      // KEYS is O(N) and blocks the server - dangerous in production
      const pattern = `${this.testKeyPrefix}*`;
      const keysToDelete: string[] = [];

      // Use scanStream if available (ioredis), fallback to manual SCAN
      if (typeof this.store.scanStream === 'function') {
        const stream = this.store.scanStream({ match: pattern, count: 100 });
        for await (const keys of stream) {
          keysToDelete.push(...(keys as string[]));
        }
      } else {
        // Manual SCAN iteration for compatibility
        let cursor = '0';
        do {
          const [nextCursor, keys] = await this.store.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
          cursor = nextCursor;
          keysToDelete.push(...keys);
        } while (cursor !== '0');
      }

      if (keysToDelete.length > 0) {
        // Delete in batches to avoid large commands
        const batchSize = 1000;
        for (let i = 0; i < keysToDelete.length; i += batchSize) {
          const batch = keysToDelete.slice(i, i + batchSize);
          await this.store.del(...batch);
        }
      }
    } catch (err) {
      if (this.debug) {
        console.warn('[RLR Health] Cleanup failed:', err);
      }
    }
  }

  /**
   * Get metrics for monitoring
   */
  async getMetrics(): Promise<{
    memoryUsage?: string;
    connectedClients?: number;
    uptime?: number;
  }> {
    try {
      const info = await this.store.info('stats');
      const lines = info.split(/[\r\n]+/);

      const metrics: Record<string, any> = {};

      for (const line of lines) {
        if (line.includes(':')) {
          const [key, value] = line.split(':');
          if (key && value) {
            metrics[key.trim()] = value.trim();
          }
        }
      }

      return {
        memoryUsage: metrics.used_memory_human,
        connectedClients: parseInt(metrics.connected_clients, 10) || 0,
        uptime: parseInt(metrics.uptime_in_seconds, 10) || 0,
      };
    } catch {
      return {};
    }
  }
}
