/**
 * In-Memory Storage Adapter for Rate Limiting
 *
 * Provides a fallback when Redis/Valkey is unavailable.
 * Implements the same algorithms as the Lua scripts:
 * - Sliding Window with weighted previous window
 * - GCRA (Generic Cell Rate Algorithm)
 *
 * Features:
 * - Automatic cleanup of expired entries
 * - LRU eviction when max keys exceeded
 * - Thread-safe (single JS thread)
 *
 * Limitations:
 * - Not distributed (each instance has its own state)
 * - Memory bound (configure maxKeys appropriately)
 *
 * @module adapters/MemoryAdapter
 */

import type {
  GCRAResult,
  LeakyBucketResult,
  SlidingWindowResult,
  StorageAdapter,
} from './StorageAdapter';

export interface MemoryAdapterConfig {
  /** Maximum number of keys to store (LRU eviction) */
  maxKeys?: number;
  /** Cleanup interval in ms (default: 60000) */
  cleanupInterval?: number;
  /** Enable debug logging */
  debug?: boolean;
}

interface SlidingWindowEntry {
  /** Sorted timestamps of requests */
  timestamps: number[];
  /** Last access time for LRU */
  lastAccess: number;
  /** Expiry time */
  expiresAt: number;
}

interface GCRAEntry {
  /** Theoretical Arrival Time */
  tat: number;
  /** Last access time for LRU */
  lastAccess: number;
  /** Expiry time */
  expiresAt: number;
}

interface LeakyBucketEntry {
  /** Current water level in bucket */
  level: number;
  /** Last update timestamp */
  lastUpdate: number;
  /** Last access time for LRU */
  lastAccess: number;
  /** Expiry time */
  expiresAt: number;
}

