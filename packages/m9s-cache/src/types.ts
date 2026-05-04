/**
 * @module @gertsai/m9s-cache/types
 * Advanced type definitions for cache system with branded types and generics.
 */

// ============================================================================
// Branded Types for Type-Safe Cache Keys
// ============================================================================

declare const CacheKeyBrand: unique symbol;

/**
 * Branded type for validated cache keys.
 * Ensures keys are validated before use.
 */
export type CacheKey = string & { readonly [CacheKeyBrand]: 'CacheKey' };

/**
 * Cache key validation options.
 */
export interface CacheKeyValidationOptions {
  /** Maximum key length (default: 250 for Redis compatibility). */
  maxLength?: number;
  /** Allowed characters pattern (default: alphanumeric + common separators). */
  pattern?: RegExp;
  /** Whether to allow empty keys (default: false). */
  allowEmpty?: boolean;
}

/**
 * Default key validation pattern.
 * Allows: a-z, A-Z, 0-9, :, -, _, ., |, {, }, [, ]
 */
export const DEFAULT_KEY_PATTERN = /^[\w:.\-|{}[\]]+$/;

/**
 * Validate and create a branded cache key.
 * @throws Error if key is invalid
 */
export function validateCacheKey(key: string, options: CacheKeyValidationOptions = {}): CacheKey {
  const { maxLength = 250, pattern = DEFAULT_KEY_PATTERN, allowEmpty = false } = options;

  if (!allowEmpty && !key) {
    throw new CacheKeyError('Cache key cannot be empty');
  }

  if (key.length > maxLength) {
    throw new CacheKeyError(`Cache key exceeds maximum length of ${maxLength}: ${key.length}`);
  }

  if (!pattern.test(key)) {
    throw new CacheKeyError(
      `Cache key contains invalid characters: "${key}". Allowed pattern: ${pattern}`,
    );
  }

  // Check for path traversal attempts
  if (key.includes('..') || key.includes('//')) {
    throw new CacheKeyError(`Cache key contains potentially dangerous patterns: "${key}"`);
  }

  return key as CacheKey;
}

/**
 * Check if a string is a valid cache key without throwing.
 */
export function isCacheKey(key: string, options?: CacheKeyValidationOptions): key is CacheKey {
  try {
    validateCacheKey(key, options);
    return true;
  } catch {
    return false;
  }
}

/**
 * Create a cache key from parts (auto-validates).
 */
export function createCacheKey(...parts: (string | number)[]): CacheKey {
  const key = parts.filter((p) => p != null && p !== '').join(':');
  return validateCacheKey(key);
}

/**
 * Cache key validation error.
 */
export class CacheKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CacheKeyError';
  }
}

// ============================================================================
// Core Cache Types
// ============================================================================

/**
 * Cache payload type stored in drivers.
 */
export type CachePayload = string | Buffer;

/**
 * Serializable value constraint.
 * Values must be JSON-serializable or have custom serialization.
 */
export type Serializable =
  | string
  | number
  | boolean
  | null
  | undefined
  | Serializable[]
  | { [key: string]: Serializable }
  | Date;

// ============================================================================
// Driver Interface with Generics
// ============================================================================

/**
 * Low-level driver interface for cache backends.
 * Operates on raw payloads (serialized data).
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

  /** Check if driver supports atomic operations. */
  readonly supportsAtomic?: boolean;

  /** Check if driver supports hash operations. */
  readonly supportsHash?: boolean;

  /**
   * Atomically set values only if they are newer (compare-and-set).
   * Used for TOCTOU-safe tag updates.
   *
   * For each entry: if current value is null OR current < new, set new value.
   * This prevents race conditions in concurrent tag updates.
   *
   * @param entries - Array of [key, numericValue] pairs
   * @returns Number of keys actually updated
   */
  setIfNewer?(entries: Array<[string, number]>): Promise<number>;
}

// ============================================================================
// Serializer with Type Safety
// ============================================================================

/**
 * Type-safe serializer interface.
 * The generic T ensures type consistency between serialize and deserialize.
 */
export interface CacheSerializer<T = unknown> {
  /** Serialize value into cache payload. */
  serialize(value: T): CachePayload;

  /** Deserialize cache payload into value. */
  deserialize(payload: CachePayload): T;
}

/**
 * Generic serializer that can handle any serializable type.
 */
export interface GenericCacheSerializer {
  /** Serialize any value into cache payload. */
  serialize<T>(value: T): CachePayload;

  /** Deserialize cache payload into specified type. */
  deserialize<T>(payload: CachePayload): T;
}

// ============================================================================
// Cache Store Options
// ============================================================================

/**
 * Cache store configuration.
 */
