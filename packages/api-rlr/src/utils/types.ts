import type { Redis } from 'ioredis';
import type { GatewayResponse, IncomingRequest } from 'moleculer-web';

import type { RateLimitError } from '../errors/RateLimitError';

export type NextFunction<T = (err?: RateLimitError | Error) => void> = T;
export type MolReq = IncomingRequest;
export type MolRes = GatewayResponse;

// Re-export for external use
export type { IncomingRequest, GatewayResponse };

type RedisData = boolean | number | string;
export type RedisReply = RedisData | RedisData[];

export type ClientRateLimitInfo = {
  totalHits: number;
  remainingHits: number;
  expiryTime: number;
};

export type IncrementResponse = ClientRateLimitInfo;

export type Store = {
  config: RateLimitOptions;
  generateSWKey: (ip: string) => string;

  /**
   * Method to fetch a client's hit count and reset time.
   *
   * @param key {string} - The identifier for a client.
   *
   * @returns {ClientRateLimitInfo} - The number of hits and reset time for that client.
   */
  getKey: (ip: string, suffix?: string) => string;

  /**
   * Method to increment a client's hit counter.
   *
   * @param key {string} - The identifier for a client.
   *
   * @returns {IncrementResponse | undefined} - The number of hits and reset time for that client.
   */
  incrementFW: (key: string) => Promise<IncrementResponse>;
  /**
   * Method to increment a client's hit counter.
   *
   * @param key {string} - The identifier for a client.
   *
   * @returns {IncrementResponse | undefined} - The number of hits and reset time for that client.
   */
  incrementSW: (key: string, currentTime: number) => Promise<IncrementResponse>;
  /**
   * Method to decrement a client's hit counter.
   *
   * @param key {string} - The identifier for a client.
   */
  decrement: (key: string) => Promise<void> | void;

  /**
   * Method to reset a client's hit counter.
   *
   * @param key {string} - The identifier for a client.
   */
  resetKey: (key: string) => Promise<void> | void;

  loadIncrementFWScript: () => Promise<string>;
  middleware: (
    request: IncomingRequest,
    response: GatewayResponse,
    next: NextFunction,
  ) => Promise<void | GatewayResponse>;
};

/**
 * Rate limit scope determines the isolation level of the rate limit.
 * Used for client-side bucketing and retry logic.
 */
export type RateLimitScope = 'user' | 'global' | 'endpoint' | 'tenant' | 'ip';

export type RateLimitInfo = {
  limit: number;
  timeFrame: number;
  //
  totalHits: number;
  remainingHits: number;
  //
  expiryTime: number;
  //
  serviceLimit?: number;
  /** Optional server bucket id to help clients align bucketing */
  bucketId?: string;
  /** Scope of the rate limit (endpoint, user, tenant, ip, global) */
  scope?: RateLimitScope;
  /** Whether this is a global rate limit that applies across all endpoints */
  global?: boolean;
};

export type AugmentedRequest = Request & {
  [key: string]: RateLimitInfo;
};

export enum DraftVersionType {
  DRAFT6 = 'draft6',
  DRAFT7 = 'draft7',
}

export type RedisConfig = {
  RLR_CLUSTER: boolean | string;
  RLR_HOST: string;
  RLR_PORT: number;
  RLR_CLUSTER_NAME: string;
};