export class MemoryAdapter implements StorageAdapter {
  private readonly swStore = new Map<string, SlidingWindowEntry>();
  private readonly gcraStore = new Map<string, GCRAEntry>();
  private readonly lbStore = new Map<string, LeakyBucketEntry>();
  private readonly maxKeys: number;
  private readonly debug: boolean;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: MemoryAdapterConfig = {}) {
    this.maxKeys = config.maxKeys ?? 10000;
    this.debug = config.debug ?? false;

    // Start cleanup timer
    const cleanupInterval = config.cleanupInterval ?? 60000;
    if (cleanupInterval > 0) {
      this.cleanupTimer = setInterval(() => this.cleanup(), cleanupInterval);
      // Don't block process exit
      if (this.cleanupTimer.unref) {
        this.cleanupTimer.unref();
      }
    }
  }

  /**
   * Sliding Window rate limit check
   * Mirrors the logic from limitSlightWindowMain.lua
   * @param cost - Number of tokens this request consumes (default: 1)
   */
  async incrementSW(
    key: string,
    timeFrame: number,
    limit: number,
    now: number,
    cost: number = 1,
  ): Promise<SlidingWindowResult> {
    const quarterTimeFrame = timeFrame / 4;
    const currentWindowStart = now - (now % timeFrame);
    const previousWindowEnd = currentWindowStart - 1;
    const windowElapsedTime = now - currentWindowStart;

    // Calculate weight for previous window
    const previousWindowWeight = windowElapsedTime <= quarterTimeFrame ? 0.75 : 0;

    // Get or create entry
    let entry = this.swStore.get(key);
    if (!entry) {
      entry = {
        timestamps: [],
        lastAccess: now,
        expiresAt: now + timeFrame * 2,
      };
      this.swStore.set(key, entry);
      this.evictIfNeeded(this.swStore);
    }

    // Remove old requests outside previous window
    const previousWindowStart = previousWindowEnd - timeFrame;
    entry.timestamps = entry.timestamps.filter((ts) => ts > previousWindowStart);

    // Count requests in current window
    const currentWindowRequests = entry.timestamps.filter(
      (ts) => ts >= currentWindowStart && ts <= now,
    ).length;

    // Count requests in previous window with weighting
    const previousWindowRequests = entry.timestamps.filter(
      (ts) => ts >= previousWindowStart && ts <= previousWindowEnd,
    ).length;
    const weightedPreviousRequests = Math.floor(previousWindowRequests * previousWindowWeight);

    // Total weighted requests
    const totalWeightedRequests = currentWindowRequests + weightedPreviousRequests;

    // Update access time
    entry.lastAccess = now;
    entry.expiresAt = now + timeFrame * 2;

    // Check if we have room for the cost
    if (totalWeightedRequests + cost <= limit) {
      // Allow request - add `cost` timestamps to represent the cost
      for (let i = 0; i < cost; i++) {
        entry.timestamps.push(now);
      }
      const totalHits = totalWeightedRequests + cost;
      const remainingHits = limit - totalHits;
      const resetTime = timeFrame - windowElapsedTime;

      if (this.debug) {
        console.log(
          `[MemoryAdapter] SW allow: key=${key}, cost=${cost}, hits=${totalHits}, remaining=${remainingHits}`,
        );
      }

      return [1, totalHits, remainingHits, resetTime];
    } else {
      // Deny request
      const oldestTime = entry.timestamps[0] ?? now;
      const resetTime = Math.max(oldestTime + timeFrame - now, 0);

      if (this.debug) {
        console.log(
          `[MemoryAdapter] SW deny: key=${key}, cost=${cost}, hits=${limit}, reset=${resetTime}ms`,
        );
      }

      return [0, limit, 0, resetTime];
    }
  }

  /**
   * GCRA rate limit check
   * Mirrors the logic from limitGcra.lua
   * @param cost - Number of tokens this request consumes (default: 1)
   */
  async gcraCheck(
    key: string,
    timeFrame: number,
    limit: number,
    burst: number,
    now: number,
    cost: number = 1,
  ): Promise<GCRAResult> {
    // Inter-arrival time per request
    const I = Math.floor(timeFrame / Math.max(1, limit));
    // Allow burst: virtual backlog L (requests)
    const L = burst;

    // Get or initialize TAT
    let entry = this.gcraStore.get(key);
    let tat = entry?.tat ?? 0;

    if (tat === 0) {
      tat = now;
    }

    // For cost > 1, we need enough room for all tokens
    const earliest = tat - L * I;

    let allow: number;
    let remaining: number;
    let retryAfter: number;

    // Check if we have room for the cost (cost * I time units)
    const costTime = cost * I;
    if (now >= earliest) {
      // Allow request - increment TAT by cost * I (multiple tokens)
      allow = 1;
      const newTat = Math.max(tat, now) + costTime;

      // Store new TAT
      this.gcraStore.set(key, {
        tat: newTat,
        lastAccess: now,
        expiresAt: now + timeFrame * 2,
      });
      this.evictIfNeeded(this.gcraStore);

      // Calculate remaining capacity (in terms of single tokens)
      remaining = Math.max(0, Math.floor((now + L * I - newTat) / I));
      retryAfter = 0;

      if (this.debug) {
        console.log(`[MemoryAdapter] GCRA allow: key=${key}, cost=${cost}, remaining=${remaining}`);
      }
    } else {
      // Deny request
      allow = 0;
      retryAfter = earliest - now;
      remaining = 0;

      // Update access time even on deny
      if (entry) {
        entry.lastAccess = now;
      }

      if (this.debug) {
        console.log(
          `[MemoryAdapter] GCRA deny: key=${key}, cost=${cost}, retryAfter=${retryAfter}ms`,
        );
      }
    }

    return [allow, remaining, retryAfter];
  }

  /**
   * Leaky Bucket rate limit check
   *
   * The leaky bucket algorithm models a bucket that:
   * - Has a maximum capacity (burst size)
   * - Leaks/drains at a constant rate (requests per second)
   * - Each request adds `cost` units of water (default: 1)
   * - Request is allowed if water level < capacity after adding
   *
   * This provides smooth traffic shaping with predictable output rate.
   *
   * @param key - Rate limit key
   * @param capacity - Maximum bucket capacity (burst size)
   * @param drainRate - Requests drained per second
   * @param now - Current timestamp in ms
   * @param cost - Number of tokens this request consumes (default: 1)
   */
  async leakyBucket(
    key: string,
    capacity: number,
    drainRate: number,
    now: number,
    cost: number = 1,
  ): Promise<LeakyBucketResult> {
    // Get or create entry
    let entry = this.lbStore.get(key);

    if (!entry) {
      entry = {
        level: 0,
        lastUpdate: now,
        lastAccess: now,
        expiresAt: now + (capacity / drainRate) * 1000 * 2, // 2x time to drain full bucket
      };
      this.lbStore.set(key, entry);
      this.evictIfNeeded(this.lbStore);
    }

    // Calculate how much water has leaked since last update
    const elapsed = now - entry.lastUpdate;
    const leaked = (elapsed / 1000) * drainRate; // drainRate is per second

    // Update water level (can't go below 0)
    entry.level = Math.max(0, entry.level - leaked);
    entry.lastUpdate = now;
    entry.lastAccess = now;

    // Try to add water (cost units for this request)
    const newLevel = entry.level + cost;

    let allow: number;
    let retryAfter: number;

    if (newLevel <= capacity) {
      // Bucket has room - allow request
      allow = 1;
      entry.level = newLevel;
      retryAfter = 0;
      entry.expiresAt = now + (capacity / drainRate) * 1000 * 2;

      if (this.debug) {
        console.log(
          `[MemoryAdapter] LeakyBucket allow: key=${key}, cost=${cost}, level=${newLevel}/${capacity}`,
        );
      }
    } else {
      // Bucket is full - deny request
      allow = 0;
      // Calculate time until enough units drain for this cost
      const overflow = newLevel - capacity;
      retryAfter = Math.ceil((overflow / drainRate) * 1000);

      if (this.debug) {
        console.log(
          `[MemoryAdapter] LeakyBucket deny: key=${key}, cost=${cost}, level=${entry.level}/${capacity}, retryAfter=${retryAfter}ms`,
        );
      }
    }

    return [allow, entry.level, capacity, drainRate, retryAfter];
  }

  /**
   * Cleanup expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    let swCleaned = 0;
    let gcraCleaned = 0;
    let lbCleaned = 0;

    for (const [key, entry] of this.swStore) {
      if (entry.expiresAt < now) {
        this.swStore.delete(key);
        swCleaned++;
      }
    }

    for (const [key, entry] of this.gcraStore) {
      if (entry.expiresAt < now) {
        this.gcraStore.delete(key);
        gcraCleaned++;
      }
    }

    for (const [key, entry] of this.lbStore) {
      if (entry.expiresAt < now) {
        this.lbStore.delete(key);
        lbCleaned++;
      }
    }

    if (this.debug && (swCleaned > 0 || gcraCleaned > 0 || lbCleaned > 0)) {
      console.log(`[MemoryAdapter] Cleanup: SW=${swCleaned}, GCRA=${gcraCleaned}, LB=${lbCleaned}`);
    }
  }

  /**
   * LRU eviction when max keys exceeded
   */
  private evictIfNeeded<T extends { lastAccess: number }>(store: Map<string, T>): void {
    if (store.size <= this.maxKeys) return;

    // Find oldest entry
    let oldestKey: string | null = null;
    let oldestAccess = Infinity;

    for (const [key, entry] of store) {
      if (entry.lastAccess < oldestAccess) {
        oldestAccess = entry.lastAccess;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      store.delete(oldestKey);
      if (this.debug) {
        console.log(`[MemoryAdapter] LRU evict: ${oldestKey}`);
      }
    }
  }

  /**
   * Get current stats
   */
  getStats(): { swKeys: number; gcraKeys: number; lbKeys: number; maxKeys: number } {
    return {
      swKeys: this.swStore.size,
      gcraKeys: this.gcraStore.size,
      lbKeys: this.lbStore.size,
      maxKeys: this.maxKeys,
    };
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.swStore.clear();
    this.gcraStore.clear();
    this.lbStore.clear();
  }

  /**
   * Get current time (for clock synchronization)
   * Memory adapter just returns Date.now()
   */
  async getTime(): Promise<number> {
    return Date.now();
  }

  /**
   * Stop cleanup timer and clear stores
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.clear();
  }
}
