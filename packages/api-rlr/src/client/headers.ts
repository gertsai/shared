import type { GatewayResponse } from 'moleculer-web';

import type { LimiterStrategy as LimiterStrategyEnum, RateLimitInfo } from '../utils/types';
import { LimiterStrategy } from '../utils/types';

export const setDraft6Headers = (
  response: GatewayResponse,
  info: RateLimitInfo,
  windowMs: number,
  strategy: LimiterStrategyEnum = LimiterStrategy.SLIDING_WINDOW,
): void => {
  if (response.headersSent) {
    return;
  }

  const windowSeconds = Math.ceil(windowMs / 1000);

  response.setHeader('X-RateLimit-Policy', `${info.limit};w=${windowSeconds};policy="${strategy}"`);
  response.setHeader('X-RateLimit-Limit', info.limit.toString());
  response.setHeader('X-RateLimit-Remaining', info.remainingHits.toString());
  if (info.bucketId) {
    response.setHeader('X-RateLimit-Bucket', info.bucketId);
  }

  // Scope and global flags for client-side bucketing
  response.setHeader('X-RateLimit-Scope', info.scope ?? 'endpoint');
  response.setHeader('X-RateLimit-Global', (info.global ?? false).toString());

  // Retry-After in whole seconds (ceil), never 0 if there is any wait
  const retrySeconds = Math.ceil(info.expiryTime / 1000);
  // Back-compat header: absolute reset time in seconds since epoch
  const resetEpochSeconds = Math.ceil((Date.now() + info.expiryTime) / 1000);
  response.setHeader('X-RateLimit-Reset', resetEpochSeconds.toString());

  response.setHeader('X-RateLimit-Retry-After', retrySeconds.toString());
  // Also set standard header for clients
  response.setHeader('Retry-After', retrySeconds.toString());
  response.setHeader('X-RateLimit-Retry', Math.floor(Date.now() + info.expiryTime));
};

export const setDraft7Headers = (
  response: GatewayResponse,
  info: RateLimitInfo,
  windowMs: number,
): void => {
  if (response.headersSent) {
    return;
  }

  const windowSeconds = Math.ceil(windowMs / 1000);

  response.setHeader('RateLimit-Policy', `${info.limit};w=${windowSeconds}`);
  const resetSeconds = Math.ceil(info.expiryTime / 1000);
  response.setHeader(
    'RateLimit',
    `limit=${info.limit}, remaining=${info.remainingHits}, reset=${resetSeconds}`,
  );
  if (info.bucketId) {
    response.setHeader('X-RateLimit-Bucket', info.bucketId);
  }

  // Scope and global flags for client-side bucketing
  response.setHeader('X-RateLimit-Scope', info.scope ?? 'endpoint');
  response.setHeader('X-RateLimit-Global', (info.global ?? false).toString());

  // Standard Retry-After header
  response.setHeader('Retry-After', resetSeconds.toString());
};
