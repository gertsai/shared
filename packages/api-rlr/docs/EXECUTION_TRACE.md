# Полная трассировка выполнения @api-rlr

## 📊 Обзор архитектур

В пакете существуют две архитектуры:

1. **Новая модульная** (по умолчанию с v0.2.0) - `useModularArchitecture: true`
2. **Legacy** - `useModularArchitecture: false` (deprecated)

---

## 🚀 НОВАЯ МОДУЛЬНАЯ АРХИТЕКТУРА (По умолчанию)

### 1️⃣ **Инициализация**

```typescript
// index.ts:11-40
RLRMiddleware(options)
  ↓
// index.ts:18 - Проверка использования новой архитектуры
if (options.useModularArchitecture !== false && process.env.RLR_MODULAR !== 'false')
  ↓
// index.ts:19 - Создание middleware через фабрику
MiddlewareFactory.create(options)
```

### 2️⃣ **MiddlewareFactory.create()**

```typescript
// middleware/MiddlewareFactory.ts:35-152
static create(options: RateLimitOptions)
  ↓
// MiddlewareFactory.ts:36-43 - Валидация конфигурации
const config = configValidator.validate(options)
  ↓
// MiddlewareFactory.ts:45-95 - Инициализация Redis store
const store = this.initializeStore(config)
  ↓
// MiddlewareFactory.ts:97-100 - Создание адаптера
const adapter = AdapterFactory.create(store, config)
  ↓
// MiddlewareFactory.ts:102-111 - Загрузка Lua скриптов
const incrementSW = fs.readFileSync('../scripts/limitSlightWindowMain.lua')
const gcra = fs.readFileSync('../scripts/limitGcra.lua')
  ↓
// MiddlewareFactory.ts:113-119 - Определение команд Redis
LuaScriptManager.ensureLuaScriptsDefined(store, { incrementSW, gcra })
  ↓
// MiddlewareFactory.ts:121-129 - Создание core компонентов
const pathNormalizer = new PathNormalizer()
const keyGenerator = new KeyGenerator(config)
const routeResolver = new RouteResolver(config.routes, pathNormalizer)
const strategyFactory = new StrategyFactory(adapter)
const debugger = new RateLimitDebugger(config)
  ↓
// MiddlewareFactory.ts:131-136 - Создание RateLimiter
const limiter = new RateLimiter({
  config, pathNormalizer, keyGenerator,
  routeResolver, strategyFactory, debugger
})
  ↓
// MiddlewareFactory.ts:138-141 - Создание middleware
const middleware = new RateLimitMiddleware(limiter, config)
  ↓
// MiddlewareFactory.ts:143-150 - Настройка graceful shutdown
this.setupGracefulShutdown(store, config.storeSingletonKey)
  ↓
return middleware.createMiddleware()
```

### 3️⃣ **AdapterFactory - Выбор адаптера**

```typescript
// adapters/AdapterFactory.ts:18-61
static create(store: RLRRedis, options: RateLimitOptions)
  ↓
// AdapterFactory.ts:19-36 - Проверка resilience
if (this.isResilienceEnabled(options))
  ↓ YES
  // AdapterFactory.ts:20-35 - Создание ResilientRedisAdapter
  const baseAdapter = this.createBaseAdapter(store, options)
  return new ResilientRedisAdapter(store, resilienceOptions)
  ↓ NO
// AdapterFactory.ts:38-60 - Проверка TypedScripts
if (this.isTypedScriptsEnabled(options))
  ↓ YES
  // AdapterFactory.ts:42 - TypedRedisAdapter
  return new TypedRedisAdapter(store)
  ↓ NO
  // AdapterFactory.ts:45 - Обычный RedisAdapter
  return new RedisAdapter(store)
```

### 4️⃣ **Обработка запроса**

```typescript
// middleware/RateLimitMiddleware.ts:25-150
middleware = (req, res, next) =>
  ↓
// RateLimitMiddleware.ts:26-36 - Извлечение IP
const ip = getClientIp(req) || 'unknown'
  ↓
// RateLimitMiddleware.ts:38-45 - Проверка whitelist
if (this.isWhitelisted(ip)) return next()
  ↓
// RateLimitMiddleware.ts:47-49 - Проверка skip
if (this.options.skip) return next()
  ↓
// RateLimitMiddleware.ts:51-60 - Вызов limiter
const decision = await this.limiter.checkLimit({
  method: req.method,
  url: req.url,
  ip,
  headers: req.headers
})
```

### 5️⃣ **RateLimiter.checkLimit()**

