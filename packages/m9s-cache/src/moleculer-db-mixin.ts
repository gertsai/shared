import type { ServiceSchema } from 'moleculer';

export interface MoleculerDbModel {
  name: string;
}

/**
 * Moleculer DB mixin that wires cache tags for standard actions.
 */
export const moleculerDbCacheMixin = (model: MoleculerDbModel): ServiceSchema => ({
  actions: {
    find: {
      cache: {
        tags: [
          {
            name: model.name,
            path: ['*'],
            idField: 'id',
          },
        ],
      },
    },
    count: {
      cache: true,
    },
    list: {
      cache: {
        tags: [
          {
            name: model.name,
            path: ['rows', '*'],
            idField: 'id',
          },
        ],
      },
    },
    create: {
      cache: false,
    },
    insert: {
      cache: false,
    },
    get: {
      cache: {
        tags: [
          {
            name: model.name,
            path: ['*'],
            idField: 'id',
          },
        ],
      },
    },
    update: {
      cache: false,
    },
    remove: {
      cache: false,
    },
  },
  methods: {
    /**
     * Clear cache & call entity lifecycle hooks.
     */
    async entityChanged(
      type: string,
      json: { id: string | number } | Array<{ id: string | number }>,
      ctx: unknown,
    ) {
      if (type === 'created') {
        await (this as any).clearCache();
      } else {
        const ids = ([] as Array<{ id: string | number }>)
          .concat(json as any)
          .map((item) => item.id);
        const tags: Record<string, number> = {};

        ids.forEach((id) => {
          tags[`${(this as any).model.name}:${id}`] = Date.now();
        });

        if ((this as any).broker?.cacher?.setTags) {
          await (this as any).broker.cacher.setTags(tags);
        }
      }

      const eventName = `entity${type.charAt(0).toUpperCase()}${type.slice(1)}`;
      if ((this as any).schema?.[eventName]) {
        return (this as any).schema[eventName].call(this, json, ctx);
      }
    },

    /**
     * Clear cached entities for this service.
     */
    async clearCache() {
      const eventType = (this as any).settings?.cacheCleanEventType;
      if (eventType && typeof (this as any).broker?.[eventType] === 'function') {
        (this as any).broker[eventType](`cache.clean.${(this as any).fullName}`);
      }
      if ((this as any).broker?.cacher) {
        return (this as any).broker.cacher.clean(`${(this as any).fullName}.**`);
      }
      return Promise.resolve();
    },
  },
});
