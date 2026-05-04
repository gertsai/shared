# Цепочка выполнения запроса в @gerts/api-rlr

## 1. Точка входа: RLRMiddleware

```typescript
// src/index.ts
RLRMiddleware(options) → RequestHandler
```

Пользователь вызывает `RLRMiddleware` с опциями конфигурации.

### Два пути выполнения:

#### A. Новая модульная архитектура (если `useModularArchitecture: true`)

```
RLRMiddleware
  ↓
MiddlewareFactory.create(options)
  ↓
[Валидация конфигурации]
  ↓
[Создание/получение Redis store]
  ↓
AdapterFactory.create(store, options)
  ↓
[Создание адаптера: Typed/Resilient/Standard]
  ↓
new RateLimiter(adapter, options)
  ↓
new RateLimitMiddleware(limiter, options)
  ↓
middleware.createMiddleware()
```

#### B. Классическая архитектура (по умолчанию)

```
RLRMiddleware
  ↓
new RateLimitRequest(options)
  ↓
middleware property
```

## 2. Обработка HTTP запроса

### Новая архитектура:

```typescript
// Middleware function
async (request, response, next) => {
  // 1. Проверка skip
  if (config.skip) return next();

  // 2. Извлечение IP
  const ip = getClientIp(request);

  // 3. Проверка лимита
  const decision = await limiter.checkLimit(request);

  // 4. Установка заголовков
  setHeaders(response, decision.info, decision.strategy);

  // 5. Принятие решения
  if (decision.allowed) {
    return next();
  } else {
    return next(new RateLimitError());
  }
};
```

## 3. Проверка лимита (RateLimiter.checkLimit)

```typescript
checkLimit(request) {
  // 1. Создание контекста
  const context = new RequestContext(request)

  // 2. Определение субъекта (IP/API key/User ID)
  const subject = resolveSubject(request, context)

  // 3. Нормализация пути
  const path = pathNormalizer.normalize(request.url)

  // 4. Проверка белого списка
  if (isWhitelisted(subject)) return ALLOWED

  // 5. Поиск маршрута
  const routeMatch = routeResolver.resolve(request)

  // 6. Определение лимитов
  const limits = resolveLimits(request, routeMatch?.route)

  // 7. Генерация ключа bucket
  const bucketId = generateBucketId(method, path, routeMatch)
  const key = keyGenerator.generateBucketKey(subject, bucketId)

  // 8. Выполнение стратегии
  const strategy = strategyFactory.get(limits.strategy)
  const result = await strategy.execute({
    key, limit, timeFrame, now, burst
  })

  // 9. Возврат решения
  return {
    allowed: result.allow,
    info: { limit, timeFrame, totalHits, remainingHits },
    context,
    strategy
  }
}
```

## 4. Выполнение стратегии

### Sliding Window Strategy:

```typescript
execute(args) {
  // Вызов Redis через адаптер
  const values = await adapter.incrementSW(
    key, timeFrame, limit, now
  )

  // values = [allow, hits, ttl]
  return {
    allow: values[0] === 1,
    totalHits: values[1],
    remainingHits: Math.max(0, limit - values[1]),
    expiryTime: values[2]
  }
}
```

### GCRA Strategy:

```typescript
execute(args) {
  // Вызов Redis через адаптер
  const out = await adapter.gcraCheck(
    key, timeFrame, limit, burst, now
  )

  // out = [allow, remaining, retryAfter]
  return {
    allow: out[0] === 1,
    totalHits: limit - out[1],
    remainingHits: out[1],
    expiryTime: out[2]
  }
}
```

## 5. Взаимодействие с Redis

### Стандартный адаптер (RedisAdapter):

```typescript
incrementSW(key, timeFrame, limit, now) {
  // Прямой вызов Lua скрипта
  return store.incrementSW(key, timeFrame, limit, now)
}
```

### Отказоустойчивый адаптер (ResilientRedisAdapter):

```typescript
incrementSW(key, timeFrame, limit, now) {
  try {
    return await executeWithResilience(async () => {
      // Retry policy
      // Circuit breaker
      const result = await store.incrementSW(key, timeFrame, limit, now)

      // Кэширование результата
      cacheResult(cacheKey, result)
      return result
    })
  } catch (error) {
    // Fallback стратегия
    return handleFailure(error, cacheKey, params, 'sliding_window')
  }
}
```

### Типизированный адаптер (TypedRedisAdapter):

```typescript
incrementSW(key, timeFrame, limit, now) {
  // Использование TypedLuaScriptManager
  const result = await TypedLuaScriptManager.executeSlidingWindow(
    store, key, timeFrame, limit, now
  )

  // Полная типизация результата
  return [result[0], result[1], result[2]]
}
```

## 6. Lua скрипты в Redis

### limitSlightWindowMain.lua:

```lua
-- KEYS[1] = key
-- ARGV[1] = timeFrame
-- ARGV[2] = limit
-- ARGV[3] = now

-- Удаление старых записей
redis.call('ZREMRANGEBYSCORE', KEYS[1], 0, now - timeFrame)

-- Добавление текущего запроса
redis.call('ZADD', KEYS[1], now, now .. ':' .. math.random())

-- Подсчет запросов в окне
local hits = redis.call('ZCARD', KEYS[1])

-- Установка TTL
redis.call('EXPIRE', KEYS[1], math.ceil(timeFrame / 1000))

-- Возврат результата
local allow = hits <= limit and 1 or 0
return { allow, hits, timeFrame }
```

### limitGcra.lua:

```lua
-- GCRA (Generic Cell Rate Algorithm)
-- Более сложная логика с учетом burst

-- Вычисление TAT (Theoretical Arrival Time)
-- Проверка burst capacity
-- Обновление состояния
-- Возврат [allow, remaining, retryAfter]
```

## 7. Обработка ошибок

### Уровни обработки:

1. **Redis уровень**:
   - Retry policy (повторные попытки)
   - Circuit breaker (защита от каскадных сбоев)
   - Fallback стратегии (allow/deny/cache)

2. **Middleware уровень**:
   - failOpenOnStoreError (пропускать при ошибках)
   - Логирование ошибок

3. **Application уровень**:
   - RateLimitError для превышения лимита
   - Общие ошибки для системных сбоев

## 8. Установка заголовков ответа

### Draft-6 заголовки:

```
X-RateLimit-Policy: 60;w=60;policy="sliding_window"
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 45
X-RateLimit-Bucket: get:/api/users
X-RateLimit-Reset: 1234567890
```

### Draft-7 заголовки:

```
RateLimit-Policy: 60;w=60
RateLimit-Limit: 60
RateLimit-Remaining: 45
RateLimit-Reset: 15
```

## Преимущества новой архитектуры

1. **Модульность**: Каждый компонент имеет единственную ответственность
2. **Отказоустойчивость**: Защита от сбоев Redis
3. **Типобезопасность**: Полная типизация на всех уровнях
4. **Гибкость**: Легко добавлять новые стратегии и адаптеры
5. **Производительность**: Кэширование и оптимизация запросов
6. **Обратная совместимость**: Старый код продолжает работать

## Точки расширения

- **Новые стратегии**: Реализовать интерфейс `RateLimitStrategy`
- **Новые адаптеры**: Реализовать интерфейс `StorageAdapter`
- **Кастомные резолверы**: `bucketKeyResolver`, `limitsResolver`
- **Дополнительные хранилища**: Не только Redis (MongoDB, PostgreSQL)
