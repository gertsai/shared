/**
 * Factory for creating rate limit middleware
 * Handles dependency injection and configuration
 */

import fs from 'fs';
import path from 'path';

import { AdapterFactory } from '../adapters/AdapterFactory';
import { RateLimiter } from '../core/RateLimiter';
import { DefaultConfig } from '../utils/constants';
import type { RLRRedis, RateLimitOptions, RequestHandler } from '../utils/types';
import { configValidator } from '../validators/ConfigValidator';

import { RateLimitMiddleware } from './RateLimitMiddleware';

// Type for global singleton storage
type GlobalWithRLR = typeof globalThis & {
  __RLR_STORES__?: Record<string, RLRRedis>;
  __RLR_CLEANED__?: boolean;
};

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
    const store = this.getOrCreateStore(validatedConfig);

    // Setup store event handlers and commands
    this.setupStore(store);

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
   * Get or create Redis store with singleton support
   */
  private static getOrCreateStore(config: RateLimitOptions): RLRRedis {
    const key = config.storeSingletonKey;

    // If no singleton key, create new store
    if (!key) {
      return config.store() as RLRRedis;
    }

    // Use global singleton storage
    const g = globalThis as GlobalWithRLR;

    if (!g.__RLR_STORES__) {
      g.__RLR_STORES__ = {};
    }

    if (g.__RLR_STORES__[key]) {
      return g.__RLR_STORES__[key];
    }

    // Create new store and save to singleton
    const store = config.store() as RLRRedis;
    g.__RLR_STORES__[key] = store;

    // Setup cleanup handlers once
    if (!g.__RLR_CLEANED__) {
      this.setupCleanupHandlers(store);
      g.__RLR_CLEANED__ = true;
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
    const incrementSW = fs.readFileSync(
      path.join(__dirname, '../scripts/limitSlightWindowMain.lua'),
      'utf8',
    );

    const gcra = fs.readFileSync(path.join(__dirname, '../scripts/limitGcra.lua'), 'utf8');

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
   */
  private static setupCleanupHandlers(store: RLRRedis): void {
    const cleanup = () => {
      try {
        // @ts-ignore -- Safe: ioredis types may vary
        store.quit?.();
      } catch {
        // Ignore cleanup errors
      }
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
