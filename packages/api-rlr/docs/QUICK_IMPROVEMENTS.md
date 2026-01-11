# Quick Improvements for @orchdev/api-rlr

## 🚀 Immediate Improvements (Can be done now)

### 1. **Code Organization**

```typescript
// Split the monolithic RateLimitRequest class into smaller services:

// services/KeyGenerator.ts
export class KeyGenerator {
  generateSWKey(ip: string, prefix: string): string {
    validations.ip(ip);
    return `${prefix}${ip}`;
  }

  generateBucketKey(subject: string, bucketId: string): string {
    return `${subject}:${bucketId}`;
  }
}

// services/PathNormalizer.ts
export class PathNormalizer {
  normalize(path: string): string {
    if (!path) return '';

    return path
      .toLowerCase()
      .replace(/\b[0-9a-fA-F-]{10,}\b/g, ':id')
      .replace(/\/reactions\/(.*)/, '/reactions/:reaction')
      .replace(/\/$/, '');
  }
}

// services/RouteMatcherService.ts
export class RouteMatcherService {
  match(request: Request, routes: RouteType[]): RouteType | null {
    // Extract route matching logic here
  }
}
```

### 2. **Add Input Validation**

```typescript
// validators/ConfigValidator.ts
export class ConfigValidator {
  validate(config: RateLimitOptions): void {
    if (config.limit <= 0) {
      throw new Error('Limit must be positive');
    }

    if (config.timeFrame <= 0) {
      throw new Error('Time frame must be positive');
    }

    if (config.strategy === 'gcra' && !config.burst) {
      console.warn('GCRA strategy without burst, defaulting to 3');
      config.burst = 3;
    }

    if (config.routes) {
      config.routes.forEach((route, index) => {
        if (!route.path) {
          throw new Error(`Route ${index} missing path`);
        }
        if (!route.method) {
          route.method = Methods.GET;
        }
      });
    }
  }
}
```

### 3. **Add TypeScript Strict Types**

```typescript
// types/strict.ts
export type StrictRateLimitOptions = Required<
  Pick<RateLimitOptions, 'timeFrame' | 'limit' | 'store'>
> & {
  strategy: LimiterStrategy;
  burst?: number;
  routes?: StrictRouteConfig[];
  bucketKeyResolver?: (req: IncomingRequest) => string;
  limitsResolver?: LimitsResolver;
  whiteList?: string[];
  failOpenOnStoreError?: boolean;
  draftVersion?: DraftVersionType;
  storeSingletonKey?: string;
};

export type StrictRouteConfig = {
  path: string | RegExp;
  method: Methods;
  limit: number;
  timeFrame: number;
  strategy?: LimiterStrategy;
  burst?: number;
  ignore?: boolean;
};
```

### 4. **Better Error Messages**

```typescript
// errors/DetailedErrors.ts
export class RateLimitExceededError extends RateLimitError {
  constructor(
    public readonly bucket: string,
    public readonly limit: number,
    public readonly timeFrame: number,
    public readonly retryAfter: number,
    public readonly strategy: LimiterStrategy,
  ) {
    super({
      type: 'rate_limit_error',
      message: `Rate limit exceeded for bucket "${bucket}". Limit: ${limit} per ${timeFrame}ms using ${strategy}. Retry after ${retryAfter}ms.`,
      bucket,
      limit,
      timeFrame,
      retryAfter,
      strategy,
    });
  }
}

export class ConfigurationError extends Error {
  constructor(
    public readonly field: string,
    public readonly value: any,
    public readonly reason: string,
  ) {
    super(`Invalid configuration for "${field}": ${reason}. Value: ${JSON.stringify(value)}`);
  }
}
```

### 5. **Add Debugging Helpers**