```typescript
// core/RateLimiter.ts:54-301
async checkLimit(context)
  ↓
// RateLimiter.ts:55-65 - Нормализация пути
const normalizedPath = this.pathNormalizer.normalize(context.url)
  ↓
// RateLimiter.ts:67-77 - Поиск маршрута
const routeMatch = this.routeResolver.resolve({
  method: context.method,
  url: normalizedPath
})
  ↓
// RateLimiter.ts:79-95 - Генерация bucket ID
const bucketId = this.generateBucketId(context, routeMatch)
  ↓
// RateLimiter.ts:97-110 - Генерация ключа
const key = this.keyGenerator.generate({
  prefix: this.config.prefix,
  bucketId,
  subject: this.resolveSubject(context)
})
  ↓
// RateLimiter.ts:112-125 - Определение лимитов
const limits = this.resolveLimits(context, routeMatch)
  ↓
// RateLimiter.ts:127-140 - Получение стратегии
const strategy = this.strategyFactory.create(limits.strategy)
  ↓
// RateLimiter.ts:142-165 - Выполнение стратегии
const result = await strategy.execute({
  key,
  limit: limits.limit,
  timeFrame: limits.timeFrame,
  burst: limits.burst || 3,
  useRedisTime: this.config.useRedisTime
})
  ↓
// RateLimiter.ts:167-180 - Формирование решения
return {
  allowed: result.allowed,
  totalHits: result.totalHits,
  remainingHits: result.remainingHits,
  resetTime: result.resetTime,
  limit: limits.limit,
  timeFrame: limits.timeFrame,
  strategy: limits.strategy,
  key
}
```

### 6️⃣ **Выполнение стратегии**

#### **SlidingWindowStrategy**

```typescript
// strategies/SlidingWindowStrategy.ts:13-50
async execute(params)
  ↓
// SlidingWindowStrategy.ts:19-25 - Получение времени
const currentTime = params.useRedisTime
  ? await this.adapter.getRedisTime()
  : Date.now()
  ↓
// SlidingWindowStrategy.ts:27-32 - Вызов Lua скрипта
const result = await this.adapter.incrementSW(
  params.key,
  params.limit,
  currentTime,
  params.timeFrame
)
  ↓
// SlidingWindowStrategy.ts:34-49 - Обработка результата
return {
  allowed: result[0] === 1,
  totalHits: result[1],
  remainingHits: result[2],
  resetTime: result[3]
}
```

#### **GCRAStrategy**

```typescript
// strategies/GCRAStrategy.ts:13-50
async execute(params)
  ↓
// GCRAStrategy.ts:19-25 - Получение времени
const currentTime = params.useRedisTime
  ? await this.adapter.getRedisTime()
  : Date.now()
  ↓
// GCRAStrategy.ts:27-33 - Вызов Lua скрипта
const result = await this.adapter.gcraCheck(
  params.key,
  params.timeFrame,
  params.limit,
  params.burst,
  currentTime
)
  ↓
// GCRAStrategy.ts:35-49 - Обработка результата
return {
  allowed: result[0] === 1,
  totalHits: params.limit - result[1],
  remainingHits: result[1],
  resetTime: result[2]
}
```

### 7️⃣ **Redis Adapter - Выполнение Lua**

```typescript
// adapters/RedisAdapter.ts:13-45
async incrementSW(key, limit, currentTime, timeFrame)
  ↓
// RedisAdapter.ts:19-24 - Вызов Redis команды
return this.store.incrementSW(key, limit, currentTime, timeFrame)
  ↓
// Выполняется Lua скрипт limitSlightWindowMain.lua в Redis
  ↓
// Возвращает [allow, totalHits, remaining, reset]
```

### 8️⃣ **Обратный путь - Обработка результата**

```typescript
// middleware/RateLimitMiddleware.ts:62-95
// Получили decision от limiter
  ↓
// RateLimitMiddleware.ts:62-75 - Логирование
this.options.debugger?.logDecision(decision)
  ↓
// RateLimitMiddleware.ts:77-85 - Установка заголовков
this.setHeaders(res, decision)
  ↓
// RateLimitMiddleware.ts:87-95 - Принятие решения
if (decision.allowed)
  ↓ YES
  // RateLimitMiddleware.ts:88-90 - Пропуск запроса
  req.rateLimit = this.createRateLimitInfo(decision)
  return next()
  ↓ NO
  // RateLimitMiddleware.ts:92-94 - Блокировка
  return this.handleRateLimitExceeded(res, decision)
```

