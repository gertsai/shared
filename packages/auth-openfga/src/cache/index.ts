/**
 * Permission Cache with Event-Driven Invalidation
 *
 * Implements LRU caching for permission check results with:
 * - Configurable TTL
 * - Event-driven invalidation
 * - Wildcard invalidation patterns
 *
 * @module @gertsai/auth-openfga/cache
 */

import type { FgaCheckResponse, FgaResourceType } from '../types.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Cache key for permission checks.
 */
export interface PermissionCacheKey {
  userId: string;
  relation: string;
  resourceType: FgaResourceType;
  resourceId: string;
}

/**
 * Cached permission entry.
 */
interface CacheEntry {
  value: FgaCheckResponse;
  expiresAt: number;
  createdAt: number;
}

/**
 * Cache configuration.
 */
export interface PermissionCacheConfig {
  /** Max cache entries (default: 10000) */
  maxSize?: number;
  /** TTL in milliseconds (default: 60000 = 1 minute) */
  ttlMs?: number;
  /** Enable cache (default: true) */
  enabled?: boolean;
}

/**
 * Event for cache invalidation.
 */
export interface PermissionChangeEvent {
  userId?: string;
  resourceType?: FgaResourceType;
  resourceId?: string;
  relation?: string;
}

// =============================================================================
// LRU Permission Cache
// =============================================================================

/**
 * LRU cache for permission check results.
 */
export class PermissionCache {
  private cache: Map<string, CacheEntry> = new Map();
  private config: Required<PermissionCacheConfig>;
  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    invalidations: 0,
  };

  constructor(config?: PermissionCacheConfig) {
    this.config = {
      maxSize: config?.maxSize ?? 10000,
      ttlMs: config?.ttlMs ?? 60000,
      enabled: config?.enabled ?? true,
    };
  }

  /**
   * Generates cache key from request.
   */
  private makeKey(key: PermissionCacheKey): string {
    return `${key.userId}:${key.relation}:${key.resourceType}:${key.resourceId}`;
  }

  /**
   * Gets a cached permission result.
   */
  get(key: PermissionCacheKey): FgaCheckResponse | null {
    if (!this.config.enabled) {
      return null;
    }

    const cacheKey = this.makeKey(key);
    const entry = this.cache.get(cacheKey);

    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // Check TTL
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(cacheKey);
      this.stats.misses++;
      return null;
    }

    // Move to end (LRU)
    this.cache.delete(cacheKey);
    this.cache.set(cacheKey, entry);

    this.stats.hits++;
    return entry.value;
  }

  /**
   * Sets a permission result in cache.
   */
  set(key: PermissionCacheKey, value: FgaCheckResponse): void {
    if (!this.config.enabled) {
      return;
    }

    const cacheKey = this.makeKey(key);
    const now = Date.now();

    // Evict if at max size
    if (this.cache.size >= this.config.maxSize) {
      // Delete oldest entry (first in map)
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
        this.stats.evictions++;
      }
    }

    this.cache.set(cacheKey, {
      value,
      createdAt: now,
      expiresAt: now + this.config.ttlMs,
    });
  }

  /**
   * Invalidates cache entries matching the event pattern.
   *
   * Supports wildcards: if a field is undefined, matches all values.
   *
   * @example
   * ```typescript
   * // Invalidate all permissions for a user
   * cache.invalidate({ userId: 'user-123' });
   *
   * // Invalidate all permissions for a resource
   * cache.invalidate({ resourceType: 'project', resourceId: 'proj-456' });
   *
   * // Invalidate specific relation for a user on all resources
   * cache.invalidate({ userId: 'user-123', relation: 'viewer' });
   * ```
   */
  invalidate(event: PermissionChangeEvent): number {
    if (!this.config.enabled) {
      return 0;
    }

    let invalidated = 0;

    for (const [key] of this.cache) {
      const [userId, relation, resourceType, resourceId] = key.split(':');

      const matches =
        (event.userId === undefined || event.userId === userId) &&
        (event.relation === undefined || event.relation === relation) &&
        (event.resourceType === undefined || event.resourceType === resourceType) &&
        (event.resourceId === undefined || event.resourceId === resourceId);

      if (matches) {
        this.cache.delete(key);
        invalidated++;
      }
    }

    this.stats.invalidations += invalidated;
    return invalidated;
  }

  /**
   * Invalidates all entries for a user.
   */
  invalidateUser(userId: string): number {
    return this.invalidate({ userId });
  }

  /**
   * Invalidates all entries for a resource.
   */
  invalidateResource(resourceType: FgaResourceType, resourceId: string): number {
    return this.invalidate({ resourceType, resourceId });
  }

  /**
   * Clears the entire cache.
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Gets cache statistics.
   */
  getStats(): typeof this.stats & { size: number; hitRate: number } {
    const total = this.stats.hits + this.stats.misses;
    return {
      ...this.stats,
      size: this.cache.size,
      hitRate: total > 0 ? this.stats.hits / total : 0,
    };
  }

  /**
   * Resets statistics.
   */
  resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      invalidations: 0,
    };
  }

  /**
   * Gets current cache size.
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Checks if cache is enabled.
   */
  get enabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Enables or disables the cache.
   */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
    if (!enabled) {
      this.clear();
    }
  }
}

