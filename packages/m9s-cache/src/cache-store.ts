import { JsonSerializer } from './serializers.js';
import type {
  CacheDriver,
  CacheGetResult,
  CachePayload,
  CacheSetOptions,
  CacheStoreOptions,
  CacheWrapOptions,
  CacheWrapResult,
  GenericCacheSerializer,
  CacheKeyValidationOptions,
} from './types.js';
import { validateCacheKey, CacheErrorCode, createCacheError } from './types.js';

/**
 * Cache store with serialization, prefixing, double-check locking, and cache-aside utilities.
 *
 * @example
 * ```typescript
 * const store = new CacheStore({
 *   driver: new RedisCacheDriver({ redis: 'redis://localhost' }),
 *   prefix: 'app:',
 *   defaultTTLSeconds: 300,
 * });
 *
 * // Simple get/set
 * await store.set('user:123', { name: 'John' });
 * const user = await store.get<User>('user:123');
 *
 * // Cache-aside pattern with lock
 * const data = await store.wrap('expensive:query', async () => {
 *   return await db.query('...');
 * }, { lockProvider, lockTtlMs: 10000 });
 * ```
 */
export class CacheStore {
  private readonly driver: CacheDriver;
  private readonly serializer: GenericCacheSerializer;
  private readonly prefix: string;
  private readonly defaultTTLSeconds: number | null;
  private readonly validateKeys: boolean;
  private readonly keyValidation: CacheKeyValidationOptions;

  constructor(options: CacheStoreOptions) {
    this.driver = options.driver;
    this.serializer = options.serializer ?? new JsonSerializer();
    this.prefix = options.prefix ?? '';
    this.defaultTTLSeconds = options.defaultTTLSeconds ?? null;
    this.validateKeys = options.validateKeys ?? process.env.NODE_ENV !== 'production';
    this.keyValidation = options.keyValidation ?? {};
  }

  /**
   * Get cached value by key.
   * Returns null if key doesn't exist or value is corrupted.
   */
  async get<T>(key: string): Promise<T | null> {
    const formattedKey = this.formatKey(key);
    const payload = await this.driver.get(formattedKey);

    if (payload == null) return null;

    try {
      return this.serializer.deserialize<T>(payload);
    } catch (error) {
      // Log but don't throw - treat corrupted data as cache miss
      this.handleDeserializationError(key, error);
      return null;
    }
  }

  /**
   * Get cached value with metadata.
   * Returns discriminated union for type-safe handling.
   */
  async getWithMeta<T>(key: string): Promise<CacheGetResult<T>> {
    const formattedKey = this.formatKey(key);
    const payload = await this.driver.get(formattedKey);

    if (payload == null) {
      return { found: false, value: null };
    }

    try {
      const value = this.serializer.deserialize<T>(payload);
      const ttl = this.driver.ttl ? await this.driver.ttl(formattedKey) : undefined;
      return { found: true, value, ttl };
    } catch (error) {
      this.handleDeserializationError(key, error);
      return { found: false, value: null };
    }
  }

  /**
   * Set cached value by key.
   */
  async set<T>(key: string, value: T, options: CacheSetOptions = {}): Promise<void> {
    const formattedKey = this.formatKey(key);
    const ttlSeconds = this.resolveTTL(options.ttlSeconds);

    let payload: CachePayload;
    try {
      payload = this.serializer.serialize(value);
    } catch (error) {
      throw createCacheError(
        `Failed to serialize value for key "${key}"`,
        CacheErrorCode.SERIALIZATION_FAILED,
        error,
      );
    }

    await this.driver.set(formattedKey, payload, ttlSeconds ?? undefined);
  }

  /**
   * Delete cached value(s).
   * @returns Number of deleted keys.
   */
  async del(keys: string | string[]): Promise<number> {
    const list = Array.isArray(keys) ? keys : [keys];
    if (list.length === 0) return 0;

    const prefixed = list.map((key) => this.formatKey(key));
    return this.driver.del(prefixed);
  }