```typescript
// debug/RateLimitDebugger.ts
export class RateLimitDebugger {
  private enabled = process.env.RLR_DEBUG === '1';
  private verbose = process.env.RLR_DEBUG === 'verbose';

  logRequest(request: Request, context: any): void {
    if (!this.enabled) return;

    console.log('[RLR Request]', {
      method: request.method,
      path: request.url,
      ip: getClientIp(request),
      timestamp: new Date().toISOString(),
      ...context,
    });
  }

  logDecision(decision: RateLimitDecision): void {
    if (!this.enabled) return;

    console.log('[RLR Decision]', {
      allowed: decision.allowed,
      bucket: decision.bucket,
      remaining: decision.remaining,
      retryAfter: decision.retryAfter,
      strategy: decision.strategy,
    });
  }

  logError(error: Error, context: any): void {
    console.error('[RLR Error]', {
      error: error.message,
      stack: this.verbose ? error.stack : undefined,
      ...context,
    });
  }
}
```

### 6. **Add Default Presets**

```typescript
// presets/RateLimitPresets.ts
export const RateLimitPresets = {
  // Conservative: Low limits for public APIs
  conservative: {
    timeFrame: 60000,
    limit: 60,
    strategy: LimiterStrategy.SLIDING_WINDOW,
  },

  // Standard: Balanced for authenticated users
  standard: {
    timeFrame: 60000,
    limit: 100,
    strategy: LimiterStrategy.GCRA,
    burst: 5,
  },

  // Aggressive: High limits for trusted services
  aggressive: {
    timeFrame: 60000,
    limit: 1000,
    strategy: LimiterStrategy.GCRA,
    burst: 20,
  },

  // Webhook: Optimized for webhook endpoints
  webhook: {
    timeFrame: 10000,
    limit: 10,
    strategy: LimiterStrategy.GCRA,
    burst: 3,
  },
};

// Usage
const middleware = RLRMiddleware({
  ...RateLimitPresets.standard,
  store: () => new RedisClient(),
});
```

### 7. **Add Health Check**

```typescript
// health/RateLimitHealthCheck.ts
export class RateLimitHealthCheck {
  constructor(private store: RLRRedis) {}

  async check(): Promise<HealthStatus> {
    const start = Date.now();

    try {
      // Test Redis connection
      await this.store.ping();

      // Test Lua script loading
      const testKey = '__health_check__';
      await this.store.incrementSW(testKey, 1000, 1, Date.now());
      await this.store.del(testKey);

      return {
        status: 'healthy',
        latency: Date.now() - start,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        latency: Date.now() - start,
        timestamp: new Date().toISOString(),
      };
    }
  }
}
```

### 8. **Add Request Context**

```typescript
// context/RequestContext.ts
export class RequestContext {
  private data = new Map<string, any>();

  constructor(
    public readonly request: IncomingRequest,
    public readonly startTime: number = Date.now(),
  ) {}

  set(key: string, value: any): void {
    this.data.set(key, value);
  }

  get<T>(key: string): T | undefined {
    return this.data.get(key);
  }

  getDuration(): number {
    return Date.now() - this.startTime;
  }

  toJSON(): object {
    return {
      method: this.request.method,
      path: this.request.url,
      ip: getClientIp(this.request),
      duration: this.getDuration(),
      data: Object.fromEntries(this.data),
    };
  }
}
```

### 9. **Add Middleware Composition**

```typescript
// middleware/MiddlewareComposer.ts
export class MiddlewareComposer {
  static compose(...middlewares: RequestHandler[]): RequestHandler {
    return async (req, res, next) => {
      let index = 0;

      const dispatch = async (): Promise<void> => {
        if (index >= middlewares.length) {
          return next?.();
        }

        const middleware = middlewares[index++];
        await middleware(req, res, dispatch);
      };

      return dispatch();
    };
  }
}

// Usage
const composed = MiddlewareComposer.compose(loggingMiddleware, rateLimitMiddleware, authMiddleware);
```

### 10. **Add Testing Utilities**

