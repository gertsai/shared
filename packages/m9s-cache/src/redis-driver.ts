import { createRequire } from 'node:module';
import type { CacheDriver, CachePayload } from './types.js';

const require = createRequire(import.meta.url);
import type { ClusterNode, ClusterOptions, RedisOptions } from 'ioredis';

/**
 * Options for creating a Redis cache driver.
 */
export interface RedisCacheDriverOptions {
  /** Pre-existing ioredis client instance. */
  client?: RedisLike;
  /** Redis connection string or options. */
  redis?: string | RedisOptions;
  /** Redis Cluster configuration. */
  cluster?: {
    nodes: Array<string | ClusterNode | RedisOptions>;
    options?: ClusterOptions;
  };
  /** Use SCAN instead of KEYS for key listing (default: true). */
  useScan?: boolean;
  /** SCAN count parameter (default: 100). */
  scanCount?: number;
}

/**
 * Minimal Redis client interface.
 * Compatible with ioredis and Redis Cluster.
 */
export interface RedisLike {
  // Basic operations
  getBuffer?(key: string): Promise<CachePayload | null>;
  get?(key: string): Promise<CachePayload | null>;
  set(...args: unknown[]): Promise<unknown>;
  del(keys: string | string[]): Promise<number>;

  // Multi operations
  mget(keys: string[]): Promise<Array<CachePayload | null>>;
  mset(entries: Array<[string, CachePayload]>): Promise<unknown>;

  // Hash operations
  hset?(key: string, entries: Record<string, CachePayload>): Promise<number>;
  hget?(key: string, field: string): Promise<CachePayload | null>;
  hgetall?(key: string): Promise<Record<string, CachePayload>>;

  // Key operations
  keys?(pattern: string): Promise<string[]>;
  scan?(cursor: string | number, ...args: unknown[]): Promise<[string, string[]]>;
  exists(key: string): Promise<number>;
  expire(key: string, ttlSeconds: number): Promise<number>;
  ttl?(key: string): Promise<number>;

  // Connection
  quit?(): Promise<void>;

  // Cluster support
  scanStream?(options: { match: string; count: number }): NodeJS.ReadableStream;
  nodes?(role: string): RedisLike[];

  // Lua scripts (ioredis)
  eval?(script: string, numKeys: number, ...args: unknown[]): Promise<unknown>;
}

/**
 * Redis/Valkey cache driver using ioredis.
 *
 * Features:
 * - Single Redis instance and Cluster support
 * - SCAN-based key listing (non-blocking, production-safe)
 * - Hash operations for envelope storage
 * - Buffer support for binary-safe caching
 *
 * @example
 * ```typescript
 * // Single instance
 * const driver = new RedisCacheDriver({
 *   redis: 'redis://localhost:6379'
 * });
 *
 * // Cluster
 * const driver = new RedisCacheDriver({
 *   cluster: {
 *     nodes: ['redis://node1:6379', 'redis://node2:6379'],
 *     options: { maxRedirections: 10 }
 *   }
 * });
 *
 * // Existing client
 * const driver = new RedisCacheDriver({ client: existingRedis });
 * ```
 */
export class RedisCacheDriver implements CacheDriver {
  private readonly client: RedisLike;
  private readonly useScan: boolean;
  private readonly scanCount: number;

  readonly supportsHash = true;
  readonly supportsAtomic = true;

  constructor(options: RedisCacheDriverOptions) {
    this.useScan = options.useScan ?? true;
    this.scanCount = options.scanCount ?? 100;

    if (options.client) {
      this.client = options.client;
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Redis = require('ioredis');

    if (options.cluster?.nodes?.length) {
      this.client = new Redis.Cluster(options.cluster.nodes, options.cluster.options);
    } else {
      this.client = new Redis(options.redis);
    }
  }

  /**
   * Get raw cached payload by key.
   * Prefers getBuffer for binary safety.
   */
  async get(key: string): Promise<CachePayload | null> {
    // Prefer getBuffer for binary-safe retrieval
    if (this.client.getBuffer) {
      return this.client.getBuffer(key);
    }
    if (this.client.get) {
      return this.client.get(key);
    }
    return null;
  }

  /**
   * Set cached payload with optional TTL.
   */
  async set(key: string, value: CachePayload, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds != null && ttlSeconds > 0) {
      await this.client.set(key, value, 'EX', ttlSeconds);
      return;
    }
    await this.client.set(key, value);
  }

  /**
   * Delete one or more keys.
   */
  async del(keys: string | string[]): Promise<number> {
    return this.client.del(keys);
  }

  /**
   * Get multiple keys.
   */
  async mget(keys: string[]): Promise<Array<CachePayload | null>> {
    if (keys.length === 0) return [];
    return this.client.mget(keys);
  }

  /**
   * Set multiple key-value pairs.
   */
  async mset(entries: Array<[string, CachePayload]>): Promise<void> {
    if (entries.length === 0) return;
    await this.client.mset(entries);
  }

  /**
   * Set hash fields.
   */
  async hset(key: string, entries: Record<string, CachePayload>): Promise<void> {
    if (!this.client.hset) return;
    await this.client.hset(key, entries);
  }

