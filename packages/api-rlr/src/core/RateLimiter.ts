/**
 * Core rate limiter logic separated from middleware concerns
 * This class is responsible only for rate limit checking, not HTTP handling
 */

import type { StorageAdapter } from '../adapters/StorageAdapter';
import { RequestContext } from '../context/RequestContext';
import { KeyGenerator } from '../services/KeyGenerator';
import { PathNormalizer } from '../services/PathNormalizer';
import { RouteResolver } from '../services/RouteResolver';
import { StrategyFactory } from '../strategies/StrategyFactory';
import type { IncomingRequest, RateLimitInfo, RateLimitOptions, RouteType } from '../utils/types';
import { LimiterStrategy } from '../utils/types';
import { isWhitelisted } from '../utils/security';

export interface RateLimitDecision {
  allowed: boolean;
  info: RateLimitInfo;
  context: RequestContext;
  strategy: LimiterStrategy;
}

export interface LimitsConfig {
  limit: number;
  timeFrame: number;
  strategy: LimiterStrategy;
  burst?: number;
  /** Cost of this request in tokens (default: 1) */
  cost?: number;
}

/**
 * Core rate limiter class with single responsibility
 */
export class RateLimiter {
  private readonly pathNormalizer: PathNormalizer;
  private readonly keyGenerator: KeyGenerator;
  private readonly routeResolver: RouteResolver;
  private readonly strategyFactory: StrategyFactory;

  constructor(
    private readonly adapter: StorageAdapter,
    private readonly config: RateLimitOptions,
  ) {
    this.pathNormalizer = new PathNormalizer();
    this.keyGenerator = new KeyGenerator(config.prefix || '');
    this.routeResolver = new RouteResolver(config.routes, this.pathNormalizer);
    this.strategyFactory = new StrategyFactory(adapter);
  }

  /**
   * Check if a request is within rate limits
   */
  async checkLimit(request: IncomingRequest): Promise<RateLimitDecision> {
    const context = new RequestContext(request);

    // Use Redis/Valkey time if configured, otherwise use local time
    const now = await this.getCurrentTime();

    // Extract request information
    const subject = this.resolveSubject(request, context);
    const path = this.pathNormalizer.normalize(request.url || request.originalUrl || '');
    const method = (request.method || 'GET').toLowerCase();

    // Store in context
    context.set('subject', subject);
    context.set('normalizedPath', path);
    context.set('method', method);

    // Check whitelist
    if (this.isWhitelisted(subject)) {
      return this.createAllowedDecision(context, this.config.limit, this.config.timeFrame);
    }

    // Resolve route and limits
    const routeMatch = this.routeResolver.resolve(request);
    const limits = this.resolveLimits(request, routeMatch?.route);

    // If routesOnly and no match, allow
    if (this.config.routesOnly && !routeMatch) {
      return this.createAllowedDecision(context, limits.limit, limits.timeFrame);
    }

    // Generate bucket key
    const bucketId = this.generateBucketId(method, path, routeMatch);
    const key = this.keyGenerator.generateBucketKey(subject, bucketId);

    // Store in context
    context.set('bucket', bucketId);
    context.set('routeMatched', Boolean(routeMatch));
    context.set('limit', limits.limit);
    context.set('timeFrame', limits.timeFrame);
    context.set('strategy', limits.strategy);

    // Execute strategy
    const strategy = this.strategyFactory.get(limits.strategy);
    const result = await strategy.execute({
      store: null as any, // Not used with new adapters
      key,
      limit: limits.limit,
      timeFrame: limits.timeFrame,
      now,
      burst: limits.burst || 3, // Default burst value
      ...(limits.cost !== undefined && { cost: limits.cost }),
    });

    // Store result in context
    context.set('remaining', result.remainingHits);
    context.set('decision', result.allow ? 'allowed' : 'blocked');

    // Create rate limit info
    const info: RateLimitInfo = {
      limit: limits.limit,
      timeFrame: limits.timeFrame,
      totalHits: result.totalHits,
      remainingHits: result.remainingHits,
      expiryTime: result.expiryTime,
      bucketId: this.decorateBucketId(bucketId, path, method),
    };

    return {
      allowed: result.allow,
      info,
      context,
      strategy: limits.strategy,
    };
  }

  /**
   * Resolve the subject for rate limiting (IP, API key, user ID, etc.)
   */
  private resolveSubject(request: IncomingRequest, context: RequestContext): string {
    // Use custom resolver if provided
    if (typeof this.config.bucketKeyResolver === 'function') {
      const customSubject = this.config.bucketKeyResolver(request);
      if (customSubject) {
        return customSubject;
      }
    }

    // Fallback to IP
    const ip = context.get('ip');
    if (!ip) {
      throw new Error('Unable to determine subject for rate limiting');
    }

    return ip as string;
  }