```typescript
// test-utils/RateLimitTestUtils.ts
export class RateLimitTestUtils {
  static async simulateRequests(
    limiter: RateLimitRequest,
    count: number,
    delay: number = 0,
  ): Promise<RateLimitResult[]> {
    const results = [];

    for (let i = 0; i < count; i++) {
      if (delay > 0 && i > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      const result = await limiter.incrementSW(`test-key-${i}`, Date.now());
      results.push(result);
    }

    return results;
  }

  static createMockRequest(overrides?: Partial<IncomingRequest>): IncomingRequest {
    return {
      method: 'GET',
      url: '/test',
      originalUrl: '/test',
      headers: {},
      ip: '127.0.0.1',
      ...overrides,
    } as IncomingRequest;
  }

  static createMockResponse(): GatewayResponse {
    const headers: Record<string, string> = {};

    return {
      headersSent: false,
      setHeader: (name: string, value: string | number) => {
        headers[name] = value.toString();
      },
      getHeaders: () => headers,
    } as unknown as GatewayResponse;
  }
}
```

## 📦 NPM Scripts to Add

```json
{
  "scripts": {
    "test:coverage": "vitest run --coverage",
    "test:watch": "vitest watch",
    "test:integration": "HAS_REDIS=1 vitest run __tests__/integration",
    "lint": "eslint src --ext .ts",
    "lint:fix": "eslint src --ext .ts --fix",
    "type-check": "tsc --noEmit",
    "validate": "pnpm lint && pnpm type-check && pnpm test",
    "benchmark": "node benchmarks/rate-limit.bench.js",
    "docs": "typedoc --out docs src/index.ts"
  }
}
```

## 🔍 Performance Optimizations

### 1. **Cache Compiled Routes**

```typescript
private routeCache = new Map<string, CompiledRoute>();

private compileRoute(route: RouteType): CompiledRoute {
  const key = `${route.method}:${route.path}`;

  if (this.routeCache.has(key)) {
    return this.routeCache.get(key)!;
  }

  const compiled = {
    ...route,
    regex: route.path instanceof RegExp
      ? route.path
      : new RegExp(`^${route.path.replace(/:\w+/g, '([^/]+)')}$`),
    methodLower: route.method.toLowerCase(),
  };

  this.routeCache.set(key, compiled);
  return compiled;
}
```

### 2. **Connection Pooling**

```typescript
export class RedisConnectionPool {
  private pool: RedisClient[] = [];
  private currentIndex = 0;

  constructor(
    private config: RedisConfig,
    private poolSize: number = 5,
  ) {
    this.initializePool();
  }

  private initializePool(): void {
    for (let i = 0; i < this.poolSize; i++) {
      this.pool.push(new RedisClient(this.config));
    }
  }

  getConnection(): RedisClient {
    const connection = this.pool[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.poolSize;
    return connection;
  }

  async closeAll(): Promise<void> {
    await Promise.all(this.pool.map((conn) => conn.quit()));
  }
}
```

## 📊 Monitoring Dashboard Config

```typescript
// monitoring/dashboard.ts
export const rateLimitDashboard = {
  metrics: [
    {
      name: 'Request Rate',
      query: 'rate(rate_limit_requests_total[5m])',
      type: 'line',
    },
    {
      name: 'Block Rate',
      query: 'rate(rate_limit_requests_total{status="blocked"}[5m])',
      type: 'line',
      alert: {
        threshold: 0.1, // Alert if > 10% blocked
        duration: '5m',
      },
    },
    {
      name: 'P99 Latency',
      query: 'histogram_quantile(0.99, rate_limit_operation_duration_seconds)',
      type: 'gauge',
      unit: 'ms',
    },
    {
      name: 'Redis Errors',
      query: 'rate(rate_limit_errors_total{type="redis"}[5m])',
      type: 'counter',
      alert: {
        threshold: 1,
        duration: '1m',
      },
    },
  ],
};
```

These improvements can be implemented incrementally without breaking existing functionality!
