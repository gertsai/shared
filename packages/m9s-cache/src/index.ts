// SPDX-License-Identifier: Apache-2.0
/**
 * @gertsai/m9s-cache — root barrel.
 *
 * Backend-agnostic surface only. Moleculer-coupled symbols live under
 * `@gertsai/m9s-cache/moleculer`; ioredis/Redlock-coupled symbols live under
 * `@gertsai/m9s-cache/redis`. This split keeps `import { CacheStore } from
 * '@gertsai/m9s-cache'` free of external peer-dep type leaks
 * (Wave 12.B-fix-1 per EVID-044 CRIT-1).
 */

// Core
export { CacheStore } from './cache-store.js';

// Serializers
export {
  JsonSerializer,
  TypedSerializer,
  BinarySerializer,
  PassthroughSerializer,
} from './serializers.js';

// Drivers — only the backend-agnostic in-memory implementation lives here.
// RedisCacheDriver moved to '@gertsai/m9s-cache/redis'.
export { MemoryCacheDriver } from './memory-driver.js';
export type { MemoryCacheDriverOptions } from './memory-driver.js';

// Lock Providers — only the backend-agnostic Noop variant lives here.
// RedlockLockProvider moved to '@gertsai/m9s-cache/redis'.
export { NoopLockProvider } from './lock-provider.js';

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