  /**
   * Check if subject is whitelisted
   * Uses constant-time comparison to prevent timing attacks (CWE-208)
   */
  private isWhitelisted(subject: string): boolean {
    if (!this.config.whiteList || this.config.whiteList.length === 0) {
      return false;
    }
    return isWhitelisted(subject, this.config.whiteList);
  }

  /**
   * Resolve limits for the request
   */
  private resolveLimits(request: IncomingRequest, route?: RouteType): LimitsConfig {
    // Start with base config
    let limits: LimitsConfig = {
      limit: this.config.limit,
      timeFrame: this.config.timeFrame,
      strategy: this.config.strategy || LimiterStrategy.SLIDING_WINDOW,
      ...(this.config.burst !== undefined && { burst: this.config.burst }),
      ...(this.config.cost !== undefined && { cost: this.config.cost }),
    };

    // Apply route overrides
    if (route) {
      const nextBurst = route.burst ?? limits.burst;
      const nextCost = route.cost ?? limits.cost;
      limits = {
        ...limits,
        limit: route.limit ?? limits.limit,
        timeFrame: route.timeFrame ?? limits.timeFrame,
        strategy: route.strategy ?? limits.strategy,
        ...(nextBurst !== undefined && { burst: nextBurst }),
        ...(nextCost !== undefined && { cost: nextCost }),
      };
    }

    // Apply dynamic resolver if provided
    if (typeof this.config.limitsResolver === 'function') {
      const dynamicLimits = this.config.limitsResolver({
        req: request,
        route,
        base: {
          limit: limits.limit,
          timeFrame: limits.timeFrame,
          strategy: limits.strategy,
          burst: limits.burst || 3, // Ensure burst is always defined
        },
      });

      if (dynamicLimits) {
        const nextBurst = dynamicLimits.burst ?? limits.burst;
        limits = {
          ...limits,
          limit: dynamicLimits.limit ?? limits.limit,
          timeFrame: dynamicLimits.timeFrame ?? limits.timeFrame,
          strategy: dynamicLimits.strategy ?? limits.strategy,
          ...(nextBurst !== undefined && { burst: nextBurst }),
        };
      }
    }

    return limits;
  }

  /**
   * Generate bucket ID for the request
   */
  private generateBucketId(
    method: string,
    path: string,
    routeMatch?: { route: RouteType; bucketId?: string } | null,
  ): string {
    if (routeMatch?.bucketId) {
      return routeMatch.bucketId;
    }

    return `${method}:${path}`;
  }

  /**
   * Decorate bucket ID with suffixes for client visibility
   */
  private decorateBucketId(bucketId: string, path: string, method: string): string {
    let decorated = bucketId;

    // Add SSE suffix
    if (method === 'get' && /(\/events|\/stream)(\/|$)/.test(path)) {
      decorated += '/sse';
    }

    // Add bulk suffix
    if (/(\/bulk|\/batch)(\/|$)/.test(path)) {
      decorated += '/bulk';
    }

    return decorated;
  }

  /**
   * Create an allowed decision
   */
  private createAllowedDecision(
    context: RequestContext,
    limit: number,
    timeFrame: number,
  ): RateLimitDecision {
    context.set('decision', 'allowed');
    context.set('remaining', limit);

    const info: RateLimitInfo = {
      limit,
      timeFrame,
      totalHits: 0,
      remainingHits: limit,
      expiryTime: timeFrame,
    };

    return {
      allowed: true,
      info,
      context,
      strategy: LimiterStrategy.SLIDING_WINDOW,
    };
  }

  /**
   * Get current time - uses Redis TIME if useRedisTime is enabled
   * This helps avoid clock skew issues in distributed systems
   */
  private async getCurrentTime(): Promise<number> {
    if (this.config.useRedisTime && this.adapter.getTime) {
      try {
        return await this.adapter.getTime();
      } catch (error) {
        // Fallback to local time if Redis TIME fails
        console.warn('[RateLimiter] Failed to get Redis time, falling back to local time:', error);
        return Date.now();
      }
    }
    return Date.now();
  }

  /**
   * Get adapter (for testing)
   */
  getAdapter(): StorageAdapter {
    return this.adapter;
  }

  /**
   * Get configuration
   */
  getConfig(): RateLimitOptions {
    return this.config;
  }
}
