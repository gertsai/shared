/**
 * Permission Cache with Event-Driven Invalidation
 *
 * Implements LRU caching for permission check results with:
 * - Configurable TTL
 * - Event-driven invalidation
 * - Wildcard invalidation patterns
 *
 * Wave 7.4 (PRD-011 / RFC-007): both the module-scoped per-scope
 * `permissionCaches` Map and the per-instance `PermissionCache.cache`
 * Map are now bounded via {@link LruTtlMap} to defend against CWE-770
 * unbounded growth in long-lived processes.
 *
 * @module @gertsai/auth-openfga/cache
 */

import { LruTtlMap, type LruTtlMapOptions } from '../internal/lru-ttl-map.js';
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
 *
 * Wave 7.4 (RFC-007): backing storage migrated from unbounded
 * `Map<string, CacheEntry>` to {@link LruTtlMap} for CWE-770 defense.
 * Eviction policy (LRU + absolute TTL) is enforced by `LruTtlMap`; the
 * per-entry `expiresAt` field is retained for back-compat shape but is
 * no longer load-bearing for TTL pruning. `invalidate` walks the
 * `LruTtlMap.keys()` iterator (note: may surface lazily-expired
 * entries — that is consistent with the pre-7.4 behaviour which also
 * iterated entries regardless of expiry).
 */
export class PermissionCache {
  private cache: LruTtlMap<string, CacheEntry>;
  private config: Required<PermissionCacheConfig>;
  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    invalidations: 0,
  };

  /**
   * @param config — cache configuration; `maxSize` + `ttlMs` propagate to the
   *                 internal {@link LruTtlMap}.
   * @param lruOpts — optional `LruTtlMap` overrides (e.g. `now` clock for
   *                  testability). Additive — back-compat preserved per
   *                  RFC-007 I-3.
   */
  constructor(config?: PermissionCacheConfig, lruOpts?: LruTtlMapOptions) {
    this.config = {
      maxSize: config?.maxSize ?? 10000,
      ttlMs: config?.ttlMs ?? 60000,
      enabled: config?.enabled ?? true,
    };
    this.cache = new LruTtlMap<string, CacheEntry>({
      maxSize: this.config.maxSize,
      ttlMs: this.config.ttlMs,
      ...(lruOpts?.now !== undefined && { now: lruOpts.now }),
      ...(lruOpts?.maxSize !== undefined && { maxSize: lruOpts.maxSize }),
      ...(lruOpts?.ttlMs !== undefined && { ttlMs: lruOpts.ttlMs }),
    });
  }

  /**
   * Generates cache key from request.
   */
  private makeKey(key: PermissionCacheKey): string {
    return `${key.userId}:${key.relation}:${key.resourceType}:${key.resourceId}`;
  }

  /**
   * Gets a cached permission result.
   *
   * Wave 7.4: LRU access touch + TTL expiry are now handled inside
   * {@link LruTtlMap.get}; this method only translates the
   * `undefined → null` boundary and updates `stats`.
   */
  get(key: PermissionCacheKey): FgaCheckResponse | null {
    if (!this.config.enabled) {
      return null;
    }

    const cacheKey = this.makeKey(key);
    const entry = this.cache.get(cacheKey);

    if (entry === undefined) {
      this.stats.misses++;
      return null;
    }

    this.stats.hits++;
    return entry.value;
  }

  /**
   * Sets a permission result in cache.
   *
   * Wave 7.4: LRU size eviction is handled inside {@link LruTtlMap.set};
   * we detect eviction by comparing `size` deltas and increment
   * `stats.evictions` accordingly.
   */
  set(key: PermissionCacheKey, value: FgaCheckResponse): void {
    if (!this.config.enabled) {
      return;
    }

    const cacheKey = this.makeKey(key);
    const now = Date.now();
    const wasPresent = this.cache.has(cacheKey);
    const sizeBefore = this.cache.size;

    this.cache.set(cacheKey, {
      value,
      createdAt: now,
      expiresAt: now + this.config.ttlMs,
    });

    // Eviction detection: if pre-set size was at maxSize and the key
    // was not already present, LruTtlMap must have evicted one entry
    // to make room. We cannot know which key was evicted (LruTtlMap
    // exposes no notification), only the count.
    if (!wasPresent && sizeBefore >= this.config.maxSize) {
      this.stats.evictions++;
    }
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
    // Snapshot keys to avoid iterating the underlying store while we
    // mutate it via `delete`.
    const keysSnapshot: readonly string[] = Array.from(this.cache.keys());

    for (const key of keysSnapshot) {
      // Key format is `<uid>:<rel>:<rtype>:<rid>` — fixed 4 parts. Under
      // `noUncheckedIndexedAccess` the slot type is `string | undefined`,
      // so we treat `undefined` as wildcard-non-match per RFC-006 canon.
      const parts = key.split(':');
      const userId = parts[0];
      const relation = parts[1];
      const resourceType = parts[2];
      const resourceId = parts[3];

      const matches =
        (event.userId === undefined || event.userId === userId) &&
        (event.relation === undefined || event.relation === relation) &&
        (event.resourceType === undefined || event.resourceType === resourceType) &&
        (event.resourceId === undefined || event.resourceId === resourceId);

      if (matches && this.cache.delete(key)) {
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
 *
 * Wave 7.4 (RFC-007 §3): migrated from unbounded `Map<...>` to
 * {@link LruTtlMap} with `maxSize=10000` and no top-level TTL
 * (each `PermissionCache` self-manages entry TTL).
 */
const permissionCaches = new LruTtlMap<string, PermissionCache>({ maxSize: 10000 });

/**
 * Get-or-create the `PermissionCache` for the given scope.
 *
 * Wave 6.3 (ADR-012): replaces the global `let cacheInstance` with
 * a per-scope Map. Callers that need cross-tenant isolation pass a
 * stable `scope` (the m9s gate uses
 * `fingerprint({apiUrl, storeId, ...})` for symmetry with the
 * client cache).
 *
 * Wave 7.4 (RFC-007 I-3 additive): optional `opts?: LruTtlMapOptions`
 * third argument forwards to the per-instance `PermissionCache.cache`
 * `LruTtlMap` — primarily for `now` clock injection in tests. The
 * module-scoped `permissionCaches` LRU is not tunable from callers
 * (RFC-007 §3: consumers do not tune that layer).
 *
 * @param config — cache config; only consulted on first construction
 *                 of a given scope.
 * @param scope  — scope key. Defaults to `__default__` for back-compat.
 * @param opts   — optional `LruTtlMapOptions` passed to the inner
 *                 per-instance cache on first construction (additive).
 */
export function getPermissionCache(
  config?: PermissionCacheConfig,
  scope: string = DEFAULT_SCOPE,
  opts?: LruTtlMapOptions,
): PermissionCache {
  let cache = permissionCaches.get(scope);
  if (cache === undefined) {
    cache = new PermissionCache(config, opts);
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
