import { describe, expect, it } from 'vitest';
import { moleculerDbCacheMixin } from './moleculer-db-mixin';

describe('moleculerDbCacheMixin', () => {
  it('creates cache config for common actions', () => {
    const mixin = moleculerDbCacheMixin({ name: 'User' });

    expect(mixin.actions.find.cache.tags[0].name).toBe('User');
    expect(mixin.actions.list.cache.tags[0].name).toBe('User');
    expect(mixin.actions.get.cache.tags[0].name).toBe('User');
    expect(mixin.actions.create.cache).toBe(false);
  });
});
