# Architecture Improvements for @gerts/api-rlr

## 📊 Current Architecture Analysis

### Identified Issues

#### 1. **Monolithic Class Design** (Violation of Single Responsibility Principle)

- `RateLimitRequest` class has 600+ lines with multiple responsibilities:
  - Redis connection management
  - Request processing
  - Route matching
  - Headers management
  - Lua script loading
  - Key generation
  - Event handling

#### 2. **Tight Coupling**

- Direct dependency on Redis implementation
- No abstraction layer for storage
- Hard-coded path normalization logic
- Mixed business logic with infrastructure

#### 3. **Configuration Complexity**

- 20+ optional parameters in `RateLimitOptions`
- No validation or builder pattern
- Mixing global and route-specific settings

#### 4. **Testing Limitations**

- Hard to mock dependencies
- No integration tests for middleware
- Missing edge case coverage

## 🎯 Proposed Architecture Improvements

### 1. **Apply Domain-Driven Design with Clean Architecture**

```typescript
// Domain Layer
interface RateLimiter {
  check(context: RateLimitContext): Promise<RateLimitResult>;
}

interface RateLimitStrategy {
  execute(key: string, options: StrategyOptions): Promise<RateLimitResult>;
}

// Application Layer
interface RateLimitService {
  processRequest(request: Request): Promise<RateLimitDecision>;
}

// Infrastructure Layer
interface StorageAdapter {
  increment(key: string, window: number): Promise<CounterResult>;
  reset(key: string): Promise<void>;
}
```

### 2. **Refactor into Smaller, Focused Components**

```
src/
├── domain/
│   ├── entities/
│   │   ├── RateLimitContext.ts
│   │   ├── RateLimitResult.ts
│   │   └── BucketKey.ts
│   ├── strategies/
│   │   ├── Strategy.interface.ts
│   │   ├── SlidingWindowStrategy.ts
│   │   └── GCRAStrategy.ts
│   └── services/
│       └── RateLimiter.ts
├── application/
│   ├── RateLimitService.ts
│   ├── RouteResolver.ts
│   ├── BucketResolver.ts
│   └── HeadersManager.ts
├── infrastructure/
│   ├── storage/
│   │   ├── StorageAdapter.interface.ts
│   │   ├── RedisAdapter.ts
│   │   └── MemoryAdapter.ts
│   ├── middleware/
│   │   └── RateLimitMiddleware.ts
│   └── scripts/
│       └── LuaScriptManager.ts
└── config/
    ├── ConfigBuilder.ts
    └── ConfigValidator.ts
```

### 3. **Implement Strategy Pattern for Rate Limiting Algorithms**

```typescript
// Strategy Interface
export interface RateLimitStrategy {
  name: string;
  execute(context: StrategyContext): Promise<StrategyResult>;
  validateConfig(config: StrategyConfig): ValidationResult;
}

// Concrete Strategies
export class SlidingWindowStrategy implements RateLimitStrategy {
  name = LimiterStrategy.SLIDING_WINDOW;

  constructor(private storage: StorageAdapter) {}

  async execute(context: StrategyContext): Promise<StrategyResult> {
    // Implementation
  }
}

export class GCRAStrategy implements RateLimitStrategy {
  name = LimiterStrategy.GCRA;

  constructor(private storage: StorageAdapter) {}

  async execute(context: StrategyContext): Promise<StrategyResult> {
    // Implementation with burst support
  }
}

// Strategy Factory
export class StrategyFactory {
  private strategies = new Map<string, RateLimitStrategy>();

  register(strategy: RateLimitStrategy): void {
    this.strategies.set(strategy.name, strategy);
  }

  get(name: string): RateLimitStrategy {
    const strategy = this.strategies.get(name);
    if (!strategy) {
      throw new Error(`Unknown strategy: ${name}`);
    }
    return strategy;
  }
}
```

### 4. **Configuration Builder Pattern**

