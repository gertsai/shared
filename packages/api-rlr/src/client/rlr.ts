import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';

import RedisClient from 'ioredis';
import type { GatewayResponse, IncomingRequest } from 'moleculer-web';
import { getClientIp } from 'request-ip';

import { AdapterFactory } from '../adapters/AdapterFactory';
import type { StorageAdapter } from '../adapters/StorageAdapter';
import { RateLimitDebugger } from '../debug/RateLimitDebugger';
import { RateLimitError } from '../errors/RateLimitError';
import { KeyGenerator } from '../services/KeyGenerator';
import { PathNormalizer } from '../services/PathNormalizer';
import { RouteResolver } from '../services/RouteResolver';
import { StrategyFactory } from '../strategies/StrategyFactory';
import { DefaultConfig } from '../utils/constants';
import { parseScriptResponse } from '../utils/parser';
import type {
  ClientRateLimitInfo,
  NextFunction,
  RLRRedis,
  RateLimitInfo,
  RateLimitOptions,
  RequestHandler,
  RouteType,
  Store,
} from '../utils/types';
import { DraftVersionType, LimiterStrategy } from '../utils/types';
import { validations } from '../utils/validations';
import { configValidator } from '../validators/ConfigValidator';

import { setDraft6Headers, setDraft7Headers } from './headers';

/**
 * LUA scripts for rate limiting algorithms.
 */
const LUA = {
  incrementSW: fs.readFileSync(
    path.join(__dirname, '../scripts/limitSlightWindowMain.lua'),
    'utf8',
  ),
  gcra: fs.readFileSync(path.join(__dirname, '../scripts/limitGcra.lua'), 'utf8'),
};

/**
 * RateLimitRequest class.
 *
 * @class RateLimitRequest
 */
export class RateLimitRequest extends EventEmitter implements Store {
  static options: RateLimitOptions;
  config: RateLimitOptions;
  private store: RLRRedis;
  private readonly routes: ReadonlyArray<RouteType> | undefined = [];
  private readonly prefix: string;
  private readonly incrementFWScriptSha: Promise<string>;
  private readonly resetExpiryOnChange: boolean;

  // New services for better separation of concerns
  private readonly pathNormalizer: PathNormalizer;
  private readonly keyGenerator: KeyGenerator;
  private readonly debugger: RateLimitDebugger;
  private readonly routeResolver: RouteResolver;
  private readonly strategyFactory: StrategyFactory;
  private readonly adapter: StorageAdapter;

  /**
   * Constructor for the RateLimitRequest class.
   *
   * @param options - The rate limit options
   */
  constructor(options?: RateLimitOptions) {
    super();

    // Merge with defaults and validate configuration
    const mergedConfig = { ...DefaultConfig, ...options };
    this.config = configValidator.validate(mergedConfig);

    // Get recommendations if in debug mode
    if (process.env.RLR_DEBUG) {
      const recommendations = configValidator.getRecommendations(this.config);
      if (recommendations.length > 0) {
        console.log('[RLR] Configuration recommendations:', recommendations);
      }
    }

    this.routes = this.config.routes;
    this.prefix = this.config?.prefix ?? '';
    this.resetExpiryOnChange = this.config?.resetExpiryOnChange ?? false;

    // Initialize new services
    this.pathNormalizer = new PathNormalizer();
    this.keyGenerator = new KeyGenerator(this.prefix);
    this.debugger = new RateLimitDebugger('[RLR]');
    this.routeResolver = new RouteResolver(this.config.routes, this.pathNormalizer);

    this.store = this.getOrCreateStore();
    this.store.on('RedisClient error', console.error.bind(console));
    // Deprecated: Script loading is handled by adapters now
    this.incrementFWScriptSha = Promise.resolve('deprecated');

    this.store.defineCommand('incrementSW', {
      lua: LUA.incrementSW,
      numberOfKeys: 1,
    });
    this.store.defineCommand('gcraCheck', {
      lua: LUA.gcra,
      numberOfKeys: 1,
    });

    // Create adapter based on configuration (resilient or standard)
    this.adapter = AdapterFactory.create(this.store, this.config);

    // Initialize strategy factory with adapter
    this.strategyFactory = new StrategyFactory(this.adapter);
  }