  /**
   * Check if key exists in cache.
   */
  async has(key: string): Promise<boolean> {
    return this.driver.exists(this.formatKey(key));
  }

  /**
   * Get remaining TTL in seconds.
   * @returns -1 if no expiry, -2 if key doesn't exist.
   */
  async ttl(key: string): Promise<number> {
    if (!this.driver.ttl) return -1;
    return this.driver.ttl(this.formatKey(key));
  }

  /**
   * Update TTL of existing key.
   */
  async expire(key: string, ttlSeconds: number): Promise<void> {
    await this.driver.expire(this.formatKey(key), ttlSeconds);
  }

  /**
   * Clean keys by pattern.
   * @returns Number of deleted keys.
   */
  async clean(pattern = '**'): Promise<number> {
    const normalized = pattern.replace(/\*\*/g, '*');
    const keys = await this.driver.keys(this.formatKey(normalized));
    if (keys.length === 0) return 0;
    return this.driver.del(keys);
  }

  /**
   * Cache-aside helper with double-check locking.
   *
   * Pattern:
   * 1. Try to get from cache
   * 2. If miss and lock available:
   *    a. Acquire lock
   *    b. Check cache again (double-check)
   *    c. If still miss, load and cache
   *    d. Release lock
   *
   * @example
   * ```typescript
   * const user = await store.wrap(
   *   `user:${id}`,
   *   async () => userService.fetchById(id),
   *   {
   *     ttlSeconds: 300,
   *     lockProvider: redlockProvider,
   *     lockTtlMs: 10000,
   *   }
   * );
   * ```
   */
  async wrap<T>(key: string, loader: () => Promise<T>, options: CacheWrapOptions = {}): Promise<T> {
    // First cache check
    const cached = await this.get<T>(key);
    if (cached != null) return cached;

    const { lockProvider, lockTtlMs = 15000, doubleCheck = true } = options;

    // Without lock - simple load and cache
    if (!lockProvider) {
      return this.loadAndCache(key, loader, options);
    }

    // With lock - use double-check locking pattern
    const formattedKey = this.formatKey(key);
    const lockKey = `${formattedKey}:lock`;

    const unlock = await lockProvider.acquire(lockKey, lockTtlMs);

    try {
      // Double-check: another process might have cached while we waited for lock
      if (doubleCheck) {
        const cachedAfterLock = await this.get<T>(key);
        if (cachedAfterLock != null) {
          return cachedAfterLock;
        }
      }

      return await this.loadAndCache(key, loader, options);
    } finally {
      await this.safeUnlock(unlock, lockKey);
    }
  }

  /**
   * Cache-aside with detailed result information.
   * Useful for debugging and metrics.
   */
  async wrapWithMeta<T>(
    key: string,
    loader: () => Promise<T>,
    options: CacheWrapOptions = {},
  ): Promise<CacheWrapResult<T>> {
    const cached = await this.get<T>(key);
    if (cached != null) {
      return { source: 'cache', value: cached };
    }

    const { lockProvider, lockTtlMs = 15000, doubleCheck = true } = options;

    if (!lockProvider) {
      const value = await loader();
      await this.set(key, value, options);
      return { source: 'loader', value, cached: true };
    }

    const formattedKey = this.formatKey(key);
    const lockKey = `${formattedKey}:lock`;

    const unlock = await lockProvider.acquire(lockKey, lockTtlMs);

    try {
      if (doubleCheck) {
        const cachedAfterLock = await this.get<T>(key);
        if (cachedAfterLock != null) {
          return { source: 'cache', value: cachedAfterLock };
        }
      }

      const value = await loader();
      await this.set(key, value, options);
      return { source: 'loader', value, cached: true };
    } finally {
      await this.safeUnlock(unlock, lockKey);
    }
  }

  /**
   * Try to get from cache, fallback to loader without waiting for lock.
   * Returns stale data if lock is held by another process.
   */
  async wrapNonBlocking<T>(
    key: string,
    loader: () => Promise<T>,
    options: CacheWrapOptions = {},
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached != null) return cached;

