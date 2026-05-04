/**
 * Rate limit middleware that bridges HTTP layer with core rate limiter
 * Handles headers, error responses, and HTTP-specific concerns
 */

import type { GatewayResponse, IncomingRequest } from 'moleculer-web';
import { getClientIp } from 'request-ip';

import { setDraft6Headers, setDraft7Headers } from '../client/headers';
import type { RateLimiter } from '../core/RateLimiter';
import { RateLimitDebugger } from '../debug/RateLimitDebugger';
import { RateLimitError } from '../errors/RateLimitError';
import type {
  LimiterStrategy,
  NextFunction,
  RateLimitOptions,
  RequestHandler,
} from '../utils/types';
import { DraftVersionType } from '../utils/types';

/**
 * Rate limit middleware class
 * Responsible for HTTP-specific concerns and delegating to core limiter
 */
export class RateLimitMiddleware {
  private readonly limiter: RateLimiter;
  private readonly debugger: RateLimitDebugger;

  constructor(
    limiter: RateLimiter,
    private readonly config: RateLimitOptions,
  ) {
    this.limiter = limiter;
    this.debugger = new RateLimitDebugger('[RLR]');
  }

  /**
   * Create middleware function
   */
  createMiddleware(): RequestHandler {
    return async (request: IncomingRequest, response: GatewayResponse, next?: NextFunction) => {
      // Skip if configured
      if (this.config.skip) {
        return next?.();
      }

      // Check for IP
      const ip = getClientIp(request);
      if (!ip) {
        return next?.(new Error('IP address not found'));
      }

      try {
        // Log request if debugging
        if (process.env.RLR_DEBUG === '1') {
          this.debugger.logRequest(request, {
            ip,
            url: request.url || request.originalUrl || '',
          });
        }

        // Check rate limit
        const decision = await this.limiter.checkLimit(request);

        // Log decision if debugging
        if (process.env.RLR_DEBUG === '1') {
          this.debugger.logDecision({
            allowed: decision.allowed,
            bucket: decision.info.bucketId || '',
            limit: decision.info.limit,
            remaining: decision.info.remainingHits,
            strategy: decision.strategy.toString(),
            timeFrame: decision.info.timeFrame,
          });
        }

        // Set headers
        this.setHeaders(response, decision.info, decision.strategy);

        // Attach info to request
        this.attachInfoToRequest(request, decision.info);

        // Handle decision
        if (decision.allowed) {
          return next?.();
        } else {
          return next?.(
            new RateLimitError({
              type: 'rate_limit_error',
              message: 'Rate limit exceeded',
            }),
          );
        }
      } catch (error) {
        // Handle store errors based on configuration
        if (
          this.config.failOpenOnStoreError ||
          this.config.resilience?.fallbackStrategy === 'allow'
        ) {
          if (process.env.RLR_DEBUG === '1') {
            console.warn('[RLR] Store error, failing open:', error);
          }
          return next?.();
        }

        // Otherwise propagate error
        return next?.(error as Error);
      }
    };
  }

  /**
   * Set rate limit headers on response
   */
  private setHeaders(response: GatewayResponse, info: any, strategy: LimiterStrategy): void {
    if (this.config.draftVersion === DraftVersionType.DRAFT7) {
      setDraft7Headers(response, info, info.timeFrame);
    } else {
      setDraft6Headers(response, info, info.timeFrame, strategy);
    }
  }

  /**
   * Attach rate limit info to request object
   */
  private attachInfoToRequest(request: IncomingRequest, info: any): void {
    // Define non-enumerable property to avoid serialization issues
    Object.defineProperty(request, 'rateLimit', {
      configurable: false,
      enumerable: false,
      value: info,
    });

    // Legacy property for backward compatibility
    Object.defineProperty(info, 'current', {
      configurable: false,
      enumerable: false,
      value: info.totalHits,
    });
  }
}
