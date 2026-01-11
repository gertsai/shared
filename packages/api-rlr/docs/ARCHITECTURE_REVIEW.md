# Архитектурный обзор @orchdev/api-rlr

## Резюме

Пакет rate limiting middleware имеет хорошую базовую архитектуру, но требует улучшений в области отказоустойчивости, типизации и разделения ответственности.

## Сильные стороны

### ✅ Модульность

- Хорошее разделение на сервисы: PathNormalizer, KeyGenerator, RouteResolver
- Паттерн Strategy для разных алгоритмов rate limiting
- Adapter pattern для работы с хранилищем

### ✅ Производительность

- Lua скрипты для атомарных операций
- Singleton pattern для Redis соединений
- Кэширование загруженных скриптов

### ✅ Гибкость

- Поддержка per-route конфигурации
- Кастомные резолверы для bucket keys и limits
- Два алгоритма: GCRA и Sliding Window

## Проблемы и рекомендации

### 🔴 Критические проблемы

#### 1. Недостаточная отказоустойчивость

**Проблема:** Простая реализация `failOpenOnStoreError`, нет retry и circuit breaker.

**Рекомендация:** Реализовать полноценную стратегию resilience:

```typescript
interface ResilienceOptions {
  retryAttempts: number;
  retryDelay: number;
  circuitBreakerThreshold: number;
  circuitBreakerTimeout: number;
  fallbackStrategy: 'allow' | 'deny' | 'cache';
}

class ResilientRedisAdapter {
  private circuitBreaker: CircuitBreaker;
  private retryPolicy: RetryPolicy;
  private cache: LRUCache<string, RateLimitInfo>;

  async executeWithResilience<T>(operation: () => Promise<T>): Promise<T> {
    return this.circuitBreaker.execute(() => this.retryPolicy.execute(operation));
  }
}
```

#### 2. Слабая типизация

**Проблема:** Множество `as unknown as` кастов, использование `@ts-ignore`.

**Рекомендация:** Улучшить типизацию:

```typescript
// Вместо as unknown as
function createTypedStore(store: Redis): RLRRedis {
  return Object.assign(store, {
    incrementSW: createIncrementSW(store),
    gcraCheck: createGcraCheck(store),
  });
}

// Типизированные Lua результаты
type LuaResult<T> = T extends readonly [...infer U] ? U : never;
type SWResult = LuaResult<[allow: 0 | 1, hits: number, ttl: number]>;
```

#### 3. Нарушение Single Responsibility

**Проблема:** Класс `RateLimitRequest` отвечает за слишком много.

**Рекомендация:** Разделить на несколько классов:

```typescript
// Оркестратор
class RateLimiter {
  constructor(
    private store: StoreAdapter,
    private strategyFactory: StrategyFactory,
    private routeResolver: RouteResolver,
    private headerService: HeaderService,
  ) {}

  async checkLimit(request: Request): Promise<LimitResult> {
    // Только координация
  }
}

// Middleware фабрика
class MiddlewareFactory {
  static create(options: RateLimitOptions): Middleware {
    const limiter = new RateLimiter(/* deps */);
    return new RateLimitMiddleware(limiter, options);
  }
}
```

### ⚠️ Важные улучшения

#### 1. Абстракция хранилища

**Проблема:** Прямая зависимость от ioredis.

**Рекомендация:** Создать абстракцию:

```typescript
interface StorageProvider {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttl?: number): Promise<void>;
  eval(script: string, keys: string[], args: any[]): Promise<any>;
}

class RedisProvider implements StorageProvider {
  /* ... */
}
class MemoryProvider implements StorageProvider {
  /* ... */
}
```

#### 2. Улучшение тестирования

**Проблема:** Тесты пропускаются без Redis, нет мокирования времени.

**Рекомендация:**

- Использовать in-memory Redis (ioredis-mock)
- Добавить time provider для тестирования
- Увеличить покрытие edge cases

#### 3. Метрики и мониторинг

**Проблема:** Базовые метрики, нет интеграции с системами мониторинга.

**Рекомендация:** Добавить метрики:

```typescript
interface Metrics {
  rateLimitHits: Counter;
  rateLimitMisses: Counter;
  latency: Histogram;
  errors: Counter;
}

class MetricsCollector {
  constructor(private backend: PrometheusBackend) {}

  recordHit(bucket: string, allowed: boolean): void {
    // Запись метрик
  }
}
```

## План миграции

### Фаза 1: Улучшение типизации (1-2 недели)

- [ ] Убрать все `as unknown as` касты
- [ ] Типизировать Lua результаты
- [ ] Добавить строгие типы для конфигурации

### Фаза 2: Resilience (2-3 недели)

- [ ] Реализовать retry policy
- [ ] Добавить circuit breaker
- [ ] Улучшить fallback стратегии

### Фаза 3: Рефакторинг архитектуры (3-4 недели)

- [ ] Разделить RateLimitRequest на несколько классов
- [ ] Создать абстракцию для хранилища
- [ ] Вынести middleware в отдельный модуль

### Фаза 4: Мониторинг (1-2 недели)

- [ ] Добавить Prometheus метрики
- [ ] Реализовать distributed tracing
- [ ] Улучшить health checks

## Заключение

Пакет имеет хорошую основу, но требует серьезных улучшений в области отказоустойчивости и архитектуры. Рекомендуется поэтапная миграция с приоритетом на критические проблемы.

## Примеры улучшенного кода

### Circuit Breaker Implementation

```typescript
class CircuitBreaker {
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  private failures = 0;
  private lastFailureTime?: number;

  constructor(
    private threshold: number,
    private timeout: number,
  ) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime! > this.timeout) {
        this.state = 'half-open';
      } else {
        throw new Error('Circuit breaker is open');
      }
    }

    try {
      const result = await operation();
      if (this.state === 'half-open') {
        this.state = 'closed';
        this.failures = 0;
      }
      return result;
    } catch (error) {
      this.failures++;
      this.lastFailureTime = Date.now();

      if (this.failures >= this.threshold) {
        this.state = 'open';
      }
      throw error;
    }
  }
}
```

### Improved Type Safety

```typescript
// Type-safe Lua script wrapper
class LuaScript<TArgs extends readonly any[], TResult> {
  constructor(
    private script: string,
    private sha?: string,
  ) {}

  async execute(store: Redis, keys: string[], args: TArgs): Promise<TResult> {
    try {
      if (this.sha) {
        return await store.evalsha(this.sha, keys.length, ...keys, ...args);
      }
      return await store.eval(this.script, keys.length, ...keys, ...args);
    } catch (error) {
      if (error.message.includes('NOSCRIPT')) {
        const result = await store.eval(this.script, keys.length, ...keys, ...args);
        this.sha = await store.script('LOAD', this.script);
        return result;
      }
      throw error;
    }
  }
}

// Usage
const gcraScript = new LuaScript<
  [timeFrame: number, limit: number, burst: number, now: number],
  [allow: 0 | 1, remaining: number, retryAfter: number]
>(GCRA_LUA_SCRIPT);

const result = await gcraScript.execute(store, [key], [60000, 100, 5, Date.now()]);
```