```typescript
export class RateLimitConfigBuilder {
  private config: Partial<RateLimitConfig> = {};

  withTimeFrame(ms: number): this {
    this.config.timeFrame = ms;
    return this;
  }

  withLimit(limit: number): this {
    this.config.limit = limit;
    return this;
  }

  withStrategy(strategy: LimiterStrategy): this {
    this.config.strategy = strategy;
    return this;
  }

  withBurst(burst: number): this {
    if (this.config.strategy !== LimiterStrategy.GCRA) {
      throw new Error('Burst is only applicable for GCRA strategy');
    }
    this.config.burst = burst;
    return this;
  }

  addRoute(route: RouteConfig): this {
    this.config.routes = this.config.routes || [];
    this.config.routes.push(route);
    return this;
  }

  build(): RateLimitConfig {
    return new ConfigValidator().validate(this.config);
  }
}

// Usage
const config = new RateLimitConfigBuilder()
  .withTimeFrame(60000)
  .withLimit(100)
  .withStrategy(LimiterStrategy.GCRA)
  .withBurst(5)
  .addRoute({
    path: '/api/webhooks',
    method: 'POST',
    limit: 10,
    timeFrame: 10000,
  })
  .build();
```

### 5. **Dependency Injection Container**

```typescript
export class RateLimitContainer {
  private services = new Map<string, any>();

  constructor() {
    this.registerDefaults();
  }

  private registerDefaults(): void {
    // Storage
    this.register('storage', () => new RedisAdapter(this.get('redis')));

    // Strategies
    this.register(
      LimiterStrategy.SLIDING_WINDOW,
      () => new SlidingWindowStrategy(this.get('storage')),
    );
    this.register(LimiterStrategy.GCRA, () => new GCRAStrategy(this.get('storage')));

    // Services
    this.register('routeResolver', () => new RouteResolver());
    this.register('bucketResolver', () => new BucketResolver());
    this.register('headersManager', () => new HeadersManager());

    // Main Service
    this.register(
      'rateLimiter',
      () =>
        new RateLimitService(
          this.get('storage'),
          this.get('routeResolver'),
          this.get('bucketResolver'),
          this.get('headersManager'),
        ),
    );
  }

  register(name: string, factory: () => any): void {
    this.services.set(name, factory);
  }

  get<T>(name: string): T {
    const factory = this.services.get(name);
    if (!factory) {
      throw new Error(`Service ${name} not found`);
    }
    return factory();
  }
}
```

### 6. **Improved Error Handling**

```typescript
export class RateLimitErrorHandler {
  private handlers = new Map<string, ErrorHandler>();

  constructor() {
    this.registerDefaultHandlers();
  }

  private registerDefaultHandlers(): void {
    this.register('REDIS_CONNECTION_ERROR', (error) => {
      // Log and fail-open if configured
      logger.error('Redis connection failed', error);
      return { allow: true, fallback: true };
    });

    this.register('INVALID_CONFIG', (error) => {
      // Configuration errors should fail-closed
      logger.error('Invalid configuration', error);
      throw new ConfigurationError(error.message);
    });

    this.register('RATE_LIMIT_EXCEEDED', (error) => {
      // Standard rate limit handling
      return {
        allow: false,
        retryAfter: error.retryAfter,
        headers: error.headers,
      };
    });
  }

  handle(error: Error): ErrorResult {
    const handler = this.handlers.get(error.constructor.name);
    if (handler) {
      return handler(error);
    }

    // Default handling
    logger.error('Unhandled error in rate limiter', error);
    throw error;
  }
}
```

### 7. **Metrics and Observability**

```typescript
export interface MetricsCollector {
  recordRequest(bucket: string, allowed: boolean): void;
  recordLatency(operation: string, duration: number): void;
  recordError(type: string): void;
}

export class PrometheusMetrics implements MetricsCollector {
  private requestCounter = new Counter({
    name: 'rate_limit_requests_total',
    help: 'Total rate limit requests',
    labelNames: ['bucket', 'status'],
  });

  private latencyHistogram = new Histogram({
    name: 'rate_limit_operation_duration_seconds',
    help: 'Rate limit operation duration',
    labelNames: ['operation'],
  });

  recordRequest(bucket: string, allowed: boolean): void {
    this.requestCounter.inc({
      bucket,
      status: allowed ? 'allowed' : 'blocked',
    });
  }

  recordLatency(operation: string, duration: number): void {
    this.latencyHistogram.observe({ operation }, duration / 1000);
  }
}
```

### 8. **Type-Safe Route Matching**