    const { lockProvider, lockTtlMs = 15000 } = options;

    if (!lockProvider) {
      return this.loadAndCache(key, loader, options);
    }

    const formattedKey = this.formatKey(key);
    const lockKey = `${formattedKey}:lock`;

    const unlock = await lockProvider.tryAcquire(lockKey, lockTtlMs);

    // Lock not acquired - load without caching (another process is updating)
    if (!unlock) {
      return loader();
    }

    try {
      // Double-check after acquiring lock
      const cachedAfterLock = await this.get<T>(key);
      if (cachedAfterLock != null) {
        return cachedAfterLock;
      }

      return await this.loadAndCache(key, loader, options);
    } finally {
      await this.safeUnlock(unlock, lockKey);
    }
  }

  /**
   * Get multiple values by keys.
   */
  async mget<T>(keys: string[]): Promise<Array<T | null>> {
    if (keys.length === 0) return [];

    const formattedKeys = keys.map((k) => this.formatKey(k));
    const payloads = await this.driver.mget(formattedKeys);

    return payloads.map((payload: CachePayload | null, index: number): T | null => {
      if (payload == null) return null;
      try {
        return this.serializer.deserialize<T>(payload);
      } catch (error) {
        this.handleDeserializationError(keys[index], error);
        return null;
      }
    });
  }

  /**
   * Set multiple values.
   */
  async mset<T>(entries: Array<[string, T]>, options: CacheSetOptions = {}): Promise<void> {
    if (entries.length === 0) return;

    const serializedEntries: Array<[string, CachePayload]> = entries.map(([key, value]) => {
      const formattedKey = this.formatKey(key);
      const payload = this.serializer.serialize(value);
      return [formattedKey, payload];
    });

    await this.driver.mset(serializedEntries);

    // Apply TTL if specified (requires separate calls unfortunately)
    const ttl = this.resolveTTL(options.ttlSeconds);
    if (ttl != null && ttl > 0) {
      await Promise.all(serializedEntries.map(([key]) => this.driver.expire(key, ttl)));
    }
  }

  /**
   * Expose cache driver for advanced use cases.
   */
  getDriver(): CacheDriver {
    return this.driver;
  }

  /**
   * Get the configured prefix.
   */
  getPrefix(): string {
    return this.prefix;
  }

  /**
   * Format a key with prefix and optional validation.
   */
  private formatKey(key: string): string {
    if (this.validateKeys) {
      validateCacheKey(key, this.keyValidation);
    }

    if (!this.prefix) return key;
    return `${this.prefix}${key}`;
  }

  /**
   * Load from source and cache the result.
   */
  private async loadAndCache<T>(
    key: string,
    loader: () => Promise<T>,
    options: CacheSetOptions,
  ): Promise<T> {
    const value = await loader();
    await this.set(key, value, options);
    return value;
  }

  /**
   * Resolve TTL from options or defaults.
   */
  private resolveTTL(ttlSeconds: number | null | undefined): number | null {
    if (ttlSeconds === null) return null; // Explicit no-expiry
    if (ttlSeconds !== undefined) return ttlSeconds;
    return this.defaultTTLSeconds;
  }

  /**
   * Handle deserialization errors gracefully.
   */
  private handleDeserializationError(key: string, error: unknown): void {
    // In production, we might want to log this
    if (process.env.NODE_ENV !== 'test') {
      console.warn(`[CacheStore] Deserialization failed for key "${key}":`, error);
    }
  }

  /**
   * Safely release a lock without masking errors.
   * If unlock fails, logs the error but doesn't throw.
   */
  private async safeUnlock(unlock: () => Promise<void> | void, lockKey: string): Promise<void> {
    try {
      await unlock();
    } catch (unlockError) {
      // Log but don't throw - preserve original error if any
      if (process.env.NODE_ENV !== 'test') {
        console.error(`[CacheStore] Failed to release lock "${lockKey}":`, unlockError);
      }
    }
  }
}
