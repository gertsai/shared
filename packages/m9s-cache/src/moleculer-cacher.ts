// ESM-compatible dynamic import for Moleculer internals
import { createRequire } from 'node:module';
import type { ServiceBroker, LoggerInstance, MetricRegistry } from 'moleculer';

const require = createRequire(import.meta.url);
const Moleculer = require('moleculer');
const BaseCacher = Moleculer.Cachers.Base;
const MoleculerSerializers = Moleculer.Serializers;
const { METRIC } = Moleculer;
import { CacheStore } from './cache-store.js';
import { generateTags } from './tag-utils.js';
import type {
  CacheDriver,
  CacheEnvelope,
  CacheLockProvider,
  CachePayload,
  GenericCacheSerializer,
  MoleculerCacheOptions,
  MoleculerContext,
  NormalizedCacheOptions,
  TagVersionMap,
} from './types.js';

/**
 * Base cacher interface (from Moleculer internals).
 * Minimal type definition for TypeScript compatibility.
 */
interface BaseCacherType {
  opts: {
    ttl?: number | null;
    prefix?: string;
    tagPrefix?: string;
    serializer?: unknown;
    keygen?: unknown;
    maxParamsLength?: number | null;
    [key: string]: unknown;
  };
  broker: ServiceBroker;
  logger: LoggerInstance;
  metrics: MetricRegistry;
  prefix: string;
  init(broker: ServiceBroker): void;
  getCacheKey(actionName: string, params: unknown, meta: unknown, keys?: string[]): string;
}

/**
 * Options for M9sCacheCacher.
 */
export interface M9sCacheCacherOptions {
  /** Cache driver implementation. */
  driver: CacheDriver;
  /** Cache key prefix. */
  prefix?: string;
  /** Default TTL in seconds. */
  ttl?: number | null;
  /** Moleculer serializer config. */
  serializer?: unknown;
  /** Key generator function. */
  keygen?: unknown;
  /** Max length for params in cache key. */
  maxParamsLength?: number | null;
  /** Prefix for tag keys. */
  tagPrefix?: string;
  /** Lock provider for stampede prevention. */
  lockProvider?: CacheLockProvider;
}

/**
 * Adapter to bridge Moleculer serializers to GenericCacheSerializer.
 */
class MoleculerSerializerAdapter implements GenericCacheSerializer {
  constructor(
    private readonly moleculerSerializer: {
      serialize: (value: unknown) => CachePayload;
      deserialize: (payload: CachePayload) => unknown;
    },
  ) {}

  serialize<T>(value: T): CachePayload {
    return this.moleculerSerializer.serialize(value);
  }

  deserialize<T>(payload: CachePayload): T {
    return this.moleculerSerializer.deserialize(payload) as T;
  }
}

/**
 * Moleculer-compatible cacher with tag-based invalidation and distributed locking.
 *
 * Features:
 * - Tag-based cache invalidation (timestamp versioning)
 * - Distributed locking via Redlock
 * - Double-check locking to prevent thundering herd
 * - Hash-based envelope storage for metadata
 *
 * @example
 * ```typescript
 * const cacher = new M9sCacheCacher({
 *   driver: new RedisCacheDriver({ redis: 'redis://localhost' }),
 *   lockProvider: new RedlockLockProvider({ clients: [redis] }),
 *   ttl: 300,
 *   prefix: 'app:',
 * });
 *
 * broker.cacher = cacher;
 * ```
 */
// Type assertion for BaseCacher class
const BaseCacherClass = BaseCacher as new (options: unknown) => BaseCacherType;

export class M9sCacheCacher extends BaseCacherClass {
  private readonly _driver: CacheDriver;
  private readonly _lockProvider?: CacheLockProvider;
  private _serializer!: GenericCacheSerializer;
  private _store!: CacheStore;
  private _tagPrefix = 'TAG-';

  constructor(options: M9sCacheCacherOptions) {
    super(options);
    this._driver = options.driver;
    this._lockProvider = options.lockProvider;
  }

  /**
   * Initialize cacher with broker context.
   */
  init(broker: ServiceBroker): void {
    super.init(broker);

    const serializer = MoleculerSerializers.resolve(this.opts.serializer);
    serializer.init(this.broker);

    this._serializer = new MoleculerSerializerAdapter(serializer);
    this._store = new CacheStore({
      driver: this._driver,
      serializer: this._serializer,
      prefix: this.prefix,
      defaultTTLSeconds: typeof this.opts.ttl === 'number' ? this.opts.ttl : null,
      validateKeys: false, // Moleculer generates safe keys
    });

    this._tagPrefix = `${this.prefix}${this.opts.tagPrefix ?? 'TAG-'}`;
  }

