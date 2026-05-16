import { RateLimitRequest } from './client/rlr';
import { MiddlewareFactory } from './middleware/MiddlewareFactory';
import type { MolReq, MolRes, NextFunction, RateLimitOptions, RequestHandler } from './utils/types';

export function RLRMiddleware<MReq = MolReq, MRes = MolRes, MNext = NextFunction>(
  options: RateLimitOptions,
): RequestHandler<MReq, MRes, MNext> {
  // New modular architecture is now default (since v0.2.0)
  // Set useModularArchitecture: false to use legacy implementation
  if (options.useModularArchitecture !== false && process.env.RLR_MODULAR !== 'false') {
    return MiddlewareFactory.create(options) as unknown as RequestHandler<MReq, MRes, MNext>;
  }

  // Otherwise use legacy implementation for backward compatibility
  // @deprecated Legacy implementation will be removed in v1.0.0
  if (process.env.NODE_ENV !== 'test') {
    console.warn(
      '[RLR] Warning: Using legacy rate limiter implementation. ' +
        'This will be removed in v1.0.0. ' +
        'Please migrate to the new modular architecture by removing useModularArchitecture: false',
    );
  }
  const { middleware } = new RateLimitRequest(options);
  return middleware as unknown as RequestHandler<MReq, MRes, MNext>;
}

export default RLRMiddleware;

// Export types
export type {
  RateLimitOptions,
  RequestHandler,
  RateLimitInfo,
  RateLimitScope,
} from './utils/types';
export { LimiterStrategy, DraftVersionType, Methods } from './utils/types';

// Export new services for advanced usage
export { PathNormalizer } from './services/PathNormalizer';
export { KeyGenerator } from './services/KeyGenerator';
export { RouteResolver, type RouteMatch } from './services/RouteResolver';

// Export RouteConfig type for benchmarks and advanced usage
export type { RouteType as RouteConfig } from './utils/types';

// Export improvements
export { RateLimitPresets, RoutePresets, withPreset } from './presets/RateLimitPresets';
export { ConfigValidator, configValidator } from './validators/ConfigValidator';
export { RateLimitDebugger, rlrDebugger } from './debug/RateLimitDebugger';

// Export health check
export { RateLimitHealthCheck } from './health/RateLimitHealthCheck';
export type { HealthStatus } from './health/RateLimitHealthCheck';

// Export request context (Wave 12.D-fix: renamed to avoid collision with
// @gertsai/runtime-context.RequestContext per EVID-051 A-1 / FR-002)
export { RlrRequestContext } from './context/RequestContext';
/**
 * @deprecated Use {@link RlrRequestContext} to avoid collision with
 * `@gertsai/runtime-context.RequestContext` (Wave 12.D-fix per EVID-051 A-1).
 * This alias will be removed in v1.0.0.
 */
export { RlrRequestContext as RequestContext } from './context/RequestContext';
export type { RequestContextData } from './context/RequestContext';

// Export test utilities
export { RateLimitTestUtils } from './test-utils/RateLimitTestUtils';
export type { SimulationResult, MockHeaders } from './test-utils/RateLimitTestUtils';

// Export errors
export { RateLimitError } from './errors/RateLimitError';

// Export header utilities for client integration
export { setDraft6Headers, setDraft7Headers } from './client/headers';

// Export adapters
export { RedisAdapter } from './adapters/RedisAdapter';
export { PostgreSQLAdapter } from './adapters/PostgreSQLAdapter';
export type { PostgreSQLAdapterConfig } from './adapters/PostgreSQLAdapter';
export { MemoryAdapter } from './adapters/MemoryAdapter';
export type { MemoryAdapterConfig } from './adapters/MemoryAdapter';
export type {
  StorageAdapter,
  SlidingWindowResult,
  GCRAResult,
  LeakyBucketResult,
} from './adapters/StorageAdapter';

// Export strategies
export { LeakyBucketStrategy } from './strategies/LeakyBucketStrategy';
export { GCRAStrategy } from './strategies/GCRAStrategy';
export { SlidingWindowStrategy } from './strategies/SlidingWindowStrategy';
