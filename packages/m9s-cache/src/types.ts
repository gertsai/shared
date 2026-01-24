/**
 * Cache payload type stored in drivers.
 */
export type CachePayload = string | Buffer;

/**
 * Low-level driver interface for cache backends.
 */
export interface CacheDriver {
  /** Get raw cached payload by key. */
  get(key: string): Promise<CachePayload | null>;
  /** Set raw cached payload by key with optional TTL in seconds. */
  set(key: string, value: CachePayload, ttlSeconds?: number): Promise<void>;
  /** Delete one or more keys. Returns number of deleted keys. */
  del(keys: string | string[]): Promise<number>;
  /** Multi-get raw payloads by keys. */
  mget(keys: string[]): Promise<Array<CachePayload | null>>;
  /** Multi-set raw payloads by key-value pairs. */
  mset(entries: Array<[string, CachePayload]>): Promise<void>;
  /** Hash set fields (Redis HSET/HMSET). */
  hset?(key: string, entries: Record<string, CachePayload>): Promise<void>;
  /** Hash get field (Redis HGET). */
  hget?(key: string, field: string): Promise<CachePayload | null>;
  /** Hash get all fields (Redis HGETALL). */
  hgetall?(key: string): Promise<Record<string, CachePayload> | null>;
  /** List keys by pattern. */
  keys(pattern: string): Promise<string[]>;
  /** Check if key exists. */
  exists(key: string): Promise<boolean>;
  /** Update TTL of key in seconds. */
  expire(key: string, ttlSeconds: number): Promise<void>;
  /** Return TTL in seconds (-1 no expiry, -2 missing). */
  ttl?(key: string): Promise<number>;
  /** Close underlying connections if needed. */
  quit?(): Promise<void>;
}

/**
 * Serializer for cache entries.
 */
export interface CacheSerializer {
  /** Serialize value into cache payload. */
  serialize(value: unknown): CachePayload;
  /** Deserialize cache payload into value. */
  deserialize<T>(payload: CachePayload): T;
}

/**
 * Cache store configuration.
 */
export interface CacheStoreOptions {
  /** Cache driver implementation. */
  driver: CacheDriver;
  /** Optional serializer. Defaults to JSON. */
  serializer?: CacheSerializer;
  /** Prefix for all cache keys. */
  prefix?: string;
  /** Default TTL in seconds. */
  defaultTTLSeconds?: number | null;
}

/**
 * Options for setting cache values.
 */
export interface CacheSetOptions {
  /** Time-to-live in seconds. */
  ttlSeconds?: number | null;
}

/**
 * Options for cache-aside wrap.
 */
export interface CacheWrapOptions extends CacheSetOptions {
  /** Optional lock provider to avoid cache stampede. */
  lockProvider?: CacheLockProvider;
  /** Lock TTL in milliseconds. */
  lockTtlMs?: number;
}

/**
 * Cache lock provider contract.
 */
export interface CacheLockProvider {
  /** Acquire lock, resolve unlock function. */
  acquire(key: string, ttlMs: number): Promise<() => Promise<void> | void>;
  /** Try to acquire lock, resolve unlock function if acquired. */
  tryAcquire(key: string, ttlMs: number): Promise<(() => Promise<void> | void) | null>;
}

/**
 * Tag generation configuration.
 */
export interface CacheTagConfig {
  /** Tag namespace name. */
  name: string;
  /** Path to items (supports '*' wildcard). */
  path: string[];
  /** Field name for ID. */
  idField: string;
  /** Optional field name for timestamp. */
  timestampField?: string;
}

/**
 * Action-level cache options for Moleculer integration.
 */
export interface MoleculerCacheOptions {
  enabled?: boolean | ((ctx: unknown) => boolean);
  ttl?: number;
  keys?: string[];
  lock?: {
    enabled?: boolean;
    /** Lock TTL in milliseconds. */
    ttl?: number;
  };
  tags?: CacheTagConfig[];
}

/**
 * Envelope stored in cache for tagged entries.
 */
export interface CacheEnvelope<T = unknown> {
  data: T;
  tags?: Record<string, number>;
  created_at: number;
}