  /**
   * Get cached value by key.
   */
  async get(key: string): Promise<unknown> {
    this.logger.debug(`GET ${key}`);
    this.metrics.increment(METRIC.MOLECULER_CACHER_GET_TOTAL);
    const timeEnd = this.metrics.timer(METRIC.MOLECULER_CACHER_GET_TIME);

    try {
      const data = await this._store.get(key);
      if (data != null) {
        this.logger.debug(`FOUND ${key}`);
        this.metrics.increment(METRIC.MOLECULER_CACHER_FOUND_TOTAL);
      }
      return data;
    } finally {
      timeEnd();
    }
  }

  /**
   * Get cached value with TTL info.
   */
  async getWithTTL(key: string): Promise<{ data: unknown; ttl: number | null }> {
    const data = await this.get(key);
    if (!this._driver.ttl) return { data, ttl: null };
    const ttl = await this._driver.ttl(this.prefix + key);
    return { data, ttl: ttl >= 0 ? ttl : null };
  }

  /**
   * Set cached value.
   */
  async set(key: string, data: unknown, ttl?: number): Promise<void> {
    this.metrics.increment(METRIC.MOLECULER_CACHER_SET_TOTAL);
    const timeEnd = this.metrics.timer(METRIC.MOLECULER_CACHER_SET_TIME);

    try {
      await this._store.set(key, data, { ttlSeconds: ttl ?? undefined });
    } finally {
      timeEnd();
    }
  }

  /**
   * Set hash fields by key.
   */
  async hSet(key: string, data: Record<string, CachePayload>, ttl?: number): Promise<void> {
    this.metrics.increment(METRIC.MOLECULER_CACHER_SET_TOTAL);
    const timeEnd = this.metrics.timer(METRIC.MOLECULER_CACHER_SET_TIME);

    try {
      const fullKey = this.prefix + key;

      if (this._driver.hset) {
        await this._driver.hset(fullKey, data);
        if (ttl != null && ttl > 0) {
          await this._driver.expire(fullKey, ttl);
        }
      } else {
        // Fallback for drivers without hash support
        await this._store.set(key, data, { ttlSeconds: ttl ?? undefined });
      }
    } finally {
      timeEnd();
    }
  }

  /**
   * Set hash fields with tag envelope.
   */
  async hSetWithTags(
    key: string,
    data: unknown,
    ttl?: number,
    tags: TagVersionMap = {},
  ): Promise<void> {
    const envelope: Record<string, CachePayload> = {
      data: this._serializer.serialize(data),
      tags: this._serializer.serialize(tags),
      created_at: String(Date.now()),
    };

    await this.hSet(key, envelope, ttl);
  }

  /**
   * Get all hash fields.
   */
  async hGetAll<T = unknown>(key: string): Promise<CacheEnvelope<T> | null> {
    this.logger.debug(`HGETALL ${key}`);
    this.metrics.increment(METRIC.MOLECULER_CACHER_GET_TOTAL);
    const timeEnd = this.metrics.timer(METRIC.MOLECULER_CACHER_GET_TIME);

    try {
      const fullKey = this.prefix + key;

      if (this._driver.hgetall) {
        const raw = await this._driver.hgetall(fullKey);
        if (!raw) return null;

        this.logger.debug(`HGETALL FOUND ${key}`);
        this.metrics.increment(METRIC.MOLECULER_CACHER_FOUND_TOTAL);

        return this.deserializeEnvelope<T>(raw);
      }

      // Fallback for drivers without hash support
      const fallback = await this._store.get<CacheEnvelope<T>>(key);
      if (fallback) {
        this.metrics.increment(METRIC.MOLECULER_CACHER_FOUND_TOTAL);
      }
      return fallback;
    } finally {
      timeEnd();
    }
  }

  /**
   * Get single hash field.
   */
  async hGet(key: string, field: string): Promise<unknown | null> {
    this.logger.debug(`HGET ${key}:${field}`);
    this.metrics.increment(METRIC.MOLECULER_CACHER_GET_TOTAL);
    const timeEnd = this.metrics.timer(METRIC.MOLECULER_CACHER_GET_TIME);

    try {
      const fullKey = this.prefix + key;

      if (this._driver.hget) {
        const raw = await this._driver.hget(fullKey, field);
        if (raw != null) {
          this.logger.debug(`FOUND ${key}:${field}`);
          this.metrics.increment(METRIC.MOLECULER_CACHER_FOUND_TOTAL);
          return this._serializer.deserialize(raw);
        }
        return null;
      }

      // Fallback for drivers without hash support
      const fallback = await this._store.get<Record<string, unknown>>(key);
      if (fallback) {
        this.metrics.increment(METRIC.MOLECULER_CACHER_FOUND_TOTAL);
        return fallback[field] ?? null;
      }
      return null;
    } finally {
      timeEnd();
    }
  }

