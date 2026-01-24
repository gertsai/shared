/**
 * Tests for Permission Cache (B3.3: Event-Driven Invalidation)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  PermissionCache,
  getPermissionCache,
  resetPermissionCache,
  createInvalidationHandler,
  INVALIDATION_EVENTS,
} from '../cache/index.js';

describe('PermissionCache', () => {
  let cache: PermissionCache;

  beforeEach(() => {
    cache = new PermissionCache({ maxSize: 100, ttlMs: 1000 });
  });

  describe('get/set', () => {
    it('should cache and retrieve permission results', () => {
      const key = {
        userId: 'user-1',
        relation: 'can_view',
        resourceType: 'project' as const,
        resourceId: 'proj-1',
      };
      const value = { allowed: true };

      cache.set(key, value);
      const result = cache.get(key);

      expect(result).toEqual(value);
    });

    it('should return null for cache miss', () => {
      const key = {
        userId: 'user-1',
        relation: 'can_view',
        resourceType: 'project' as const,
        resourceId: 'proj-1',
      };

      const result = cache.get(key);

      expect(result).toBeNull();
    });

    it('should not cache when disabled', () => {
      cache.setEnabled(false);

      const key = {
        userId: 'user-1',
        relation: 'can_view',
        resourceType: 'project' as const,
        resourceId: 'proj-1',
      };

      cache.set(key, { allowed: true });
      const result = cache.get(key);

      expect(result).toBeNull();
    });
  });

  describe('TTL expiration', () => {
    it('should expire entries after TTL', async () => {
      const shortTtlCache = new PermissionCache({ ttlMs: 50 });

      const key = {
        userId: 'user-1',
        relation: 'can_view',
        resourceType: 'project' as const,
        resourceId: 'proj-1',
      };

      shortTtlCache.set(key, { allowed: true });

      // Wait for TTL to expire
      await new Promise((resolve) => setTimeout(resolve, 100));

      const result = shortTtlCache.get(key);
      expect(result).toBeNull();
    });
  });

  describe('LRU eviction', () => {
    it('should evict oldest entry when at max size', () => {
      const smallCache = new PermissionCache({ maxSize: 2 });

      const key1 = {
        userId: 'user-1',
        relation: 'can_view',
        resourceType: 'project' as const,
        resourceId: 'proj-1',
      };
      const key2 = {
        userId: 'user-2',
        relation: 'can_view',
        resourceType: 'project' as const,
        resourceId: 'proj-1',
      };
      const key3 = {
        userId: 'user-3',
        relation: 'can_view',
        resourceType: 'project' as const,
        resourceId: 'proj-1',
      };

      smallCache.set(key1, { allowed: true });
      smallCache.set(key2, { allowed: true });
      smallCache.set(key3, { allowed: true });

      // key1 should be evicted
      expect(smallCache.get(key1)).toBeNull();
      expect(smallCache.get(key2)).not.toBeNull();
      expect(smallCache.get(key3)).not.toBeNull();
    });
  });

  describe('invalidate', () => {
    beforeEach(() => {
      // Pre-populate cache
      cache.set(
        { userId: 'user-1', relation: 'can_view', resourceType: 'project', resourceId: 'proj-1' },
        { allowed: true },
      );
      cache.set(
        { userId: 'user-1', relation: 'can_edit', resourceType: 'project', resourceId: 'proj-1' },
        { allowed: false },
      );
      cache.set(
        { userId: 'user-2', relation: 'can_view', resourceType: 'project', resourceId: 'proj-1' },
        { allowed: true },
      );
      cache.set(
        { userId: 'user-1', relation: 'can_view', resourceType: 'project', resourceId: 'proj-2' },
        { allowed: true },
      );
    });

    it('should invalidate by user', () => {
      const count = cache.invalidate({ userId: 'user-1' });

      expect(count).toBe(3);
      expect(cache.size).toBe(1);
    });

    it('should invalidate by resource', () => {
      const count = cache.invalidate({ resourceType: 'project', resourceId: 'proj-1' });

      expect(count).toBe(3);
      expect(cache.size).toBe(1);
    });

    it('should invalidate by relation', () => {
      const count = cache.invalidate({ relation: 'can_view' });

      expect(count).toBe(3);
      expect(cache.size).toBe(1);
    });

    it('should invalidate with multiple filters', () => {
      const count = cache.invalidate({ userId: 'user-1', relation: 'can_view' });

      expect(count).toBe(2);
      expect(cache.size).toBe(2);
    });
  });

  describe('invalidateUser', () => {
    it('should invalidate all entries for a user', () => {
      cache.set(
        { userId: 'user-1', relation: 'can_view', resourceType: 'project', resourceId: 'proj-1' },
        { allowed: true },
      );
      cache.set(
        { userId: 'user-1', relation: 'can_edit', resourceType: 'project', resourceId: 'proj-2' },
        { allowed: true },
      );
      cache.set(
        { userId: 'user-2', relation: 'can_view', resourceType: 'project', resourceId: 'proj-1' },
        { allowed: true },
      );

      const count = cache.invalidateUser('user-1');

      expect(count).toBe(2);
      expect(cache.size).toBe(1);
    });
  });

  describe('invalidateResource', () => {
    it('should invalidate all entries for a resource', () => {
      cache.set(
        { userId: 'user-1', relation: 'can_view', resourceType: 'project', resourceId: 'proj-1' },
        { allowed: true },
      );
      cache.set(
        { userId: 'user-2', relation: 'can_view', resourceType: 'project', resourceId: 'proj-1' },
        { allowed: true },
      );
      cache.set(
        { userId: 'user-1', relation: 'can_view', resourceType: 'project', resourceId: 'proj-2' },
        { allowed: true },
      );

      const count = cache.invalidateResource('project', 'proj-1');

      expect(count).toBe(2);
      expect(cache.size).toBe(1);
    });
  });

  describe('statistics', () => {
    it('should track cache statistics', () => {
      const key = {
        userId: 'user-1',
        relation: 'can_view',
        resourceType: 'project' as const,
        resourceId: 'proj-1',
      };

      // Miss
      cache.get(key);

      // Set and hit
      cache.set(key, { allowed: true });
      cache.get(key);
      cache.get(key);

      const stats = cache.getStats();

      expect(stats.misses).toBe(1);
      expect(stats.hits).toBe(2);
      expect(stats.hitRate).toBeCloseTo(0.666, 2);
    });

    it('should reset statistics', () => {
      cache.get({
        userId: 'user-1',
        relation: 'can_view',
        resourceType: 'project',
        resourceId: 'proj-1',
      });

      cache.resetStats();
      const stats = cache.getStats();

      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
    });
  });

  describe('clear', () => {
    it('should clear all entries', () => {
      cache.set(
        { userId: 'user-1', relation: 'can_view', resourceType: 'project', resourceId: 'proj-1' },
        { allowed: true },
      );
      cache.set(
        { userId: 'user-2', relation: 'can_view', resourceType: 'project', resourceId: 'proj-1' },
        { allowed: true },
      );

      cache.clear();

      expect(cache.size).toBe(0);
    });
  });
});

describe('Permission Cache Singleton', () => {
  beforeEach(() => {
    resetPermissionCache();
  });

  it('should return same instance', () => {
    const cache1 = getPermissionCache();
    const cache2 = getPermissionCache();

    expect(cache1).toBe(cache2);
  });
});

describe('createInvalidationHandler', () => {
  beforeEach(() => {
    resetPermissionCache();
    const cache = getPermissionCache();
    cache.set(
      { userId: 'user-1', relation: 'viewer', resourceType: 'project', resourceId: 'proj-1' },
      { allowed: true },
    );
  });

  it('should create handler that invalidates cache', () => {
    const handler = createInvalidationHandler();
    const cache = getPermissionCache();

    expect(cache.size).toBe(1);

    handler({ userId: 'user-1' });

    expect(cache.size).toBe(0);
  });

  it('should extract event payload fields', () => {
    const handler = createInvalidationHandler();
    const cache = getPermissionCache();

    handler({
      userId: 'user-1',
      resourceType: 'project',
      resourceId: 'proj-1',
      relation: 'viewer',
    });

    expect(cache.size).toBe(0);
  });
});

describe('INVALIDATION_EVENTS', () => {
  it('should include all IAM events', () => {
    expect(INVALIDATION_EVENTS).toContain('iam.role.assigned');
    expect(INVALIDATION_EVENTS).toContain('iam.role.revoked');
    expect(INVALIDATION_EVENTS).toContain('iam.team.member.added');
    expect(INVALIDATION_EVENTS).toContain('iam.team.member.removed');
    expect(INVALIDATION_EVENTS).toContain('iam.user.deleted');
  });
});
