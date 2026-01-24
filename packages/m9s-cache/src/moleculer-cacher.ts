import BaseCacher from 'moleculer/src/cachers/base.js';
import Serializers from 'moleculer/src/serializers/index.js';
import { METRIC } from 'moleculer/src/metrics/index.js';
import type { ServiceBroker } from 'moleculer';
import { CacheStore } from './cache-store';
import { generateTags } from './tag-utils';
import type {
  CacheDriver,
  CacheEnvelope,
  CachePayload,
  CacheSerializer,
  CacheTagConfig,
  MoleculerCacheOptions,
} from './types';
import type { CacheLockProvider } from './types';

export interface M9sCacheCacherOptions {
  driver: CacheDriver;
  prefix?: string;
  ttl?: number | null;
  serializer?: unknown;
  keygen?: unknown;
  maxParamsLength?: number | null;
  tagPrefix?: string;
  lockProvider?: CacheLockProvider;
}

class MoleculerSerializerAdapter implements CacheSerializer {
  constructor(
    private readonly serializer: {
      serialize: (value: unknown) => CachePayload;
      deserialize: (payload: CachePayload) => unknown;
    },
  ) {}

  serialize(value: unknown): CachePayload {
    return this.serializer.serialize(value);
  }

  deserialize<T>(payload: CachePayload): T {
    return this.serializer.deserialize(payload) as T;
  }
}

type NormalizedCacheOptions = {
  enabled: boolean | ((ctx: unknown) => boolean);
  ttl?: number;
  keys?: string[];
  tags?: CacheTagConfig[];
  lock: { enabled: boolean; ttl: number };
};

/**
 * Moleculer-compatible cacher with tag invalidation support.
 */
export class M9sCacheCacher extends BaseCacher {
  private readonly driver: CacheDriver;
  private readonly lockProvider?: CacheLockProvider;
  private serializer!: CacheSerializer;
  private store!: CacheStore;
  private tagPrefix = 'TAG-';

  constructor(options: M9sCacheCacherOptions) {
    super(options);
    this.driver = options.driver;
    this.lockProvider = options.lockProvider;
  }

  init(broker: ServiceBroker): void {
    super.init(broker);

    const serializer = Serializers.resolve(this.opts.serializer);
    serializer.init(this.broker);

    this.serializer = new MoleculerSerializerAdapter(serializer);
    this.store = new CacheStore({
      driver: this.driver,
      serializer: this.serializer,
      prefix: this.prefix,
      defaultTTLSeconds: this.opts.ttl ?? null,
    });

    this.tagPrefix = `${this.prefix}${this.opts.tagPrefix ?? 'TAG-'}`;
  }

  /** Get cached value by key. */
  async get(key: string): Promise<unknown> {
    this.logger.debug(`GET ${key}`);
    this.metrics.increment(METRIC.MOLECULER_CACHER_GET_TOTAL);
    const timeEnd = this.metrics.timer(METRIC.MOLECULER_CACHER_GET_TIME);

    const data = await this.store.get(key);
    if (data != null) {
      this.logger.debug(`FOUND ${key}`);
      this.metrics.increment(METRIC.MOLECULER_CACHER_FOUND_TOTAL);
    }

    timeEnd();
    return data;
  }

  /** Get cached value and ttl by key. */
  async getWithTTL(key: string): Promise<{ data: unknown; ttl: number | null }> {
    const data = await this.get(key);
    if (!this.driver.ttl) return { data, ttl: null };
    const ttl = await this.driver.ttl(this.prefix + key);
    return { data, ttl };
  }

  /** Set cached value by key. */
  async set(key: string, data: unknown, ttl?: number): Promise<void> {
    this.metrics.increment(METRIC.MOLECULER_CACHER_SET_TOTAL);
    const timeEnd = this.metrics.timer(METRIC.MOLECULER_CACHER_SET_TIME);

    await this.store.set(key, data, { ttlSeconds: ttl ?? undefined });

    timeEnd();
  }

  /** Set hash fields by key. */
  async hSet(key: string, data: Record<string, CachePayload>, ttl?: number): Promise<void> {
    this.metrics.increment(METRIC.MOLECULER_CACHER_SET_TOTAL);
    const timeEnd = this.metrics.timer(METRIC.MOLECULER_CACHER_SET_TIME);
    const fullKey = this.prefix + key;

    if (this.driver.hset) {
      await this.driver.hset(fullKey, data);
    } else {
      await this.store.set(key, data, { ttlSeconds: ttl ?? undefined });
      timeEnd();
      return;
    }

    if (ttl) {
      await this.driver.expire(fullKey, ttl);
    }

    timeEnd();
  }

