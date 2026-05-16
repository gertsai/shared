/**
 * Factory for creating rate limit middleware
 * Handles dependency injection and configuration
 */

import { createHash } from 'node:crypto';

import { AdapterFactory } from '../adapters/AdapterFactory';
import { RateLimiter } from '../core/RateLimiter';
import { loadLuaScript } from '../lua-loader';
import { DefaultConfig } from '../utils/constants';
import type { RLRRedis, RateLimitOptions, RequestHandler } from '../utils/types';
import { configValidator } from '../validators/ConfigValidator';

import { RateLimitMiddleware } from './RateLimitMiddleware';

/**
 * Wave 12.D-fix / EVID-051 A-2 (FR-003): module-private store registry
 * keyed by SHA-256 fingerprint of the identity-affecting fields of the
 * config. Replaces the pre-Wave-12.D `globalThis.__RLR_STORES__`
 * anti-pattern (Wave 6.3 / ADR-012 also removed this exact shape from
 * `@gertsai/auth-openfga`).
 *
 * Invariants:
 *   - I-1 — Module-private: no `globalThis` leak; impossible to mutate
 *           from outside this module.
 *   - I-2 — Stable identity: same fingerprint → same store instance.
 *   - I-3 — Prototype-pollution-safe: `__proto__` / `constructor` /
 *           `prototype` keys rejected at lookup time.
 */
const storeInstances = new Map<string, RLRRedis>();

/**
 * Tracks whether the process-level cleanup handlers have been installed.
 * Module-scoped so it is reset only via `__resetStoreInstancesForTesting`.
 */
let cleanupHandlersInstalled = false;

/**
 * Compute a stable fingerprint of the identity-affecting fields of
 * `RateLimitOptions`. Mirrors `auth-openfga/util/fingerprint.ts`:
 *
 *   - Canonical JSON with hardcoded property order (no `sortReplacer`
 *     cleverness — explicit is safer; future field additions are visible
 *     in the diff).
 *   - SHA-256 hex digest, truncated to 32 chars (collision-resistant
 *     enough for an in-process store cache).
 *
 * The set of identity-affecting fields for an RLR store is intentionally
 * narrow: a store is "the same" if the construction inputs visible to
 * `config.store()` would produce the same Redis connection. Today this
 * is approximated by `(prefix, useRedisTime)` plus an optional
 * `storeSingletonKey` (back-compat with the pre-Wave-12.D API).
 */
function fingerprint(config: RateLimitOptions): string {
  // Canonical JSON — keys hardcoded in alphabetical order. Do not
  // refactor to `JSON.stringify(config, sortReplacer)` — explicit is
  // safer than clever; future field additions are visible in this diff.
  const canonical = JSON.stringify({
    prefix: config.prefix ?? '',
    storeSingletonKey: config.storeSingletonKey ?? '',
    useRedisTime: config.useRedisTime ?? false,
  });
  return createHash('sha256').update(canonical).digest('hex').slice(0, 32);
}

/**
 * Reject prototype-pollution keys. Defence-in-depth: `Map.set/get` is
 * already prototype-safe (unlike a plain object), but rejecting the
 * three sentinel strings up front avoids surprises if a caller hand-rolls
 * a `storeSingletonKey`.
 */
function assertSafeKey(key: string): void {
  if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
    throw new Error(
      `[RLR] store key cannot be a prototype-pollution sentinel ("${key}")`,
    );
  }
}

/**
 * Factory for creating rate limit middleware with proper separation of concerns
 */
export class MiddlewareFactory {
  /**
   * Create rate limit middleware
   */
  static create(options?: RateLimitOptions): RequestHandler {
    // Merge with defaults and validate
    const mergedConfig = { ...DefaultConfig, ...options };
    const validatedConfig = configValidator.validate(mergedConfig);

    // Get or create store
    const store = MiddlewareFactory.getOrCreateStore(validatedConfig);

    // Setup store event handlers and commands
    MiddlewareFactory.setupStore(store);

    // Create adapter based on configuration
    const adapter = AdapterFactory.create(store, validatedConfig);

    // Create core rate limiter
    const limiter = new RateLimiter(adapter, validatedConfig);

    // Create middleware
    const middleware = new RateLimitMiddleware(limiter, validatedConfig);

    // Return middleware function
    return middleware.createMiddleware();
  }

  /**
   * Get or create Redis store with module-private singleton support
   *
   * Wave 12.D-fix / FR-003: keyed by SHA-256 fingerprint (or explicit
   * `storeSingletonKey` when supplied, hashed into the fingerprint). No
   * `globalThis` mutation.
   */
  private static getOrCreateStore(config: RateLimitOptions): RLRRedis {
    // Back-compat: when neither `storeSingletonKey` nor any other
    // identity-affecting field is set, the caller has explicitly opted
    // out of singletoning. Honour the legacy behaviour and return a
    // fresh store every call.
    if (!config.storeSingletonKey) {
      return config.store() as RLRRedis;
    }

    const key = fingerprint(config);
    assertSafeKey(key);

    const cached = storeInstances.get(key);
    if (cached) {
      return cached;
    }

    const store = config.store() as RLRRedis;
    storeInstances.set(key, store);

    if (!cleanupHandlersInstalled) {
      MiddlewareFactory.setupCleanupHandlers();
      cleanupHandlersInstalled = true;
    }

    return store;
  }

  /**
   * Setup store with event handlers and commands
   */
  private static setupStore(store: RLRRedis): void {
    // Setup error handler
    store.on('error', (error: Error) => {
      console.error('[RLR] Redis error:', error);
    });

    // Load Lua scripts
    const incrementSW = loadLuaScript('limitSlightWindowMain');
    const gcra = loadLuaScript('limitGcra');

    // Define commands
    store.defineCommand('incrementSW', {
      lua: incrementSW,
      numberOfKeys: 1,
    });

    store.defineCommand('gcraCheck', {
      lua: gcra,
      numberOfKeys: 1,
    });
  }

  /**
   * Setup cleanup handlers for graceful shutdown
   * Closes ALL stores in the module-private registry.
   */
  private static setupCleanupHandlers(): void {
    const cleanup = () => {
      for (const [, store] of storeInstances) {
        try {
          // @ts-ignore -- Safe: ioredis types may vary
          store.quit?.();
        } catch {
          // Ignore cleanup errors for individual stores
        }
      }
      storeInstances.clear();
    };

    process.once('SIGINT', cleanup);
    process.once('SIGTERM', cleanup);
    process.once('beforeExit', cleanup);
  }

  /**
   * Get recommendations for configuration (for debugging)
   */
  static getRecommendations(options: RateLimitOptions): string[] {
    const mergedConfig = { ...DefaultConfig, ...options };
    const validatedConfig = configValidator.validate(mergedConfig);
    return configValidator.getRecommendations(validatedConfig);
  }
}

/**
 * Test helper — reset the module-private store registry.
 *
 * Wave 12.D-fix / FR-003: matches `auth-openfga.resetFgaClient()` shape.
 * NOT part of the public API — exported `@internal` for test isolation
 * only. Production code MUST NOT call this; rely on SIGINT/SIGTERM/
 * beforeExit cleanup paths.
 *
 * @internal
 */
export function __resetStoreInstancesForTesting(): void {
  storeInstances.clear();
  cleanupHandlersInstalled = false;
}

/**
 * Test helper — inspect the module-private store registry size.
 *
 * @internal
 */
export function __getStoreInstancesSizeForTesting(): number {
  return storeInstances.size;
}
