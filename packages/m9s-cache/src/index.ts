// Core
export { CacheStore } from './cache-store.js';

// Serializers
export {
  JsonSerializer,
  TypedSerializer,
  BinarySerializer,
  PassthroughSerializer,
} from './serializers.js';

// Drivers
export { MemoryCacheDriver } from './memory-driver.js';
export type { MemoryCacheDriverOptions } from './memory-driver.js';
export { RedisCacheDriver } from './redis-driver.js';
export type { RedisCacheDriverOptions, RedisLike } from './redis-driver.js';

// Lock Providers
export { NoopLockProvider, RedlockLockProvider } from './lock-provider.js';
export type { RedlockProviderOptions } from './lock-provider.js';

// Moleculer Integration
export { M9sCacheCacher } from './moleculer-cacher.js';
export type { M9sCacheCacherOptions } from './moleculer-cacher.js';
export { moleculerDbCacheMixin } from './moleculer-db-mixin.js';
export type {
  MoleculerDbModel,
  CacheableEntity,
  CacheEnabledService,
  CacheEnabledBroker,
  EntityEventType,
  EntityChangedHandler,
} from './moleculer-db-mixin.js';

// Tag Utilities
export { generateTags } from './tag-utils.js';

// Types - Core
export type {
  CachePayload,
  Serializable,
  CacheDriver,
  CacheSerializer,
  GenericCacheSerializer,
  CacheStoreOptions,
  CacheSetOptions,
  CacheWrapOptions,
  CacheGetResult,
  CacheWrapResult,
} from './types.js';

// Types - Keys
export type { CacheKey, CacheKeyValidationOptions } from './types.js';
export {
  validateCacheKey,
  isCacheKey,
  createCacheKey,
  CacheKeyError,
  DEFAULT_KEY_PATTERN,
} from './types.js';

// Types - Locking
export type { CacheLockProvider, UnlockFunction } from './types.js';

// Types - Tags
export type { PathSegment, CacheTagConfig, CacheTag, TagVersionMap } from './types.js';

// Types - Moleculer
export type {
  MoleculerContext,
  MoleculerCachedAction,
  MoleculerCacheOptions,
  CacheLockOptions,
  NormalizedCacheOptions,
} from './types.js';

// Types - Envelope
export type { CacheEnvelope } from './types.js';
export { isCacheEnvelope } from './types.js';

// Types - Utility
export type {
  CacheValueType,
  RequiredProps,
  DeepPartial,
  EntityId,
  Identifiable,
  Timestamped,
} from './types.js';

// Types - Errors
export { CacheError, CacheErrorCode, createCacheError } from './types.js';

// Types - TTL Validation
export type { TTLValidationOptions } from './types.js';
export { MAX_TTL_SECONDS, MIN_TTL_SECONDS, validateTTL } from './types.js';
