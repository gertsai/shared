import { createRequire } from 'node:module';
import type { CacheDriver, CachePayload } from './types';
import type { ClusterNode, ClusterOptions, RedisOptions } from 'ioredis';

export interface RedisCacheDriverOptions {
  client?: RedisLike;
  redis?: string | RedisOptions;
  cluster?: {
    nodes: Array<string | ClusterNode | RedisOptions>;
    options?: ClusterOptions;
  };
}

type RedisLike = {
  getBuffer?: (key: string) => Promise<CachePayload | null>;
  get?: (key: string) => Promise<CachePayload | null>;
  set: (...args: unknown[]) => Promise<unknown>;
  del: (keys: string | string[]) => Promise<number>;
  mget: (keys: string[]) => Promise<Array<CachePayload | null>>;
  mset: (entries: Array<[string, CachePayload]>) => Promise<unknown>;
  hset?: (key: string, entries: Record<string, CachePayload>) => Promise<number>;
  hget?: (key: string, field: string) => Promise<CachePayload | null>;
  hgetall?: (key: string) => Promise<Record<string, CachePayload>>;
  keys?: (pattern: string) => Promise<string[]>;
  exists: (key: string) => Promise<number>;
  expire: (key: string, ttlSeconds: number) => Promise<number>;
  ttl?: (key: string) => Promise<number>;
  quit?: () => Promise<void>;
  scanStream?: (options: { match: string; count: number }) => NodeJS.ReadableStream;
  nodes?: (role: string) => RedisLike[];
};

/**
 * Redis/Valkey cache driver using ioredis.
 */
export class RedisCacheDriver implements CacheDriver {
  private readonly client: RedisLike;

  constructor(options: RedisCacheDriverOptions) {
    if (options.client) {
      this.client = options.client;
      return;
    }

    const require = createRequire(import.meta.url);
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Redis = require('ioredis');

    if (options.cluster?.nodes?.length) {
      this.client = new Redis.Cluster(options.cluster.nodes, options.cluster.options);
    } else {
      this.client = new Redis(options.redis);
    }
  }

  async get(key: string): Promise<CachePayload | null> {
    if (this.client.getBuffer) {
      return this.client.getBuffer(key);
    }
    if (this.client.get) {
      return this.client.get(key);
    }
    return null;
  }

  async set(key: string, value: CachePayload, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds != null && ttlSeconds > 0) {
      await this.client.set(key, value, 'EX', ttlSeconds);
      return;
    }

    await this.client.set(key, value);
  }

  async del(keys: string | string[]): Promise<number> {
    return this.client.del(keys);
  }

  async mget(keys: string[]): Promise<Array<CachePayload | null>> {
    return this.client.mget(keys);
  }

  async mset(entries: Array<[string, CachePayload]>): Promise<void> {
    await this.client.mset(entries);
  }

  async hset(key: string, entries: Record<string, CachePayload>): Promise<void> {
    if (!this.client.hset) return;
    await this.client.hset(key, entries);
  }

  async hget(key: string, field: string): Promise<CachePayload | null> {
    if (!this.client.hget) return null;
    return this.client.hget(key, field);
  }

  async hgetall(key: string): Promise<Record<string, CachePayload> | null> {
    if (!this.client.hgetall) return null;
    const result = await this.client.hgetall(key);
    if (!result || !Object.keys(result).length) return null;
    return result;
  }

  async keys(pattern: string): Promise<string[]> {
    if (this.isCluster()) {
      const nodes = this.client.nodes?.('master') ?? [];
      const results = await Promise.all(nodes.map((node) => scanNodeKeys(node, pattern)));
      return Array.from(new Set(results.flat()));
    }

    if (this.client.keys) {
      return this.client.keys(pattern);
    }

    return [];
  }

  async exists(key: string): Promise<boolean> {
    const count = await this.client.exists(key);
    return count > 0;
  }

  async expire(key: string, ttlSeconds: number): Promise<void> {
    await this.client.expire(key, ttlSeconds);
  }

  async ttl(key: string): Promise<number> {
    if (!this.client.ttl) return -1;
    return this.client.ttl(key);
  }

  async quit(): Promise<void> {
    if (this.client.quit) {
      await this.client.quit();
    }
  }

  private isCluster(): boolean {
    return typeof this.client.nodes === 'function';
  }
}

function scanNodeKeys(node: RedisLike, pattern: string): Promise<string[]> {
  if (!node.scanStream) {
    return Promise.resolve([]);
  }

  return new Promise((resolve, reject) => {
    const keys: string[] = [];
    const stream = node.scanStream({ match: pattern, count: 100 });

    stream.on('data', (chunk: string[] = []) => {
      keys.push(...chunk);
    });
    stream.on('end', () => resolve(keys));
    stream.on('error', (err) => reject(err));
  });
}
