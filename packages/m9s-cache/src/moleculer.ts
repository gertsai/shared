// SPDX-License-Identifier: Apache-2.0
/**
 * Moleculer integration subpath. Lazy-loads moleculer at construction time.
 * Root barrel (./) does NOT import this — keeps moleculer optional-peer
 * (Wave 12.B-fix-1 per EVID-044 CRIT-1).
 */

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
export type {
  MoleculerContext,
  MoleculerCachedAction,
  MoleculerCacheOptions,
  CacheLockOptions,
  NormalizedCacheOptions,
} from './types.js';
