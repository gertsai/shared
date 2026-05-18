/**
 * Resilient Redis adapter with retry policy and circuit breaker
 * This is a proposed improvement for better fault tolerance
 *
 * Wave 14.1 (PRD-044 / EVID-057): the inline private `LRUCache<K, V>`
 * class was consolidated into the shared `LruMap` kernel from
 * `@gertsai/utils/lru`. Public API of `ResilientRedisAdapter` is
 * unchanged — the cache was module-private, no external consumers.
 */

import { LruMap } from '@gertsai/utils/lru';

import type { RLRRedis } from '../utils/types';

import type { GCRAResult, SlidingWindowResult, StorageAdapter } from './StorageAdapter';

export interface ResilienceOptions {
  retryAttempts?: number;
  retryDelay?: number;
  retryBackoff?: 'linear' | 'exponential';
  circuitBreakerThreshold?: number;
  circuitBreakerTimeout?: number;
  fallbackStrategy?: 'allow' | 'deny' | 'cache';
  cacheSize?: number;
  cacheTTL?: number;
}

interface CachedResult {
  value: any;
  timestamp: number;
  ttl: number;
}

type CircuitState = 'closed' | 'open' | 'half-open';

/**
 * Circuit breaker implementation for fault tolerance
 */
class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failures = 0;
  private successCount = 0;
  private lastFailureTime = 0;
  private readonly requiredSuccesses = 3;

  constructor(
    private readonly threshold: number,
    private readonly timeout: number,
  ) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    // Check if circuit should transition from open to half-open
    if (this.state === 'open') {
      const timeSinceLastFailure = Date.now() - this.lastFailureTime;
      if (timeSinceLastFailure > this.timeout) {
        this.state = 'half-open';
        this.successCount = 0;
      } else {
        throw new Error(
          `Circuit breaker is open. Retry after ${this.timeout - timeSinceLastFailure}ms`,
        );
      }
    }

    try {
      const result = await operation();

      // Handle successful execution
      if (this.state === 'half-open') {
        this.successCount++;
        if (this.successCount >= this.requiredSuccesses) {
          this.state = 'closed';
          this.failures = 0;
        }
      } else if (this.state === 'closed') {
        // Reset failure count on success
        this.failures = 0;
      }

      return result;
    } catch (error) {
      this.handleFailure();
      throw error;
    }
  }

  private handleFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.state === 'half-open') {
      // Immediately open on failure in half-open state
      this.state = 'open';
    } else if (this.failures >= this.threshold) {
      this.state = 'open';
    }
  }

  getState(): CircuitState {
    return this.state;
  }

  reset(): void {
    this.state = 'closed';
    this.failures = 0;
    this.successCount = 0;
    this.lastFailureTime = 0;
  }
}

/**
 * Retry policy implementation
 */
class RetryPolicy {
  constructor(
    private readonly attempts: number,
    private readonly delay: number,
    private readonly backoff: 'linear' | 'exponential',
  ) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < this.attempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;

