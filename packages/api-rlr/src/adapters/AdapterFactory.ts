/**
 * Factory for creating storage adapters based on configuration
 */

import type { RLRRedis, RateLimitOptions } from '../utils/types';

import { RedisAdapter } from './RedisAdapter';
import { ResilientRedisAdapter } from './ResilientRedisAdapter';
import type { StorageAdapter } from './StorageAdapter';
import { TypedRedisAdapter } from './TypedRedisAdapter';

export class AdapterFactory {
  /**
   * Create a storage adapter based on configuration
   */
  static create(store: RLRRedis, options: RateLimitOptions): StorageAdapter {
    // Determine which adapter to use based on configuration

    // If resilience options are provided, use the resilient adapter
    if (options.resilience || options.failOpenOnStoreError) {
      const resilienceOptions = {
        ...options.resilience,
        // Map legacy failOpenOnStoreError to fallbackStrategy
        fallbackStrategy: options.failOpenOnStoreError
          ? 'allow'
          : (options.resilience?.fallbackStrategy ?? 'deny'),
      };

      // Create base adapter (typed or standard)
      const baseAdapter = this.createBaseAdapter(store, options);

      // Wrap with resilient adapter if using TypedRedisAdapter
      if (baseAdapter instanceof TypedRedisAdapter) {
        return new ResilientRedisAdapter(store, resilienceOptions);
      }

      return new ResilientRedisAdapter(store, resilienceOptions);
    }

    // Use typed adapter if explicitly requested or in strict mode
    if (options.useTypedScripts || process.env.RLR_TYPED_SCRIPTS === 'true') {
      return new TypedRedisAdapter(store);
    }

    // Otherwise use the standard adapter
    return new RedisAdapter(store);
  }

  /**
   * Create base adapter without resilience
   */
  private static createBaseAdapter(store: RLRRedis, options: RateLimitOptions): StorageAdapter {
    if (options.useTypedScripts || process.env.RLR_TYPED_SCRIPTS === 'true') {
      return new TypedRedisAdapter(store);
    }
    return new RedisAdapter(store);
  }

  /**
   * Check if resilience is enabled
   */
  static isResilienceEnabled(options: RateLimitOptions): boolean {
    return Boolean(options.resilience || options.failOpenOnStoreError);
  }

  /**
   * Check if typed scripts are enabled
   */
  static isTypedScriptsEnabled(options: RateLimitOptions): boolean {
    return Boolean(options.useTypedScripts || process.env.RLR_TYPED_SCRIPTS === 'true');
  }
}