export interface CacheStoreOptions {
  /** Cache driver implementation. */
  driver: CacheDriver;

  /** Optional serializer. Defaults to JSON. */
  serializer?: GenericCacheSerializer;

  /** Prefix for all cache keys. */
  prefix?: string;

  /** Default TTL in seconds. */
  defaultTTLSeconds?: number | null;

  /** Whether to validate keys (default: true in development). */
  validateKeys?: boolean;

  /** Key validation options. */
  keyValidation?: CacheKeyValidationOptions;
}

/**
 * Options for setting cache values.
 */
export interface CacheSetOptions {
  /** Time-to-live in seconds. null = no expiry, undefined = use default. */
  ttlSeconds?: number | null;
}

/**
 * Options for cache-aside wrap.
 */
export interface CacheWrapOptions extends CacheSetOptions {
  /** Optional lock provider to avoid cache stampede. */
  lockProvider?: CacheLockProvider;

  /** Lock TTL in milliseconds (default: 15000). */
  lockTtlMs?: number;

  /** Whether to use double-check locking (default: true). */
  doubleCheck?: boolean;
}

// ============================================================================
// Cache Operation Results (Discriminated Unions)
// ============================================================================

/**
 * Result of a cache get operation.
 */
export type CacheGetResult<T> =
  | { found: true; value: T; ttl?: number }
  | { found: false; value: null; ttl?: never };

/**
 * Result of a cache wrap operation.
 */
export type CacheWrapResult<T> =
  | { source: 'cache'; value: T }
  | { source: 'loader'; value: T; cached: boolean };

// ============================================================================
// Lock Provider
// ============================================================================

/**
 * Cache lock provider contract.
 */
export interface CacheLockProvider {
  /**
   * Acquire lock, resolve unlock function.
   * Blocks until lock is acquired or timeout.
   */
  acquire(key: string, ttlMs: number): Promise<UnlockFunction>;

  /**
   * Try to acquire lock, resolve unlock function if acquired.
   * Returns null immediately if lock cannot be acquired.
   */
  tryAcquire(key: string, ttlMs: number): Promise<UnlockFunction | null>;
}

/**
 * Function to release a lock.
 */
export type UnlockFunction = () => Promise<void> | void;

// ============================================================================
// Tag Configuration with Path Types
// ============================================================================

/**
 * Path segment for tag extraction.
 * '*' indicates array iteration.
 */
export type PathSegment = string | '*';

/**
 * Tag generation configuration.
 */
export interface CacheTagConfig {
  /** Tag namespace name. */
  name: string;

  /** Path to items (supports '*' wildcard for array iteration). */
  path: PathSegment[];

  /** Field name for ID extraction. */
  idField: string;

  /** Optional field name for timestamp (version). */
  timestampField?: string;
}

/**
 * Tag with version information.
 */
export interface CacheTag {
  /** Tag name in format "namespace:id". */
  name: string;

  /** Version timestamp (milliseconds). */
  version: number;
}

/**
 * Map of tag names to version timestamps.
 */
export type TagVersionMap = Record<string, number>;

// ============================================================================
// Moleculer Integration Types
// ============================================================================

/**
 * Moleculer context interface (minimal required).
 */
export interface MoleculerContext<
  TParams = Record<string, unknown>,
  TMeta = Record<string, unknown>,
> {
  params: TParams;
  meta: TMeta & {
    $cache?: boolean;
  };
  service?: {
    name: string;
    version?: string | number;
  };
  action?: {
    name: string;
  };
  cachedResult?: boolean;
}

/**
 * Moleculer action with cache options.
 */
export interface MoleculerCachedAction {
  name: string;
  cache?: boolean | MoleculerCacheOptions;
  handler?: (ctx: MoleculerContext) => Promise<unknown>;
}

/**
 * Action-level cache options for Moleculer integration.
 */
export interface MoleculerCacheOptions {
  /** Enable/disable caching. Can be a function for dynamic control. */
  enabled?: boolean | ((ctx: MoleculerContext) => boolean);

  /** TTL in seconds. */
  ttl?: number;

  /** Parameter names to include in cache key. */
  keys?: string[];

  /** Lock configuration for stampede prevention. */
  lock?: CacheLockOptions;

  /** Tag configurations for invalidation. */
  tags?: CacheTagConfig[];
}

/**
 * Cache lock options.
 */
export interface CacheLockOptions {
  /** Whether locking is enabled. */
  enabled?: boolean;

  /** Lock TTL in milliseconds. */
  ttl?: number;
}

/**
 * Normalized cache options (internal use).
 */
export interface NormalizedCacheOptions {
  enabled: boolean | ((ctx: MoleculerContext) => boolean);
  ttl?: number;
  keys?: string[];
  tags?: CacheTagConfig[];
  lock: Required<CacheLockOptions>;
}