  /**
   * Delete cached value(s).
   */
  async del(key: string | string[]): Promise<number> {
    this.metrics.increment(METRIC.MOLECULER_CACHER_DEL_TOTAL);
    const timeEnd = this.metrics.timer(METRIC.MOLECULER_CACHER_DEL_TIME);

    try {
      return await this._store.del(key);
    } finally {
      timeEnd();
    }
  }

  /**
   * Clean cache by pattern.
   */
  async clean(match = '**'): Promise<number> {
    this.metrics.increment(METRIC.MOLECULER_CACHER_CLEAN_TOTAL);
    const timeEnd = this.metrics.timer(METRIC.MOLECULER_CACHER_CLEAN_TIME);

    try {
      return await this._store.clean(match);
    } finally {
      timeEnd();
    }
  }

  /**
   * Close cache driver connections.
   */
  async close(): Promise<void> {
    if (this._driver.quit) {
      await this._driver.quit();
    }
  }

  /**
   * Get keys by pattern.
   */
  async getKeys(pattern: string): Promise<string[]> {
    return this._driver.keys(this.prefix + pattern);
  }

  /**
   * Get cache prefix.
   */
  cachePrefix(prefix?: string): string {
    return prefix ?? this.prefix;
  }

  /**
   * Check if key exists.
   */
  async exist(key: string): Promise<boolean> {
    return this._driver.exists(this.prefix + key);
  }

  /**
   * Get TTL of key.
   */
  async ttl(key: string): Promise<number> {
    if (!this._driver.ttl) return -1;
    return this._driver.ttl(this.prefix + key);
  }

  // ============================================================================
  // Tag Management
  // ============================================================================

  /**
   * Set tag versions.
   */
  async setTags(tags: TagVersionMap, prefix = this._tagPrefix): Promise<void> {
    const entries = Object.entries(tags);
    if (entries.length === 0) return;

    const msetEntries: Array<[string, CachePayload]> = entries.map(([tag, value]) => [
      `${prefix}${tag}`,
      String(value),
    ]);

    await this._driver.mset(msetEntries);
  }

  /**
   * Get tag versions.
   */
  async getTags(tags: string[], prefix = this._tagPrefix): Promise<Array<number | null>> {
    if (tags.length === 0) return [];

    const keys = tags.map((tag) => `${prefix}${tag}`);
    const values = await this._driver.mget(keys);

    return values.map((value) => {
      if (value == null) return null;
      const str = Buffer.isBuffer(value) ? value.toString('utf-8') : String(value);
      const num = Number(str);
      return Number.isFinite(num) ? num : null;
    });
  }

  // ============================================================================
  // Moleculer Middleware
  // ============================================================================

  /**
   * Moleculer cache middleware with tag invalidation and double-check locking.
   *
   * Returns a Moleculer 0.14.x **middleware object** (`{ name, localAction }`)
   * — NOT a bare function. The bare-function shape is deprecated and emits
   * "Validator middleware returning a Function is deprecated…" (the Moleculer
   * source has a copy-paste typo: that warning fires from `cacher.js` too).
   */
  middleware() {
    return {
      name: 'M9sCache',
      localAction: <TParams = Record<string, unknown>, TMeta = Record<string, unknown>>(
        handler: (ctx: MoleculerContext<TParams, TMeta>) => Promise<unknown>,
        action: { name: string; cache?: boolean | MoleculerCacheOptions },
      ) => {
        const opts = normalizeCacheOptions(action.cache);

        if (opts.enabled === false) return handler;

      const isEnabledFn = typeof opts.enabled === 'function';

      return async (ctx: MoleculerContext<TParams, TMeta>): Promise<unknown> => {
        // Check dynamic enable
        if (isEnabledFn) {
          // Cast to accept any MoleculerContext params/meta
          const enableFn = opts.enabled as (ctx: MoleculerContext<unknown, unknown>) => boolean;
          if (!enableFn.call(ctx.service, ctx as MoleculerContext<unknown, unknown>)) {
            return handler(ctx);
          }
        }

        // Check per-request disable
        if (ctx.meta?.['$cache'] === false) {
          return handler(ctx);
        }

        const cacheKey = this.getCacheKey(action.name, ctx.params, ctx.meta, opts.keys);

        // Request new data with optional locking
        const requestNewData = async (existingData?: unknown): Promise<unknown> => {
          const loadAndCache = async (): Promise<unknown> => {
            const result = await handler(ctx);

            // Generate tags from response
            const tagsConfig = opts.tags ?? [];
            const tags = tagsConfig.length > 0 ? generateTags(result, tagsConfig) : {};

            // Update tags if needed
            if (Object.keys(tags).length > 0) {
              await this.updateTagsIfNewer(tags);
            }

            // Cache with envelope
            await this.hSetWithTags(cacheKey, result, opts.ttl ?? undefined, tags);

            return result;
          };

          // Without lock provider
          if (!opts.lock.enabled || !this._lockProvider) {
            return loadAndCache();
          }

          // With lock provider - use double-check locking
          const lockKey = `${this.prefix}${cacheKey}:lock`;
          const lockTtl = opts.lock.ttl;

          // If we have existing data, try non-blocking lock
          const lockFn =
            existingData != null
              ? this._lockProvider.tryAcquire.bind(this._lockProvider)
              : this._lockProvider.acquire.bind(this._lockProvider);

          const unlock = await lockFn(lockKey, lockTtl);

          // Lock not acquired and we have stale data - return stale
          if (!unlock && existingData != null) {
            return existingData;
          }

          // Lock not acquired and no existing data - load without caching
          if (!unlock) {
            return handler(ctx);
          }

          try {
            // Double-check: someone might have cached while we waited
            const cachedAfterLock = await this.hGetAll<unknown>(cacheKey);
            if (cachedAfterLock?.data != null) {
              const isStale = await this.isStale(cachedAfterLock.tags);
              if (!isStale) {
                ctx.cachedResult = true;
                return cachedAfterLock.data;
              }
            }

            return await loadAndCache();
          } finally {
            await unlock();
          }
        };

        // Try to get from cache
        const cachedEnvelope = await this.hGetAll<unknown>(cacheKey);

        if (cachedEnvelope?.data != null) {
          // Check if stale
          if (await this.isStale(cachedEnvelope.tags)) {
            return requestNewData(cachedEnvelope.data);
          }

          ctx.cachedResult = true;
          return cachedEnvelope.data;
        }

        return requestNewData();
      };
      },
    };
  }