### 9️⃣ **Установка HTTP заголовков**

```typescript
// middleware/RateLimitMiddleware.ts:97-115
private setHeaders(res, decision)
  ↓
// RateLimitMiddleware.ts:98-100 - Проверка headersSent
if (res.headersSent) return
  ↓
// RateLimitMiddleware.ts:102-114 - Выбор версии draft
if (this.options.draftVersion === DraftVersionType.DRAFT7)
  ↓
  // client/headers.ts:50-85 - Draft7 заголовки
  setDraft7Headers(res, decision)
else
  ↓
  // client/headers.ts:14-48 - Draft6 заголовки
  setDraft6Headers(res, {
    limit: decision.limit,
    remaining: decision.remainingHits,
    reset: decision.resetTime,
    strategy: decision.strategy
  })
```

### 🔟 **Обработка превышения лимита**

```typescript
// middleware/RateLimitMiddleware.ts:117-135
private handleRateLimitExceeded(res, decision)
  ↓
// RateLimitMiddleware.ts:118-120 - Проверка headersSent
if (res.headersSent) return
  ↓
// RateLimitMiddleware.ts:122-125 - Установка статуса
res.statusCode = 429
  ↓
// RateLimitMiddleware.ts:127-130 - Установка Retry-After
res.setHeader('Retry-After', Math.ceil(decision.resetTime / 1000))
  ↓
// RateLimitMiddleware.ts:132-134 - Отправка ответа
res.end('Rate limit exceeded')
```

---

## 🔄 LEGACY АРХИТЕКТУРА (Deprecated)

### 1️⃣ **Инициализация Legacy**

```typescript
// index.ts:29-39
// Если useModularArchitecture: false
  ↓
// index.ts:31-37 - Предупреждение
console.warn('[RLR] Warning: Using legacy rate limiter...')
  ↓
// index.ts:38 - Создание RateLimitRequest
const { middleware } = new RateLimitRequest(options)
  ↓
// client/rlr.ts:55-185 - Конструктор
constructor(options)
  ↓
// rlr.ts:68-75 - Валидация
this.config = configValidator.validate(options)
  ↓
// rlr.ts:77-85 - Инициализация store
this.store = this.initStore()
  ↓
// rlr.ts:87-95 - Создание адаптера
this.adapter = AdapterFactory.create(this.store, this.config)
  ↓
// rlr.ts:97-105 - Загрузка Lua скриптов
this.store.defineCommand('incrementSW', ...)
this.store.defineCommand('gcraCheck', ...)
  ↓
// rlr.ts:107 - Загрузка increment скрипта
this.incrementFWScriptSha = this.loadIncrementFWScript()
```

### 2️⃣ **Обработка запроса в Legacy**

```typescript
// client/rlr.ts:217-350
middleware = async (req, res, next) =>
  ↓
// Похожая логика как в модульной архитектуре
// но все в одном классе без разделения
```

---

## 📈 Сравнение архитектур

| Аспект                         | Новая модульная     | Legacy                      |
| ------------------------------ | ------------------- | --------------------------- |
| **Разделение ответственности** | ✅ Отдельные классы | ❌ Монолит                  |
| **Тестируемость**              | ✅ Легко мокать     | ⚠️ Сложно                   |
| **Расширяемость**              | ✅ Легко добавлять  | ❌ Требует изменения класса |
| **Поддержка**                  | ✅ Активная         | ⚠️ Deprecated               |
| **Производительность**         | ✅ Оптимизирована   | ✅ Стабильная               |

---

## 🔍 Ключевые точки трассировки

### Точки входа:

1. `index.ts:RLRMiddleware()` - главная точка входа
2. `MiddlewareFactory.create()` - создание новой архитектуры
3. `RateLimitRequest.constructor()` - создание legacy

### Критические точки:

1. `RateLimiter.checkLimit()` - основная бизнес-логика
2. `Strategy.execute()` - выполнение алгоритма
3. `RedisAdapter.incrementSW/gcraCheck()` - взаимодействие с Redis

### Точки выхода:

1. `next()` - пропуск запроса
2. `res.end('Rate limit exceeded')` - блокировка
3. Ошибки - failOpen или reject

---

## 🎯 Выводы

1. **Новая архитектура полностью функциональна** и покрывает все кейсы legacy
2. **Четкое разделение ответственности** улучшает поддержку
3. **Все компоненты связаны** через dependency injection
4. **Lua скрипты изолированы** и могут быть заменены
5. **Полная обратная совместимость** сохранена
