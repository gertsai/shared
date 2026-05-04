import type { RateLimitOptions, RouteType } from '../utils/types';
import { LimiterStrategy, Methods } from '../utils/types';

/**
 * Validates RateLimitOptions configuration
 */
export class ConfigValidator {
  /**
   * Validates the complete configuration
   * @param config - The configuration to validate
   * @throws Error if configuration is invalid
   */
  validate(config: RateLimitOptions): RateLimitOptions {
    // Basic validation
    if (!config.store || typeof config.store !== 'function') {
      throw new Error('ConfigValidator: store function is required');
    }

    if (config.limit !== undefined && config.limit <= 0) {
      throw new Error('ConfigValidator: limit must be positive');
    }

    if (config.timeFrame !== undefined && config.timeFrame <= 0) {
      throw new Error('ConfigValidator: timeFrame must be positive');
    }

    // Strategy-specific validation
    if (config.strategy === LimiterStrategy.GCRA) {
      if (!config.burst || config.burst < 0) {
        console.warn('ConfigValidator: GCRA strategy without burst, defaulting to 3');
        config.burst = 3;
      }
    }

    // Routes validation
    if (config.routes && Array.isArray(config.routes)) {
      config.routes.forEach((route, index) => {
        this.validateRoute(route, index);
      });
    }

    // Validate resolvers if present
    if (config.bucketKeyResolver && typeof config.bucketKeyResolver !== 'function') {
      throw new Error('ConfigValidator: bucketKeyResolver must be a function');
    }

    if (config.limitsResolver && typeof config.limitsResolver !== 'function') {
      throw new Error('ConfigValidator: limitsResolver must be a function');
    }

    return config;
  }

  /**
   * Validates a single route configuration
   * @param route - The route to validate
   * @param index - The index of the route in the array
   * @throws Error if route is invalid
   */
  private validateRoute(route: RouteType, index: number): void {
    if (!route.path) {
      throw new Error(`ConfigValidator: Route ${index} missing path`);
    }

    // Set default method if not provided
    if (!route.method) {
      route.method = Methods.GET;
    }

    // Validate route-specific limits
    if (route.limit !== undefined && route.limit <= 0) {
      throw new Error(`ConfigValidator: Route ${index} limit must be positive`);
    }

    if (route.timeFrame !== undefined && route.timeFrame <= 0) {
      throw new Error(`ConfigValidator: Route ${index} timeFrame must be positive`);
    }

    // Validate route strategy
    if (route.strategy === LimiterStrategy.GCRA && route.burst !== undefined && route.burst < 0) {
      throw new Error(`ConfigValidator: Route ${index} burst must be non-negative`);
    }
  }

  /**
   * Provides configuration recommendations
   * @param config - The configuration to analyze
   * @returns Array of recommendations
   */
  getRecommendations(config: RateLimitOptions): string[] {
    const recommendations: string[] = [];

    // Check for common misconfigurations
    if (!config.limit || config.limit > 1000) {
      recommendations.push('Consider setting a reasonable default limit (e.g., 100-500 requests)');
    }

    if (!config.timeFrame || config.timeFrame < 1000) {
      recommendations.push('TimeFrame seems very short, consider using at least 1000ms');
    }

    if (
      config.strategy === LimiterStrategy.GCRA &&
      (!config.burst || config.burst > config.limit)
    ) {
      recommendations.push('Burst should typically be smaller than the limit');
    }

    if (!config.failOpenOnStoreError) {
      recommendations.push('Consider enabling failOpenOnStoreError for better availability');
    }

    if (config.routes && config.routes.length > 50) {
      recommendations.push(
        'Large number of routes may impact performance, consider consolidating with regex patterns',
      );
    }

    return recommendations;
  }
}

export const configValidator = new ConfigValidator();