  private getOrCreateStore(): RLRRedis {
    const key = this.config.storeSingletonKey;
    // Type augmentation for global singleton storage
    type GlobalWithRLR = typeof globalThis & {
      __RLR_STORES__?: Record<string, RLRRedis>;
      __RLR_CLEANED__?: boolean;
    };
    const g = globalThis as GlobalWithRLR;
    if (!key) {
      return this.config.store() as RLRRedis;
    }
    if (!g.__RLR_STORES__) {
      g.__RLR_STORES__ = {};
    }
    if (g.__RLR_STORES__[key]) {
      return g.__RLR_STORES__[key];
    }

    const store = this.config.store() as RLRRedis;
    g.__RLR_STORES__[key] = store;

    if (!g.__RLR_CLEANED__) {
      const cleanup = () => {
        try {
          // @ts-ignore -- Safe: ioredis types may not include quit in some versions
          store.quit?.();
        } catch (err) {
          void err;
        }
      };
      process.once('SIGINT', cleanup);
      process.once('SIGTERM', cleanup);
      process.once('beforeExit', cleanup);
      g.__RLR_CLEANED__ = true;
    }
    return store;
  }

  /**
   * Method to generate a sliding window key.
   *
   * @param ip - The client's ip
   */
  generateSWKey(ip: string) {
    validations.ip(ip);
    return `${this.config.prefix}${ip}`;
  }

  /**
   * Method to get a key for a client.
   * Now using KeyGenerator service for consistency.
   *
   * @param subject - The subject (IP, user ID, API key, etc.)
   * @param suffix - The suffix to append to the key (bucket ID)
   */
  getKey(subject: string, suffix?: string) {
    // Use KeyGenerator for consistent key generation
    if (suffix) {
      return this.keyGenerator.generateBucketKey(subject, suffix);
    }
    // For backward compatibility with old getKey behavior
    return `${subject}`;
  }

  /**
   * Method to load the increment fixed window script.
   * @deprecated Use LuaScriptManager with actual Lua files instead
   */
  async loadIncrementFWScript() {
    // For backward compatibility, we'll use a simple increment script
    const incrementScript = `
      local key = KEYS[1]
      local ttl = tonumber(ARGV[1])
      local count = redis.call('INCR', key)
      if count == 1 then
        redis.call('EXPIRE', key, ttl)
      end
      return count
    `;

    const result = await this.store.script('LOAD', incrementScript);

    if (typeof result !== 'string') {
      throw new TypeError('unexpected reply from redis client');
    }

    return result;
  }