  /**
   * Get single hash field.
   */
  async hget(key: string, field: string): Promise<CachePayload | null> {
    if (!this.client.hget) return null;
    return this.client.hget(key, field);
  }

  /**
   * Get all hash fields.
   */
  async hgetall(key: string): Promise<Record<string, CachePayload> | null> {
    if (!this.client.hgetall) return null;
    const result = await this.client.hgetall(key);
    if (!result || Object.keys(result).length === 0) return null;
    return result;
  }

  /**
   * List keys by pattern.
   *
   * Uses SCAN for non-blocking iteration in production.
   * Falls back to KEYS if SCAN is not available.
   * For cluster mode, scans all master nodes.
   */
  async keys(pattern: string): Promise<string[]> {
    // Cluster mode - scan all master nodes
    if (this.isCluster()) {
      const nodes = this.client.nodes?.('master') ?? [];
      const results = await Promise.all(nodes.map((node) => this.scanNodeKeys(node, pattern)));
      // Deduplicate keys from multiple nodes
      return Array.from(new Set(results.flat()));
    }

    // Single instance - prefer SCAN over KEYS
    if (this.useScan && this.client.scan) {
      return this.scanKeys(pattern);
    }

    // Fallback to KEYS (⚠️ blocking in production)
    if (this.client.keys) {
      return this.client.keys(pattern);
    }

    return [];
  }

  /**
   * Check if key exists.
   */
  async exists(key: string): Promise<boolean> {
    const count = await this.client.exists(key);
    return count > 0;
  }

  /**
   * Set TTL on key.
   */
  async expire(key: string, ttlSeconds: number): Promise<void> {
    await this.client.expire(key, ttlSeconds);
  }

  /**
   * Get remaining TTL.
   */
  async ttl(key: string): Promise<number> {
    if (!this.client.ttl) return -1;
    return this.client.ttl(key);
  }

  /**
   * Close connection.
   */
  async quit(): Promise<void> {
    if (this.client.quit) {
      await this.client.quit();
    }
  }

  /**
   * Atomically set values only if they are newer (Lua script).
   *
   * Solves TOCTOU race condition in tag updates:
   * - For each key: if current is nil OR current < new, set new
   * - All comparisons happen atomically in Redis
   *
   * Uses Redis EVAL command to run Lua script in Redis sandbox.
   * This is NOT JavaScript eval - Lua runs server-side in Redis.
   *
   * @param entries - Array of [key, numericValue] pairs
   * @returns Number of keys actually updated
   */
  async setIfNewer(entries: Array<[string, number]>): Promise<number> {
    if (entries.length === 0) return 0;

    // Redis EVAL method for Lua scripts (ioredis API)
    const redisEvalMethod = this.client['eval'] as typeof this.client.eval;
    if (!redisEvalMethod) return 0;

    const keys = entries.map(([key]) => key);
    const values = entries.map(([, value]) => String(value));

    // Lua script: compare-and-set for each key
    // Returns count of actually updated keys
    const luaScript = `
      local updated = 0
      for i = 1, #KEYS do
        local current = redis.call('GET', KEYS[i])
        local new = ARGV[i]
        if not current or tonumber(current) < tonumber(new) then
          redis.call('SET', KEYS[i], new)
          updated = updated + 1
        end
      end
      return updated
    `;

    const result = await redisEvalMethod.call(
      this.client,
      luaScript,
      keys.length,
      ...keys,
      ...values,
    );
    return typeof result === 'number' ? result : 0;
  }

  /**
   * Check if client is a Redis Cluster.
   */
  private isCluster(): boolean {
    return typeof this.client.nodes === 'function';
  }

  /**
   * Scan keys using SCAN command (non-blocking).
   */
  private async scanKeys(pattern: string): Promise<string[]> {
    if (!this.client.scan) return [];

    const keys: string[] = [];
    let cursor = '0';

    do {
      const [nextCursor, batch] = await this.client.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        this.scanCount,
      );
      cursor = nextCursor;
      keys.push(...batch);
    } while (cursor !== '0');

    return keys;
  }

  /**
   * Scan keys from a single cluster node using stream.
   */
  private scanNodeKeys(node: RedisLike, pattern: string): Promise<string[]> {
    if (!node.scanStream) {
      // Fallback to regular SCAN if scanStream not available
      if (node.scan) {
        return this.scanKeysFromNode(node, pattern);
      }
      return Promise.resolve([]);
    }

    return new Promise((resolve, reject) => {
      const keys: string[] = [];
      const stream = node.scanStream!({ match: pattern, count: this.scanCount });

      stream.on('data', (chunk: string[] = []) => {
        keys.push(...chunk);
      });
      stream.on('end', () => resolve(keys));
      stream.on('error', (err: Error) => reject(err));
    });
  }

  /**
   * Scan keys from node using SCAN command.
   */
  private async scanKeysFromNode(node: RedisLike, pattern: string): Promise<string[]> {
    if (!node.scan) return [];

    const keys: string[] = [];
    let cursor = '0';

    do {
      const result = await node.scan(cursor, 'MATCH', pattern, 'COUNT', this.scanCount);
      cursor = result[0];
      keys.push(...result[1]);
    } while (cursor !== '0');

    return keys;
  }
}
