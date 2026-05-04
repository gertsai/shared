import type { IncomingRequest } from 'moleculer-web';
import { getClientIp } from 'request-ip';

import type { RateLimitInfo } from '../utils/types';

/**
 * Debug information for rate limit decision
 */
export interface RateLimitDecision {
  allowed: boolean;
  bucket: string;
  remaining: number;
  retryAfter?: number;
  strategy: string;
  limit: number;
  timeFrame: number;
}

/**
 * Debugger for rate limiting operations
 * Provides structured logging and debugging capabilities
 */
export class RateLimitDebugger {
  private enabled: boolean;
  private verbose: boolean;
  private prefix: string;

  constructor(prefix: string = '[RLR]') {
    this.enabled = process.env.RLR_DEBUG === '1' || process.env.RLR_DEBUG === 'true';
    this.verbose = process.env.RLR_DEBUG === 'verbose';
    this.prefix = prefix;
  }

  /**
   * Check if debugging is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Log incoming request details
   */
  logRequest(request: IncomingRequest, context?: Record<string, any>): void {
    if (!this.enabled) {
      return;
    }

    const ip = getClientIp(request);
    const timestamp = new Date().toISOString();

    console.log(`${this.prefix} Request`, {
      timestamp,
      method: request.method,
      path: request.url || request.originalUrl,
      ip,
      headers: this.verbose ? request.headers : undefined,
      ...context,
    });
  }

  /**
   * Log rate limit decision
   */
  logDecision(decision: RateLimitDecision): void {
    if (!this.enabled) {
      return;
    }

    const timestamp = new Date().toISOString();
    const status = decision.allowed ? '✅ ALLOWED' : '🚫 BLOCKED';

    console.log(`${this.prefix} Decision ${status}`, {
      timestamp,
      ...decision,
    });
  }

  /**
   * Log route matching details
   */
  logRouteMatch(
    path: string,
    method: string,
    matchedRoute?: {
      path: string | RegExp;
      limit?: number;
      timeFrame?: number;
      strategy?: string;
    },
    allRoutes?: number,
  ): void {
    if (!this.enabled) {
      return;
    }

    if (matchedRoute) {
      console.log(`${this.prefix} Route Match`, {
        path,
        method,
        matched: true,
        route: {
          path:
            matchedRoute.path instanceof RegExp
              ? matchedRoute.path.toString()
              : String(matchedRoute.path),
          limit: matchedRoute.limit,
          timeFrame: matchedRoute.timeFrame,
          strategy: matchedRoute.strategy,
        },
        totalRoutes: allRoutes,
      });
    } else {
      console.log(`${this.prefix} Route Match`, {
        path,
        method,
        matched: false,
        totalRoutes: allRoutes,
        message: 'Using default configuration',
      });
    }
  }

  /**
   * Log Redis operation
   */
  logRedisOperation(operation: string, key: string, result?: any, duration?: number): void {
    if (!this.enabled || !this.verbose) {
      return;
    }

    console.log(`${this.prefix} Redis Operation`, {
      operation,
      key,
      result: result !== undefined ? result : 'pending',
      duration: duration ? `${duration}ms` : undefined,
    });
  }

  /**
   * Log rate limit info (headers)
   */
  logRateLimitInfo(info: RateLimitInfo, bucket?: string): void {
    if (!this.enabled) {
      return;
    }

    console.log(`${this.prefix} Rate Limit Info`, {
      limit: info.limit,
      remaining: info.remainingHits,
      bucket: bucket || 'default',
      expiryTime: info.expiryTime,
      timeFrame: info.timeFrame,
      totalHits: info.totalHits,
      resetAt: new Date(Date.now() + info.expiryTime).toISOString(),
    });
  }

  /**
   * Log error with context
   */
  logError(error: Error, context?: Record<string, any>): void {
    console.error(`${this.prefix} Error`, {
      message: error.message,
      stack: this.verbose ? error.stack : undefined,
      timestamp: new Date().toISOString(),
      ...context,
    });
  }

  /**
   * Log configuration issues or recommendations
   */
  logConfigWarning(message: string, config?: any): void {
    if (!this.enabled) {
      return;
    }

    console.warn(`${this.prefix} Config Warning`, {
      message,
      config: this.verbose ? config : undefined,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Create a scoped debugger with additional context
   */
  scope(additionalPrefix: string): RateLimitDebugger {
    const scopedDebugger = new RateLimitDebugger(`${this.prefix}[${additionalPrefix}]`);
    // Inherit parent's enabled state
    if (this.enabled) {
      scopedDebugger.enable();
    }
    return scopedDebugger;
  }

  /**
   * Enable debugging programmatically
   */
  enable(verbose: boolean = false): void {
    this.enabled = true;
    this.verbose = verbose;
  }

  /**
   * Disable debugging programmatically
   */
  disable(): void {
    this.enabled = false;
    this.verbose = false;
  }

  /**
   * Performance timing helper
   */
  startTimer(label: string): () => void {
    if (!this.enabled || !this.verbose) {
      return () => {}; // No-op if not debugging
    }

    const start = Date.now();
    return () => {
      const duration = Date.now() - start;
      console.log(`${this.prefix} Timer [${label}]`, {
        duration: `${duration}ms`,
        timestamp: new Date().toISOString(),
      });
    };
  }

  /**
   * Log bucket key generation
   */
  logBucketKey(subject: string, bucketId: string, finalKey: string): void {
    if (!this.enabled || !this.verbose) {
      return;
    }

    console.log(`${this.prefix} Bucket Key`, {
      subject,
      bucketId,
      finalKey,
      timestamp: new Date().toISOString(),
    });
  }
}

// Singleton instance for global debugging
export const rlrDebugger = new RateLimitDebugger();

// Export for convenience
export default RateLimitDebugger;