  /**
   * Middleware to rate limit requests.
   *
   * @param request - The incoming request
   * @param response - The gateway response
   * @param next - The next function
   */
  public middleware: RequestHandler = (async (
    request: IncomingRequest,
    response: GatewayResponse,
    next?: NextFunction,
  ) => {
    const DEBUG = process.env.RLR_DEBUG === '1';
    const log = (...args: unknown[]) => {
      if (DEBUG) {
        console.log('[RLR]', ...args);
      }
    };
    const ip = getClientIp(request);
    if (ip === null) {
      return next && next(new Error('Ip not found'));
    }
    try {
      if (this.config?.skip) {
        next?.();
        return;
      }

      // TODO: use redis time if useRedisTime is true
      /**
       * const currentTime = this.config.useRedisTime
       *   ? await this.store.time()
       *   : Date.now();
       */
      const currentTime = Date.now();

      // Use PathNormalizer service instead of inline function
      const rawPath = (request.url || request.originalUrl || '').toString();
      const normPath = this.pathNormalizer.normalize(rawPath);

      // Log incoming request if debugging
      this.debugger.logRequest(request, {
        normalizedPath: normPath,
        rawPath,
      });

      // Subject key (ip by default) can be overridden via bucketKeyResolver (e.g., apiKey/tenant)
      const subject =
        (typeof this.config.bucketKeyResolver === 'function'
          ? this.config.bucketKeyResolver(request)
          : null) || (ip as string);
      const methodLower = (request.method || 'GET').toLowerCase();
      // Default bucket id & key are computed up-front to ensure a stable Redis key
      // even if no custom route matches. If a route matches we will override these.
      let bucketId: string = `${methodLower}:${normPath}`;
      let key: string = this.getKey(subject as string, bucketId);

      // Log bucket key if verbose debugging
      this.debugger.logBucketKey(subject as string, bucketId, key);

      // Resolve per-route overrides BEFORE increment to keep calculations consistent
      let limit = this.config.limit;
      let timeFrame = this.config.timeFrame;
      let strategy: LimiterStrategy = this.config.strategy ?? LimiterStrategy.SLIDING_WINDOW;

      if (this.config?.whiteList && this.config.whiteList.length) {
        if (this.config.whiteList.includes(ip as string)) {
          return next && next();
        }
      }

      let customRoute: RouteType | undefined;
      const reqPathLog = request.url || request.originalUrl;
      if (this.routes && this.routes.length) {
        const match = this.routeResolver.resolve(request);
        customRoute = match?.route;

        if (process.env.RLR_DEBUG === '1') {
          console.log('[RLR Route Match]', {
            method: request.method,
            path: reqPathLog,
            norm: normPath,
            customRoute: customRoute
              ? {
                  path: customRoute.path?.toString(),
                  limit: customRoute.limit,
                  ignore: customRoute.ignore,
                  method: customRoute.method,
                }
              : null,
            routesOnly: this.config.routesOnly,
          });
        }

        if (customRoute) {
          if (customRoute.ignore) {
            if (process.env.RLR_DEBUG === '1') {
              console.log('[RLR] Route ignored by configuration');
            }
            return next && next();
          }
          // Override default bucket with route-scoped bucket
          bucketId = match?.bucketId ?? `${customRoute.method.toLowerCase()}:${normPath}`;
          key = this.getKey(subject as string, bucketId);

          if (customRoute.limit != null) {
            limit = customRoute.limit;
          }

          if (customRoute.timeFrame != null) {
            timeFrame = customRoute.timeFrame;
          }

          if (customRoute.strategy) {
            strategy = customRoute.strategy;
          }
        }
        // If routesOnly enabled and no custom route matched, skip limiting
        if (!customRoute && this.config.routesOnly) {
          if (process.env.RLR_DEBUG === '1') {
            console.log('[RLR] No route match and routesOnly=true, skipping rate limit');
          }
          return next && next();
        }
      }

      // values computed by strategy below

      // Optional per-request limits override (e.g., PRO plans)
      if (typeof this.config.limitsResolver === 'function') {
        const overrides = this.config.limitsResolver({
          req: request,
          route: customRoute,
          base: {
            limit,
            timeFrame,
            strategy,
            burst: customRoute?.burst ?? this.config.burst ?? 3,
          },
        });
        if (overrides) {
          if (overrides.limit != null) {
            limit = overrides.limit;
          }
          if (overrides.timeFrame != null) {
            timeFrame = overrides.timeFrame;
          }
          if (overrides.strategy) {
            strategy = overrides.strategy;
          }
          if (overrides.burst != null) {
            // @ts-ignore -- Burst is optional in RouteType but we need to set it
            (customRoute || ({} as any)).burst = overrides.burst;
          }
        }
      }

      // Strategy execution
      const strategyImpl = this.strategyFactory.get(strategy);
      const burstForGCRA =
        (customRoute && customRoute.burst != null ? customRoute.burst : this.config.burst) ?? 3;
      const result = await strategyImpl.execute({
        store: this.store,
        key,
        limit,
        timeFrame,
        now: currentTime,
        burst: burstForGCRA,
      });

      const totalHits = result.totalHits;
      const remainingHits = result.remainingHits;
      const expiryTime = result.expiryTime;
      const allowByStrategy = result.allow;

      if (process.env.RLR_DEBUG === '1') {
        console.log('[RLR Strategy]', {
          strategy,
          subject,
          bucketId,
          key,
          limit,
          timeFrame,
          burst: burstForGCRA,
          allow: result.allow,
          remainingHits,
          expiryTime,
          currentTime,
        });
      }

      if (!allowByStrategy) {
        const info: RateLimitInfo = {
          limit,
          timeFrame,
          expiryTime,
          totalHits,
          remainingHits,
        };
        if (this.config.draftVersion === DraftVersionType.DRAFT7) {
          setDraft7Headers(response, info, timeFrame);
        } else {
          setDraft6Headers(response, info, timeFrame);
        }
        return next?.(
          new RateLimitError({
            type: 'rate_limit_error',
            message: 'Rate limit exceeded',
          }),
        );
      }

      // bucketId/key are guaranteed to be set at this point

      // Optional suffixes for client-visible bucket id (no change to Redis key)
      const isSSE = methodLower === 'get' && /(\/events|\/stream)(\/|$)/.test(normPath);
      const isBulk = /(\/bulk|\/batch)(\/|$)/.test(normPath);
      if (isSSE || isBulk) {
        bucketId = `${bucketId}${isBulk ? '/bulk' : ''}${isSSE ? '/sse' : ''}`;
      }

      const info: RateLimitInfo = {
        limit,
        timeFrame,
        expiryTime,
        totalHits,
        remainingHits,
        bucketId,
      };

      Object.defineProperty(info, 'current', {
        configurable: false,
        enumerable: false,
        value: totalHits,
      });

      Object.defineProperty(request, 'rateLimit', {
        configurable: false,
        enumerable: false,
        value: info,
      });

      if (this.config.draftVersion === DraftVersionType.DRAFT7) {
        setDraft7Headers(response, info, timeFrame);
      } else {
        setDraft6Headers(response, info, timeFrame, strategy);
      }

      if (allowByStrategy) {
        next?.();
      } else {
        next?.(
          new RateLimitError({
            type: 'rate_limit_error',
            message: 'Rate limit exceeded',
          }),
        );
      }
    } catch (err) {
      if (this.config.failOpenOnStoreError) {
        log('store error, fail-open', (err as Error)?.message || err);
        next?.();
        return;
      }
      next?.(err as RateLimitError);
    }
  }) as RequestHandler;

