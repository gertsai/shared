import type { ServiceSchema, Context, Service } from 'moleculer';
import type { EntityId, Identifiable, TagVersionMap, CacheTagConfig } from './types.js';

/**
 * Partial service schema for mixin usage.
 * Mixins don't need 'name' property as they merge with the main schema.
 */
export type ServiceMixinSchema = Omit<ServiceSchema, 'name'>;

/**
 * Model definition for cache mixin.
 */
export interface MoleculerDbModel {
  /** Model name (used as tag prefix). */
  name: string;
}

/**
 * Entity with ID field (generic).
 */
export type CacheableEntity<TId extends EntityId = EntityId> = Identifiable<TId>;

/**
 * Cache-enabled service interface.
 * Uses intersection to avoid conflicting with base Service types.
 */
export interface CacheEnabledService extends Omit<Service, 'settings'> {
  model: MoleculerDbModel;
  settings?: Record<string, unknown> & {
    cacheCleanEventType?: 'emit' | 'broadcast';
  };
}

/**
 * Cacher interface (minimal required for tag-based invalidation).
 */
export interface MoleculerCacher {
  setTags(tags: TagVersionMap): Promise<void>;
  clean(pattern: string): Promise<number>;
}

/**
 * Broker with optional cacher.
 * Uses intersection to keep ServiceBroker compatibility.
 */
export interface CacheEnabledBroker {
  cacher?: MoleculerCacher;
  emit?: (event: string) => void;
  broadcast?: (event: string) => void;
}

/**
 * Extended cache options with tags support.
 * Used in action schema for tag-based invalidation.
 */
export interface ExtendedCacheOptions {
  tags?: CacheTagConfig[];
}

/**
 * Entity lifecycle event types.
 */
export type EntityEventType = 'created' | 'updated' | 'removed';

/**
 * Entity changed handler signature.
 */
export type EntityChangedHandler<T extends CacheableEntity = CacheableEntity> = (
  type: EntityEventType,
  json: T | T[],
  ctx: Context,
) => Promise<void>;

/**
 * Moleculer DB mixin that wires cache tags for standard CRUD actions.
 *
 * Features:
 * - Auto-configures cache tags for find/get/list actions
 * - Disables cache for mutation actions (create/update/remove)
 * - Provides entityChanged lifecycle hook for cache invalidation
 * - Supports clearCache method for bulk invalidation
 *
 * @example
 * ```typescript
 * import { moleculerDbCacheMixin } from '@gertsai/m9s-cache';
 *
 * export default {
 *   name: 'users',
 *   mixins: [moleculerDbCacheMixin({ name: 'User' })],
 *   // ...
 * } satisfies ServiceSchema;
 * ```
 */
export function moleculerDbCacheMixin<TId extends EntityId = EntityId>(
  model: MoleculerDbModel,
): ServiceMixinSchema {
  // Tag configurations for cache-based actions
  // These are processed by M9sCacheCacher middleware, not standard Moleculer cacher
  const findTags: CacheTagConfig[] = [
    {
      name: model.name,
      path: ['*'],
      idField: 'id',
    },
  ];

  const listTags: CacheTagConfig[] = [
    {
      name: model.name,
      path: ['rows', '*'],
      idField: 'id',
    },
  ];

  const getTags: CacheTagConfig[] = [
    {
      name: model.name,
      path: [],
      idField: 'id',
    },
  ];

  return {
    /**
     * Action cache configurations.
     * Note: 'tags' property is processed by M9sCacheCacher middleware.
     * Type assertions are used because standard Moleculer types don't include 'tags'.
     */
    actions: {
      /**
       * Find action - cached with entity tags.
       */
      find: {
        cache: { tags: findTags } as unknown as boolean,
      },

      /**
       * Count action - simple cache (no tags needed).
       */
      count: {
        cache: true,
      },

      /**
       * List action - cached with nested rows tags.
       */
      list: {
        cache: { tags: listTags } as unknown as boolean,
      },

      /**
       * Create action - no cache (mutation).
       */
      create: {
        cache: false,
      },

      /**
       * Insert action - no cache (mutation).
       */
      insert: {
        cache: false,
      },

      /**
       * Get action - cached with entity tag.
       */
      get: {
        cache: { tags: getTags } as unknown as boolean,
      },

      /**
       * Update action - no cache (mutation).
       */
      update: {
        cache: false,
      },

      /**
       * Remove action - no cache (mutation).
       */
      remove: {
        cache: false,
      },
    },

    methods: {
      /**
       * Clear cache and call entity lifecycle hooks.
       *
       * Called after entity mutations to invalidate related caches.
       * - For 'created': clears entire service cache (new entity affects list queries)
       * - For 'updated'/'removed': updates specific entity tags
       *
       * @param type - Event type ('created', 'updated', 'removed')
       * @param json - Entity or array of entities
       * @param ctx - Moleculer context
       */
      async entityChanged(
        this: CacheEnabledService,
        type: EntityEventType,
        json: CacheableEntity<TId> | Array<CacheableEntity<TId>>,
        ctx: Context,
      ): Promise<void> {
        const broker = this.broker as CacheEnabledBroker;

        if (type === 'created') {
          // New entity - clear all cached lists
          await this.clearCache();
        } else {
          // Update/remove - invalidate specific entity tags
          const entities = Array.isArray(json) ? json : [json];
          const tags: TagVersionMap = {};
          const now = Date.now();

          for (const entity of entities) {
            if (entity.id != null) {
              tags[`${this.model.name}:${entity.id}`] = now;
            }
          }

          if (Object.keys(tags).length > 0 && broker.cacher?.setTags) {
            await broker.cacher.setTags(tags);
          }
        }

        // Call optional lifecycle hook defined in service schema
        const eventName = `entity${capitalize(type)}` as keyof ServiceSchema;
        const handler = this.schema?.[eventName];

        if (typeof handler === 'function') {
          await (handler as EntityChangedHandler<CacheableEntity<TId>>).call(this, type, json, ctx);
        }
      },

      /**
       * Clear all cached entries for this service.
       *
       * Optionally broadcasts a cache clean event for distributed setups.
       */
      async clearCache(this: CacheEnabledService): Promise<void> {
        const broker = this.broker as CacheEnabledBroker;
        const eventType = this.settings?.cacheCleanEventType;

        // Broadcast cache clean event if configured
        if (eventType && typeof broker[eventType] === 'function') {
          const emitFn = broker[eventType] as (event: string) => void;
          emitFn(`cache.clean.${this.fullName}`);
        }

        // Clean cache entries
        if (broker.cacher) {
          await broker.cacher.clean(`${this.fullName}.**`);
        }
      },
    },
  };
}

/**
 * Capitalize first letter of string.
 */
function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Legacy export for backwards compatibility.
 * @deprecated Use moleculerDbCacheMixin function instead.
 */
export { moleculerDbCacheMixin as default };