export type RateLimitOptions = {
  /**
   * How long we should remember the requests.
   *
   * Defaults to `60000` ms (= 1 minute).
   */
  timeFrame: number;
  /**
   * The maximum number of connections to allow during the `window` before
   * rate limiting the client.
   *
   * Can be the limit itself as a number or express middleware that parses
   * the request and then figures out the limit.
   *
   * Defaults to `5`.
   */
  limit: number;
  whiteList?: ReadonlyArray<string>;
  skip?: boolean;
  prefix?: string | null;
  resetExpiryOnChange?: boolean;
  draftVersion?: DraftVersionType;
  routes?: ReadonlyArray<RouteType>;
  store: () => Redis;
  /** Optional global limiter strategy (defaults to sliding_window) */
  strategy?: LimiterStrategy;
  /** Optional global burst (only for token-bucket/gcra semantics). Defaults to 3. */
  burst?: number;
  /**
   * Default cost per request in tokens (default: 1)
   * Used for cost-based rate limiting where different operations
   * consume different amounts of the rate limit quota.
   */
  cost?: number;
  /**
   * If true and routes[] are provided, only matched routes are limited.
   * Unmatched requests will skip limiting (no global fallback).
   */
  routesOnly?: boolean;
  /**
   * Use Redis TIME to compute current time (ms) instead of Date.now().
   * Helps to avoid clock skew across nodes. Default: false.
   */
  useRedisTime?: boolean;
  /**
   * When Redis/store fails, allow requests to pass instead of failing (fail-open).
   * Recommended only for public read-only GET endpoints. Default: false.
   */
  failOpenOnStoreError?: boolean;
  /**
   * Use typed Lua scripts for better type safety and error handling
   */
  useTypedScripts?: boolean;
  /**
   * Use new modular architecture with better separation of concerns
   */
  useModularArchitecture?: boolean;
  /**
   * Resilience options for handling Redis failures
   */
  resilience?: {
    /** Number of retry attempts. Default: 3 */
    retryAttempts?: number;
    /** Delay between retries in ms. Default: 100 */
    retryDelay?: number;
    /** Retry backoff strategy. Default: 'exponential' */
    retryBackoff?: 'linear' | 'exponential';
    /** Circuit breaker failure threshold. Default: 5 */
    circuitBreakerThreshold?: number;
    /** Circuit breaker timeout in ms. Default: 30000 */
    circuitBreakerTimeout?: number;
    /** Fallback strategy when Redis is unavailable. Default: 'deny' */
    fallbackStrategy?: 'allow' | 'deny' | 'cache';
    /** Cache size for fallback. Default: 1000 */
    cacheSize?: number;
    /** Cache TTL in ms. Default: 5000 */
    cacheTTL?: number;
  };
  /**
   * Optional resolver to build the subject for bucketing (e.g., apiKey/userId/tenantId instead of IP).
   * Return a string to use as the bucket subject, or null/undefined to fallback to IP.
   */
  bucketKeyResolver?: (req: IncomingRequest) => string | null | undefined;
  /**
   * Optional resolver to override limits per request (useful for PRO plans, tenants, etc.).
   * Return any subset of { limit, timeFrame, strategy, burst } to override the base values.
   */
  limitsResolver?: (ctx: {
    req: IncomingRequest;
    route: RouteType | undefined;
    base: {
      limit: number;
      timeFrame: number;
      strategy: LimiterStrategy;
      burst: number;
    };
  }) =>
    | Partial<{
        limit: number;
        timeFrame: number;
        strategy: LimiterStrategy;
        burst: number;
      }>
    | null
    | undefined;
  /**
   * Optional key to reuse a single Redis connection across hot-reloads.
   * When provided, the library will cache the store instance globally
   * under this key and attach graceful shutdown hooks.
   */
  storeSingletonKey?: string;
};

export enum LimiterStrategy {
  SLIDING_WINDOW = 'sliding_window',
  GCRA = 'gcra',
  /** Leaky Bucket - smooth traffic shaping with constant drain rate */
  LEAKY_BUCKET = 'leaky_bucket',
}

export enum Methods {
  POST = 'POST',
  PUT = 'PUT',
  GET = 'GET',
  OPTIONS = 'OPTIONS',
  DELETE = 'DELETE',
}

export type RoutePath = string | RegExp;

export type RouteType = {
  path: RoutePath;
  method: Methods;
  timeFrame?: number;
  limit?: number;
  ignore?: boolean;
  /** Optional limiter strategy override for this route */
  strategy?: LimiterStrategy;
  /** Optional burst override for strategies that support it */
  burst?: number;
  /**
   * Cost of this request in tokens (default: 1)
   * Use for cost-based rate limiting where expensive operations
   * consume more of the rate limit quota.
   * Example: AI inference might cost 10, while simple GET costs 1
   */
  cost?: number;
};

export type Reset = number;
export type Token = number;
export type Usage = number;

export interface RLRRedis extends Redis {
  incrementSW?(
    key: string,
    timeFrame: number,
    limit: number,
    currentTime: number,
  ): Promise<[Token, Usage, Reset]>;
  gcraCheck?(
    key: string,
    timeFrame: number,
    limit: number,
    burst: number,
    currentTime: number,
  ): Promise<[number, number, number]>;
}

export interface RequestHandler<MReq = MolReq, MRes = MolRes, MNext = NextFunction> {
  (req: MReq, res: MRes, next?: MNext): Promise<void>;
}

/**
 * Strict type for validated configuration
 */
export type ValidatedRateLimitOptions = Required<
  Pick<RateLimitOptions, 'limit' | 'timeFrame' | 'store'>
> &
  RateLimitOptions;

/**
 * Type for configuration with defaults applied
 */
export type RateLimitOptionsWithDefaults = ValidatedRateLimitOptions & {
  strategy: LimiterStrategy;
  burst: number;
  prefix: string;
};