```typescript
export class RouteResolver {
  private compiled: CompiledRoute[] = [];

  compile(routes: RouteConfig[]): void {
    this.compiled = routes.map((route) => ({
      ...route,
      pathRegex: this.compilePath(route.path),
      methodLower: route.method.toLowerCase(),
    }));
  }

  resolve(request: Request): RouteMatch | null {
    const path = this.normalizePath(request.path);
    const method = request.method.toLowerCase();

    for (const route of this.compiled) {
      if (route.methodLower !== method) continue;

      const match = route.pathRegex.exec(path);
      if (match) {
        return {
          route,
          params: this.extractParams(match, route),
          bucket: this.generateBucket(route, match),
        };
      }
    }

    return null;
  }

  private normalizePath(path: string): string {
    // Centralized path normalization logic
    return path
      .toLowerCase()
      .replace(/\b[0-9a-fA-F-]{10,}\b/g, ':id')
      .replace(/\/reactions\/(.*)/, '/reactions/:reaction')
      .replace(/\/$/, '');
  }
}
```

### 9. **Testing Improvements**

```typescript
// Test Fixtures
export class RateLimitTestFixtures {
  static mockStorage(): StorageAdapter {
    return {
      increment: jest.fn().mockResolvedValue({ count: 1, ttl: 60000 }),
      reset: jest.fn().mockResolvedValue(undefined),
    };
  }

  static mockRequest(overrides?: Partial<Request>): Request {
    return {
      ip: '127.0.0.1',
      method: 'GET',
      path: '/api/test',
      headers: {},
      ...overrides,
    };
  }
}

// Integration Test Helper
export class RateLimitTestHelper {
  private container: RateLimitContainer;

  constructor() {
    this.container = new RateLimitContainer();
    this.container.register('storage', () => new MemoryAdapter());
  }

  async testScenario(scenario: TestScenario): Promise<TestResult> {
    const limiter = this.container.get<RateLimitService>('rateLimiter');
    const results = [];

    for (const request of scenario.requests) {
      const result = await limiter.processRequest(request);
      results.push(result);
    }

    return { results, metrics: this.getMetrics() };
  }
}
```

### 10. **Migration Path**

#### Phase 1: Refactor Core Components (2-3 sprints)

- Extract strategies into separate classes
- Implement storage adapter pattern
- Create configuration builder

#### Phase 2: Improve Testing (1-2 sprints)

- Add integration tests
- Implement test fixtures
- Increase coverage to 90%+

#### Phase 3: Add Observability (1 sprint)

- Implement metrics collection
- Add structured logging
- Create monitoring dashboards

#### Phase 4: Documentation & Examples (1 sprint)

- Update API documentation
- Create migration guide
- Add usage examples

## 📈 Benefits of These Improvements

1. **Maintainability**: Smaller, focused components are easier to understand and modify
2. **Testability**: Dependency injection and abstractions make testing straightforward
3. **Extensibility**: New strategies and storage adapters can be added without modifying core
4. **Performance**: Better caching and optimized path matching
5. **Reliability**: Improved error handling and fail-open capabilities
6. **Observability**: Built-in metrics and logging for production monitoring

## 🔧 Implementation Priority

1. **High Priority** (Immediate):
   - Strategy pattern implementation
   - Storage adapter abstraction
   - Configuration builder

2. **Medium Priority** (Next quarter):
   - Metrics and observability
   - Integration tests
   - Route resolver optimization

3. **Low Priority** (Future):
   - Additional storage adapters
   - Advanced caching strategies
   - Performance optimizations

## 📝 Architecture Decision Records (ADRs)

### ADR-001: Strategy Pattern for Rate Limiting

**Status**: Proposed
**Context**: Multiple rate limiting algorithms with different configurations
**Decision**: Use Strategy pattern to encapsulate algorithms
**Consequences**: Better extensibility, cleaner code, easier testing

### ADR-002: Storage Adapter Pattern

**Status**: Proposed
**Context**: Direct dependency on Redis limits flexibility
**Decision**: Introduce storage adapter interface
**Consequences**: Support for multiple storage backends, easier testing

### ADR-003: Configuration Builder

**Status**: Proposed
**Context**: Complex configuration with many optional parameters
**Decision**: Implement builder pattern for configuration
**Consequences**: Type-safe configuration, better validation, cleaner API