  /**
   * Method to increment fixed window counter.
   *
   * @param key - The identifier for a client
   */
  async retryableIncrementFW(key: string) {
    const evalCommand = async (): Promise<number[]> => {
      return this.store.sendCommand(
        new RedisClient.Command('EVALSHA', [
          await this.incrementFWScriptSha,
          '1',
          this.prefixKey(key),
          this.resetExpiryOnChange ? '1' : '0',
          this.config.timeFrame.toString(),
        ]),
      ) as number[];
    };

    try {
      return evalCommand();
    } catch {
      // Deprecated: Script loading is handled by adapters now
      return evalCommand();
    }
  }

  /**
   * Method to increment sliding window counter.
   *
   * @param key - The identifier for a client
   * @param currentTime - The current time
   */
  async retryableIncrementSW(key: string, timeFrame: number, limit: number, currentTime: number) {
    // incrementSW is defined in constructor via defineCommand
    if (!this.store.incrementSW) {
      throw new Error('incrementSW method not available');
    }
    const values = await this.store.incrementSW(key, timeFrame, limit, currentTime);
    return values;
  }

  /**
   * Method to increment fixed window counter.
   *
   * @param key {string} - The identifier for a client
   * @returns {IncrementResponse} - The number of hits and reset time for that client
   */
  async incrementFW(key: string): Promise<ClientRateLimitInfo> {
    const results = await this.retryableIncrementFW(key);
    return parseScriptResponse(results);
  }

  /**
   * Method to increment sliding window counter.
   *
   * @param key - The identifier for a client
   * @param currentTime - The current time
   * @returns {IncrementResponse} - The number of hits and reset time for that client
   */
  async incrementSW(key: string, currentTime: number): Promise<ClientRateLimitInfo> {
    const results = await this.retryableIncrementSW(
      key,
      this.config.timeFrame,
      this.config.limit,
      currentTime,
    );
    return parseScriptResponse(results);
  }

  /**
   * Method to decrement a client's hit counter.
   *
   * @param key {string} - The identifier for a client
   * @returns {void} - The number of hits and reset time for that client
   */
  async decrement(key: string): Promise<void> {
    await this.store.decr(this.prefixKey(key));
  }

  /**
   * Method to reset a client's hit counter.
   *
   * @param key {string} - The identifier for a client
   */
  async resetKey(key: string): Promise<void> {
    await this.store.del(this.prefixKey(key));
  }

  /**
   * Method to prefix a key with the rate limit prefix.
   * Now delegated to KeyGenerator for consistency.
   *
   * @param key - The key to prefix
   */
  prefixKey(key: string): string {
    // Check if it's already a properly formatted key
    if (this.keyGenerator.isOwnKey(key)) {
      return key;
    }
    // Otherwise, add the prefix
    return `${this.prefix}${key}`;
  }
}

export default RateLimitRequest;
