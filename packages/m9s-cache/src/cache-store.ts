import { JsonSerializer } from './serializers';
import type {
  CacheDriver,
  CachePayload,
  CacheSerializer,
  CacheSetOptions,
  CacheStoreOptions,
  CacheWrapOptions,
} from './types';

/**
 * Cache store with serialization, prefixing, and cache-aside utilities.
 */
export class CacheStore {
  private readonly driver: CacheDriver;
  private readonly serializer: CacheSerializer;
  private readonly prefix: string;
  private readonly defaultTTLSeconds: number | null;

  constructor(options: CacheStoreOptions) {
    this.driver = options.driver;
    this.serializer = options.serializer ?? new JsonSerializer();
    this.prefix = options.prefix ?? '';
    this.defaultTTLSeconds = options.defaultTTLSeconds ?? null;
  }

  /** Get cached value by key. */
  async get<T>(key: string): Promise<T | null> {
    const payload = await this.driver.get(this.formatKey(key));
    if (payload == null) return null;

    try {
      return this.serializer.deserialize<T>(payload);
    } catch {
      return null;
    }
  }

  /** Set cached value by key. */
  async set<T>(key: string, value: T, options: CacheSetOptions = {}): Promise<void> {
    const ttlSeconds = options.ttlSeconds ?? this.defaultTTLSeconds ?? undefined;
    const payload = this.serializer.serialize(value) as CachePayload;
    await this.driver.set(this.formatKey(key), payload, ttlSeconds ?? undefined);
  }

  /** Delete cached value(s). */
  async del(keys: string | string[]): Promise<number> {
    const list = Array.isArray(keys) ? keys : [keys];
    const prefixed = list.map((key) => this.formatKey(key));
    return this.driver.del(prefixed);
  }

  /** Check if key exists. */
  async has(key: string): Promise<boolean> {
    return this.driver.exists(this.formatKey(key));
  }

  /** Clean keys by pattern. */
  async clean(pattern = '**'): Promise<number> {
    const normalized = pattern.replace(/\*\*/g, '*');
    const keys = await this.driver.keys(this.formatKey(normalized));
    if (!keys.length) return 0;
    return this.driver.del(keys);
  }

  /** Cache-aside helper. */
  async wrap<T>(key: string, loader: () => Promise<T>, options: CacheWrapOptions = {}): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached != null) return cached;

    const lockProvider = options.lockProvider;
    const lockTtlMs = options.lockTtlMs ?? 15000;

    if (lockProvider) {
      const unlock = await lockProvider.acquire(this.formatKey(key), lockTtlMs);
      try {
        const loaded = await loader();
        await this.set(key, loaded, options);
        return loaded;
      } finally {
        await unlock();
      }
    }

    const loaded = await loader();
    await this.set(key, loaded, options);
    return loaded;
  }

  /** Expose cache driver for advanced use cases. */
  getDriver(): CacheDriver {
    return this.driver;
  }

  private formatKey(key: string): string {
    if (!this.prefix) return key;
    return `${this.prefix}${key}`;
  }
}