  /** Set hash fields with tags. */
  async hSetWithTags(
    key: string,
    data: unknown,
    ttl?: number,
    tags: Record<string, number> = {},
  ): Promise<void> {
    const payload: Record<string, CachePayload> = {
      data: this.serializer.serialize(data),
      tags: this.serializer.serialize(tags),
      created_at: Date.now().toString(),
    };

    await this.hSet(key, payload, ttl);
  }

  /** Get all hash fields. */
  async hGetAll(key: string): Promise<Record<string, unknown> | null> {
    this.logger.debug(`HGETALL ${key}`);
    this.metrics.increment(METRIC.MOLECULER_CACHER_GET_TOTAL);
    const timeEnd = this.metrics.timer(METRIC.MOLECULER_CACHER_GET_TIME);

    const fullKey = this.prefix + key;
    if (this.driver.hgetall) {
      const dataSrc = await this.driver.hgetall(fullKey);
      if (!dataSrc) {
        timeEnd();
        return null;
      }

      this.logger.debug(`HGETALL FOUND ${key}`);
      this.metrics.increment(METRIC.MOLECULER_CACHER_FOUND_TOTAL);

      const result: Record<string, unknown> = {};
      Object.keys(dataSrc).forEach((field) => {
        result[field] = this.serializer.deserialize(dataSrc[field]);
      });
      timeEnd();
      return result;
    }

    const fallback = await this.store.get<Record<string, unknown>>(key);
    timeEnd();
    return fallback ?? null;
  }

  /** Get single hash field. */
  async hGet(key: string, field: string): Promise<unknown | null> {
    this.logger.debug(`HGET ${key}`);
    this.metrics.increment(METRIC.MOLECULER_CACHER_GET_TOTAL);
    const timeEnd = this.metrics.timer(METRIC.MOLECULER_CACHER_GET_TIME);

    const fullKey = this.prefix + key;
    if (this.driver.hget) {
      const dataSrc = await this.driver.hget(fullKey, field);
      if (dataSrc != null) {
        this.logger.debug(`FOUND ${key}`);
        this.metrics.increment(METRIC.MOLECULER_CACHER_FOUND_TOTAL);
        timeEnd();
        return this.serializer.deserialize(dataSrc);
      }
      timeEnd();
      return null;
    }

    const fallback = await this.store.get<Record<string, unknown>>(key);
    timeEnd();
    if (!fallback) return null;
    return fallback[field] ?? null;
  }

  /** Delete cached value(s) by key. */
  async del(key: string | string[]): Promise<number> {
    this.metrics.increment(METRIC.MOLECULER_CACHER_DEL_TOTAL);
    const timeEnd = this.metrics.timer(METRIC.MOLECULER_CACHER_DEL_TIME);

    const count = await this.store.del(key);
    timeEnd();
    return count;
  }

  /** Close cache driver. */
  async close(): Promise<void> {
    if (this.driver.quit) {
      await this.driver.quit();
    }
  }

  /** Clean cache entries by pattern. */
  async clean(match = '**'): Promise<number> {
    this.metrics.increment(METRIC.MOLECULER_CACHER_CLEAN_TOTAL);
    const timeEnd = this.metrics.timer(METRIC.MOLECULER_CACHER_CLEAN_TIME);

    const count = await this.store.clean(match);
    timeEnd();
    return count;
  }

  /** List cache keys by pattern. */
  async getKeys(pattern: string): Promise<string[]> {
    return this.driver.keys(this.prefix + pattern);
  }

  /** Get cache prefix or override. */
  cachePrefix(prefix?: string): string {
    return prefix ?? this.prefix;
  }

  /** Set tag values. */
  async setTags(tags: Record<string, number>, prefix = this.tagPrefix): Promise<void> {
    const entries = Object.entries(tags).map(([tag, value]) => [
      `${prefix}${tag}`,
      String(value),
    ]) as Array<[string, CachePayload]>;

    if (!entries.length) return;
    await this.driver.mset(entries);
  }

  /** Get tag values. */
  async getTags(tags: string[], prefix = this.tagPrefix): Promise<Array<number | null>> {
    if (!tags.length) return [];
    const keys = tags.map((tag) => `${prefix}${tag}`);
    const values = await this.driver.mget(keys);
    return values.map((value) => {
      if (value == null) return null;
      const str = Buffer.isBuffer(value) ? value.toString('utf-8') : String(value);
      const num = Number(str);
      return Number.isFinite(num) ? num : null;
    });
  }

