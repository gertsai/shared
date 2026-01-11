import type { RateLimitOptions } from '../utils/types';
import { LimiterStrategy } from '../utils/types';

/**
 * Pre-configured rate limit presets for common use cases
 */
export const RateLimitPresets = {
  /**
   * Conservative: Low limits for public APIs
   * 60 requests per minute
   */
  conservative: {
    timeFrame: 60000,
    limit: 60,
    strategy: LimiterStrategy.SLIDING_WINDOW,
  },

  /**
   * Standard: Balanced for authenticated users
   * 100 requests per minute with burst capacity
   */
  standard: {
    timeFrame: 60000,
    limit: 100,
    strategy: LimiterStrategy.GCRA,
    burst: 5,
  },

  /**
   * Aggressive: High limits for trusted services
   * 1000 requests per minute with large burst
   */
  aggressive: {
    timeFrame: 60000,
    limit: 1000,
    strategy: LimiterStrategy.GCRA,
    burst: 20,
  },

  /**
   * Webhook: Optimized for webhook endpoints
   * 10 requests per 10 seconds with small burst
   */
  webhook: {
    timeFrame: 10000,
    limit: 10,
    strategy: LimiterStrategy.GCRA,
    burst: 3,
  },

  /**
   * Analytics: For analytics/tracking endpoints
   * Higher burst for batch operations
   */
  analytics: {
    timeFrame: 60000,
    limit: 100,
    strategy: LimiterStrategy.GCRA,
    burst: 10,
  },

  /**
   * Search: For search endpoints
   * Higher limits for read operations
   */
  search: {
    timeFrame: 60000,
    limit: 180,
    strategy: LimiterStrategy.SLIDING_WINDOW,
  },

  /**
   * File Upload: For file upload endpoints
   * Lower limits due to resource intensity
   */
  fileUpload: {
    timeFrame: 60000,
    limit: 20,
    strategy: LimiterStrategy.GCRA,
    burst: 2,
  },

  /**
   * Chat Messages: For real-time messaging
   * Balanced for user experience
   */
  chatMessages: {
    timeFrame: 60000,
    limit: 60,
    strategy: LimiterStrategy.GCRA,
    burst: 5,
  },

  /**
   * Admin: For admin/management endpoints
   * More restrictive for security
   */
  admin: {
    timeFrame: 60000,
    limit: 30,
    strategy: LimiterStrategy.GCRA,
    burst: 2,
  },

  /**
   * Development: For development/testing
   * Very high limits
   */
  development: {
    timeFrame: 60000,
    limit: 10000,
    strategy: LimiterStrategy.GCRA,
    burst: 100,
  },
} as const;

/**
 * Helper function to merge preset with custom configuration
 * @param preset - The preset to use
 * @param customConfig - Custom configuration to override preset
 * @returns Merged configuration
 */
export function withPreset(
  preset: keyof typeof RateLimitPresets,
  customConfig: Partial<RateLimitOptions>,
): Partial<RateLimitOptions> {
  return {
    ...RateLimitPresets[preset],
    ...customConfig,
  };
}

/**
 * Route-specific presets for common endpoint patterns
 */
export const RoutePresets = {
  /**
   * Message sending endpoints
   */
  messageSend: {
    limit: 60,
    timeFrame: 60000,
    strategy: LimiterStrategy.GCRA,
    burst: 3,
  },

  /**
   * Message editing endpoints
   */
  messageEdit: {
    limit: 30,
    timeFrame: 60000,
    strategy: LimiterStrategy.SLIDING_WINDOW,
  },

  /**
   * Read/GET endpoints
   */
  readEndpoint: {
    limit: 120,
    timeFrame: 60000,
    strategy: LimiterStrategy.SLIDING_WINDOW,
  },

  /**
   * Write/POST endpoints
   */
  writeEndpoint: {
    limit: 40,
    timeFrame: 60000,
    strategy: LimiterStrategy.GCRA,
    burst: 3,
  },

  /**
   * Delete endpoints
   */
  deleteEndpoint: {
    limit: 20,
    timeFrame: 60000,
    strategy: LimiterStrategy.SLIDING_WINDOW,
  },

  /**
   * Webhook endpoints
   */
  webhookEndpoint: {
    limit: 30,
    timeFrame: 60000,
    strategy: LimiterStrategy.GCRA,
    burst: 5,
  },

  /**
   * Search endpoints
   */
  searchEndpoint: {
    limit: 180,
    timeFrame: 60000,
    strategy: LimiterStrategy.SLIDING_WINDOW,
  },

  /**
   * Payment endpoints
   */
  paymentEndpoint: {
    limit: 20,
    timeFrame: 60000,
    strategy: LimiterStrategy.GCRA,
    burst: 2,
  },
} as const;