        // Don't retry on last attempt
        if (attempt < this.attempts - 1) {
          const delayMs = this.calculateDelay(attempt);
          await this.sleep(delayMs);
        }
      }
    }

    throw lastError || new Error('Retry failed');
  }

  private calculateDelay(attempt: number): number {
    if (this.backoff === 'exponential') {
      return this.delay * Math.pow(2, attempt);
    }
    return this.delay * (attempt + 1);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Resilient Redis adapter with fault tolerance mechanisms
 */
export class ResilientRedisAdapter implements StorageAdapter {
  private readonly circuitBreaker: CircuitBreaker;
  private readonly retryPolicy: RetryPolicy;
  private readonly cache: LruMap<string, CachedResult>;
  private readonly options: Required<ResilienceOptions>;

  constructor(
    private readonly store: RLRRedis,
    options: ResilienceOptions = {},
  ) {
    this.options = {
      retryAttempts: options.retryAttempts ?? 3,
      retryDelay: options.retryDelay ?? 100,
      retryBackoff: options.retryBackoff ?? 'exponential',
      circuitBreakerThreshold: options.circuitBreakerThreshold ?? 5,
      circuitBreakerTimeout: options.circuitBreakerTimeout ?? 30000,
      fallbackStrategy: options.fallbackStrategy ?? 'deny',
      cacheSize: options.cacheSize ?? 1000,
      cacheTTL: options.cacheTTL ?? 5000,
    };

    this.circuitBreaker = new CircuitBreaker(
      this.options.circuitBreakerThreshold,
      this.options.circuitBreakerTimeout,
    );

    this.retryPolicy = new RetryPolicy(
      this.options.retryAttempts,
      this.options.retryDelay,
      this.options.retryBackoff,
    );

    this.cache = new LruMap<string, CachedResult>({ maxSize: this.options.cacheSize });
  }

  async incrementSW(
    key: string,
    timeFrame: number,
    limit: number,
    now: number,
  ): Promise<SlidingWindowResult> {
    const cacheKey = `sw:${key}:${timeFrame}:${limit}`;

    try {
      return await this.executeWithResilience(async () => {
        if (!this.store.incrementSW) {
          throw new Error('incrementSW method not available');
        }

        const result = await this.store.incrementSW(key, timeFrame, limit, now);

        // Cache successful result
        this.cacheResult(cacheKey, result);

        return result;
      });
    } catch (error) {
      return this.handleFailure(cacheKey, error, {
        timeFrame,
        limit,
      }) as Promise<SlidingWindowResult>;
    }
  }

  async gcraCheck(
    key: string,
    timeFrame: number,
    limit: number,
    burst: number,
    now: number,
  ): Promise<GCRAResult> {
    const cacheKey = `gcra:${key}:${timeFrame}:${limit}:${burst}`;

    try {
      return await this.executeWithResilience(async () => {
        if (!this.store.gcraCheck) {
          throw new Error('GCRA check method not available');
        }

        const result = await this.store.gcraCheck(key, timeFrame, limit, burst, now);

        // Cache successful result
        this.cacheResult(cacheKey, result);

        return result;
      });
    } catch (error) {
      return this.handleFailure(cacheKey, error, {
        timeFrame,
        limit,
        burst,
      }) as Promise<GCRAResult>;
    }
  }

  private async executeWithResilience<T>(operation: () => Promise<T>): Promise<T> {
    return this.circuitBreaker.execute(() => this.retryPolicy.execute(operation));
  }

  private cacheResult(key: string, value: any): void {
    this.cache.set(key, {
      value,
      timestamp: Date.now(),
      ttl: this.options.cacheTTL,
    });
  }

  private getCachedResult(key: string): any | undefined {
    const cached = this.cache.get(key);
    if (cached) {
      const age = Date.now() - cached.timestamp;
      if (age < cached.ttl) {
        return cached.value;
      }
    }
    return undefined;
  }

  private handleFailure(
    cacheKey: string,
    error: unknown,
    context: { timeFrame: number; limit: number; burst?: number },
  ): any {
    // Try to use cached result first
    const cached = this.getCachedResult(cacheKey);
    if (cached) {
      console.warn('[ResilientRedisAdapter] Using cached result due to error:', error);
      return cached;
    }

    // Apply fallback strategy
    // GCRA returns: [allow, remaining, retryAfter] (3 elements)
    // Sliding Window returns: [allow, totalHits, remaining, resetMs] (4 elements)
    switch (this.options.fallbackStrategy) {
      case 'allow':
        // Allow the request when Redis is down
        console.warn('[ResilientRedisAdapter] Allowing request due to Redis failure');
        return context.burst !== undefined
          ? [1, context.burst, 0] // GCRA: [allow=1, remaining=burst, retryAfter=0]
          : [1, 1, context.limit - 1, context.timeFrame]; // SW: [allow=1, totalHits=1, remaining=limit-1, reset]

      case 'deny':
        // Deny the request when Redis is down
        console.warn('[ResilientRedisAdapter] Denying request due to Redis failure');
        return context.burst !== undefined
          ? [0, 0, context.timeFrame] // GCRA: [allow=0, remaining=0, retryAfter=timeFrame]
          : [0, context.limit, 0, context.timeFrame]; // SW: [allow=0, totalHits=limit, remaining=0, reset]

      case 'cache':
        // Only use cache, already tried above
        throw error;

      default:
        throw error;
    }
  }

  /**
   * Get circuit breaker state for monitoring
   */
  getCircuitState(): CircuitState {
    return this.circuitBreaker.getState();
  }

  /**
   * Reset circuit breaker (useful for testing or manual intervention)
   */
  resetCircuit(): void {
    this.circuitBreaker.reset();
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}