  /** Check existence of a cache key. */
  async exist(key: string): Promise<boolean> {
    return this.driver.exists(this.prefix + key);
  }

  /**
   * Moleculer cache middleware with tag invalidation support.
   */
  middleware() {
    return (
      handler: (ctx: unknown) => Promise<unknown>,
      action: { name: string; cache?: boolean | MoleculerCacheOptions },
    ) => {
      const opts = normalizeCacheOptions(action.cache);

      if (opts.enabled === false) return handler;
      const isEnabledFn = typeof opts.enabled === 'function';

      return async (ctx: any) => {
        if (isEnabledFn && !opts.enabled.call(ctx.service, ctx)) return handler(ctx);
        if (ctx.meta?.['$cache'] === false) return handler(ctx);

        const cacheKey = this.getCacheKey(action.name, ctx.params, ctx.meta, opts.keys);

        const requestNewData = async (existingData?: unknown) => {
          const requestAndSet = async () => {
            const result = await handler(ctx);
            const tagsConfig = opts.tags ?? [];
            const tags = tagsConfig.length ? generateTags(result, tagsConfig) : {};

            if (Object.keys(tags).length) {
              const tagKeys = Object.keys(tags);
              const current = await this.getTags(tagKeys);
              const toSet: Record<string, number> = {};

              tagKeys.forEach((tag, index) => {
                const currentValue = current[index];
                if (currentValue == null || currentValue < tags[tag]) {
                  toSet[tag] = tags[tag];
                }
              });

              if (Object.keys(toSet).length) {
                await this.setTags(toSet);
              }
            }

            await this.hSetWithTags(cacheKey, result, opts.ttl ?? undefined, tags);
            return result;
          };

          if (opts.lock.enabled !== false && this.lockProvider) {
            const lockKey = `${cacheKey}-lock`;
            const lockTtl = opts.lock.ttl ?? 15000;
            const lockFn = existingData
              ? this.lockProvider.tryAcquire.bind(this.lockProvider)
              : this.lockProvider.acquire.bind(this.lockProvider);

            const unlock = await lockFn(this.prefix + lockKey, lockTtl);
            if (!unlock) return existingData;

            try {
              return await requestAndSet();
            } finally {
              await unlock();
            }
          }

          return requestAndSet();
        };

        const cachedEnvelope = (await this.hGetAll(cacheKey)) as CacheEnvelope | null;
        if (cachedEnvelope?.data !== undefined && cachedEnvelope?.data !== null) {
          if (await this.isStale(cachedEnvelope.tags as Record<string, number> | undefined)) {
            return requestNewData(cachedEnvelope.data);
          }

          ctx.cachedResult = true;
          return cachedEnvelope.data;
        }

        return requestNewData();
      };
    };
  }

  /**
   * Override to keep key generation stable with nested objects.
   */
  // eslint-disable-next-line class-methods-use-this
  _generateKeyFromObject(obj: unknown): string {
    if (Array.isArray(obj)) {
      return '[' + obj.map((item) => this._generateKeyFromObject(item)).join('|') + ']';
    }
    if (obj instanceof Date) {
      return String(obj.valueOf());
    }
    if (obj && typeof obj === 'object') {
      return (
        '{' +
        Object.keys(obj as Record<string, unknown>)
          .map(
            (key) => `${key}:${this._generateKeyFromObject((obj as Record<string, unknown>)[key])}`,
          )
          .join('|') +
        '}'
      );
    }
    if (obj != null) {
      return String(obj);
    }
    return 'null';
  }

  private async isStale(tags?: Record<string, number>): Promise<boolean> {
    if (!tags || !Object.keys(tags).length) return false;
    const tagKeys = Object.keys(tags);
    const current = await this.getTags(tagKeys);

    return tagKeys.some((tag, index) => {
      const currentValue = current[index];
      if (currentValue == null) return true;
      return currentValue > tags[tag];
    });
  }
}

function normalizeCacheOptions(cache?: boolean | MoleculerCacheOptions): NormalizedCacheOptions {
  const cacheOpts: MoleculerCacheOptions = typeof cache === 'object' ? cache : { enabled: !!cache };
  const lock = typeof cacheOpts.lock === 'object' ? cacheOpts.lock : { enabled: !!cacheOpts.lock };

  return {
    enabled: cacheOpts.enabled ?? true,
    ttl: cacheOpts.ttl ?? undefined,
    keys: cacheOpts.keys ?? undefined,
    tags: cacheOpts.tags ?? undefined,
    lock: {
      enabled: lock.enabled ?? false,
      ttl: lock.ttl ?? 15000,
    },
  };
}