  // ============================================================================
  // Key Generation (override from base)
  // ============================================================================

  /**
   * Generate stable cache key from nested objects.
   */
  _generateKeyFromObject(obj: unknown): string {
    if (Array.isArray(obj)) {
      return '[' + obj.map((item) => this._generateKeyFromObject(item)).join('|') + ']';
    }
    if (obj instanceof Date) {
      return String(obj.valueOf());
    }
    if (obj && typeof obj === 'object') {
      const record = obj as Record<string, unknown>;
      const keys = Object.keys(record).sort(); // Sort for stability
      return (
        '{' +
        keys.map((key) => `${key}:${this._generateKeyFromObject(record[key])}`).join('|') +
        '}'
      );
    }
    if (obj != null) {
      return String(obj);
    }
    return 'null';
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  /**
   * Check if cached entry is stale based on tag versions.
   */
  private async isStale(tags?: TagVersionMap): Promise<boolean> {
    if (!tags || Object.keys(tags).length === 0) return false;

    const tagKeys = Object.keys(tags);
    const currentVersions = await this.getTags(tagKeys);

    return tagKeys.some((tag, index) => {
      const currentVersion = currentVersions[index];
      // Tag deleted = stale
      if (currentVersion == null) return true;
      // Current version newer = stale
      return currentVersion > tags[tag];
    });
  }

  /**
   * Update tag versions only if current values are older.
   *
   * Uses atomic compare-and-set to prevent TOCTOU race conditions.
   * If driver supports setIfNewer (Redis Lua script), uses it.
   * Otherwise falls back to non-atomic read-compare-write.
   */
  private async updateTagsIfNewer(tags: TagVersionMap): Promise<void> {
    const tagKeys = Object.keys(tags);
    if (tagKeys.length === 0) return;

    // Prepare entries with full tag keys
    const entries: Array<[string, number]> = tagKeys.map((tag) => [
      `${this._tagPrefix}${tag}`,
      tags[tag],
    ]);

    // Use atomic setIfNewer if driver supports it (Redis Lua script)
    if (this._driver.setIfNewer) {
      await this._driver.setIfNewer(entries);
      return;
    }

    // Fallback: non-atomic read-compare-write (for drivers without atomic support)
    // Note: This has TOCTOU race condition, but is better than nothing
    const currentVersions = await this.getTags(tagKeys);

    const toUpdate: TagVersionMap = {};
    tagKeys.forEach((tag, index) => {
      const currentVersion = currentVersions[index];
      if (currentVersion == null || currentVersion < tags[tag]) {
        toUpdate[tag] = tags[tag];
      }
    });

    if (Object.keys(toUpdate).length > 0) {
      await this.setTags(toUpdate);
    }
  }

  /**
   * Deserialize envelope from raw hash data.
   */
  private deserializeEnvelope<T>(raw: Record<string, CachePayload>): CacheEnvelope<T> {
    return {
      data: raw.data ? this._serializer.deserialize<T>(raw.data) : (undefined as T),
      tags: raw.tags ? this._serializer.deserialize<TagVersionMap>(raw.tags) : undefined,
      created_at: raw.created_at ? Number(raw.created_at) : Date.now(),
    };
  }
}

/**
 * Normalize cache options with defaults.
 */
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