// =============================================================================
// Multi-Scope Cache Map (Wave 6.3 / ADR-012)
// =============================================================================

/**
 * Stable scope key for callers that omit `scope` — preserves the
 * pre-Wave-6.3 single-cache singleton contract.
 */
const DEFAULT_SCOPE = '__default__';

/**
 * Map of `PermissionCache` instances keyed by scope. Distinct scopes
 * (e.g. one per OpenFGA store / tenant) maintain independent
 * permission TTL state.
 *
 * Backwards compat: existing callers passing no scope share the
 * `__default__` slot — observe identical behaviour to the pre-Wave-
 * 6.3 single global.
 */
const permissionCaches = new Map<string, PermissionCache>();

/**
 * Get-or-create the `PermissionCache` for the given scope.
 *
 * Wave 6.3 (ADR-012): replaces the global `let cacheInstance` with
 * a per-scope Map. Callers that need cross-tenant isolation pass a
 * stable `scope` (the m9s gate uses
 * `fingerprint({apiUrl, storeId, ...})` for symmetry with the
 * client cache).
 *
 * @param config — cache config; only consulted on first construction
 *                 of a given scope.
 * @param scope  — scope key. Defaults to `__default__` for back-compat.
 */
export function getPermissionCache(
  config?: PermissionCacheConfig,
  scope: string = DEFAULT_SCOPE,
): PermissionCache {
  let cache = permissionCaches.get(scope);
  if (!cache) {
    cache = new PermissionCache(config);
    permissionCaches.set(scope, cache);
  }
  return cache;
}

/**
 * Replace the cache instance for a given scope.
 *
 * Wave 6.3: scope arg added; back-compat via `__default__` default.
 */
export function setPermissionCache(
  cache: PermissionCache,
  scope: string = DEFAULT_SCOPE,
): void {
  permissionCaches.set(scope, cache);
}

/**
 * Reset cache(s).
 *
 * Wave 6.3 (ADR-012 invariant I-5): selective by scope when arg
 * given; clears all when no arg. The no-arg path matches the
 * legacy "clear singleton" contract.
 *
 * @param scope — when supplied, evict only the entry for that scope.
 *                When omitted, clear all cached scopes.
 */
export function resetPermissionCache(scope?: string): void {
  if (scope === undefined) {
    permissionCaches.clear();
    return;
  }
  permissionCaches.delete(scope);
}

// =============================================================================
// Event Integration Helpers
// =============================================================================

/**
 * Creates an invalidation handler for IAM events.
 *
 * @example
 * ```typescript
 * // In Moleculer service
 * events: {
 *   'iam.role.revoked': createInvalidationHandler(),
 *   'iam.team.member.removed': createInvalidationHandler(),
 * }
 * ```
 */
export function createInvalidationHandler(): (payload: Record<string, unknown>) => void {
  return (payload: Record<string, unknown>) => {
    const cache = getPermissionCache();

    // Extract user ID from various event payloads
    const userId = payload.userId as string | undefined;
    const resourceType = payload.resourceType as FgaResourceType | undefined;
    const resourceId = payload.resourceId as string | undefined;
    const relation = payload.relation as string | undefined;

    cache.invalidate({
      ...(userId !== undefined && { userId }),
      ...(resourceType !== undefined && { resourceType }),
      ...(resourceId !== undefined && { resourceId }),
      ...(relation !== undefined && { relation }),
    });
  };
}

/**
 * IAM events that should trigger cache invalidation.
 */
export const INVALIDATION_EVENTS = [
  'iam.role.assigned',
  'iam.role.revoked',
  'iam.team.member.added',
  'iam.team.member.removed',
  'iam.membership.added',
  'iam.membership.removed',
  'iam.user.deleted',
  'iam.project.access_granted',
  'iam.project.access_revoked',
] as const;