// ============================================================================
// Cache Envelope for Tagged Entries
// ============================================================================

/**
 * Envelope stored in cache for tagged entries.
 * Generic T preserves the cached data type.
 */
export interface CacheEnvelope<T = unknown> {
  /** The cached data. */
  data: T;

  /** Tag versions at time of caching. */
  tags?: TagVersionMap;

  /** Timestamp when entry was created. */
  created_at: number;
}

/**
 * Type guard for CacheEnvelope.
 */
export function isCacheEnvelope<T>(value: unknown): value is CacheEnvelope<T> {
  if (typeof value !== 'object' || value === null) return false;
  const envelope = value as Record<string, unknown>;
  return 'data' in envelope && 'created_at' in envelope && typeof envelope.created_at === 'number';
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Extract the value type from a cache operation.
 */
export type CacheValueType<T> = T extends CacheEnvelope<infer U> ? U : T;

/**
 * Make specific properties required.
 */
export type RequiredProps<T, K extends keyof T> = T & Required<Pick<T, K>>;

/**
 * Deep partial type.
 */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/**
 * Extract ID type from an entity.
 */
export type EntityId = string | number;

/**
 * Entity with ID field.
 */
export interface Identifiable<TId extends EntityId = EntityId> {
  id: TId;
}

/**
 * Entity with timestamp.
 */
export interface Timestamped {
  updatedAt?: Date | number | string;
  updated_at?: Date | number | string;
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Base cache error.
 */
export class CacheError extends Error {
  constructor(
    message: string,
    public readonly code: CacheErrorCode,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = 'CacheError';
  }
}

/**
 * Cache error codes.
 */
export enum CacheErrorCode {
  SERIALIZATION_FAILED = 'SERIALIZATION_FAILED',
  DESERIALIZATION_FAILED = 'DESERIALIZATION_FAILED',
  CONNECTION_FAILED = 'CONNECTION_FAILED',
  OPERATION_TIMEOUT = 'OPERATION_TIMEOUT',
  LOCK_FAILED = 'LOCK_FAILED',
  KEY_INVALID = 'KEY_INVALID',
  DRIVER_ERROR = 'DRIVER_ERROR',
}

/**
 * Create a cache error with cause.
 */
export function createCacheError(
  message: string,
  code: CacheErrorCode,
  cause?: unknown,
): CacheError {
  const error = cause instanceof Error ? cause : undefined;
  return new CacheError(message, code, error);
}

// ============================================================================
// TTL Validation
// ============================================================================

/**
 * Maximum TTL in seconds (1 year).
 */
export const MAX_TTL_SECONDS = 365 * 24 * 60 * 60;

/**
 * Minimum TTL in seconds.
 */
export const MIN_TTL_SECONDS = 1;

/**
 * TTL validation options.
 */
export interface TTLValidationOptions {
  /** Maximum allowed TTL in seconds (default: 1 year). */
  maxTtl?: number;
  /** Minimum allowed TTL in seconds (default: 1). */
  minTtl?: number;
  /** Whether to allow null/undefined TTL (default: true). */
  allowNoExpiry?: boolean;
}

/**
 * Validate TTL value.
 * @throws CacheError if TTL is invalid.
 */
export function validateTTL(
  ttlSeconds: number | null | undefined,
  options: TTLValidationOptions = {},
): void {
  const { maxTtl = MAX_TTL_SECONDS, minTtl = MIN_TTL_SECONDS, allowNoExpiry = true } = options;

  // null/undefined means no expiry
  if (ttlSeconds == null) {
    if (!allowNoExpiry) {
      throw new CacheError('TTL is required', CacheErrorCode.KEY_INVALID);
    }
    return;
  }

  // Must be a number
  if (typeof ttlSeconds !== 'number' || !Number.isFinite(ttlSeconds)) {
    throw new CacheError('Invalid TTL: must be a finite number', CacheErrorCode.KEY_INVALID);
  }

  // Must be positive
  if (ttlSeconds <= 0) {
    throw new CacheError(
      `Invalid TTL: must be positive (got ${ttlSeconds})`,
      CacheErrorCode.KEY_INVALID,
    );
  }

  // Check minimum
  if (ttlSeconds < minTtl) {
    throw new CacheError(
      `TTL too short: minimum is ${minTtl} seconds (got ${ttlSeconds})`,
      CacheErrorCode.KEY_INVALID,
    );
  }

  // Check maximum
  if (ttlSeconds > maxTtl) {
    throw new CacheError(
      `TTL too long: maximum is ${maxTtl} seconds (got ${ttlSeconds})`,
      CacheErrorCode.KEY_INVALID,
    );
  }
}
