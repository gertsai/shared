• Находки

  1. api-core сейчас ведёт себя как приложение, а не как библиотека: импорт корня автоматически грузит .env через packages/api-core/src/index.ts:4. Для reusable platform package это плохая граница, потому
     что любой consumer получает скрытый side effect на старте процесса.
  2. У api-core сломан packaging contract: в packages/api-core/package.json:13 он помечен как MIT и private: true, хотя репозиторий описан как Apache/public monorepo. Параллельно публичные типы
     ApiControllerConfigOptions экспортируют PubSub из @google-cloud/pubsub в packages/api-core/src/lib/controller/types.ts:3, но сам пакет держит @google-cloud/pubsub только в devDependencies в packages/
     api-core/package.json:50. Для публикации это неправильная зависимость.
  3. api-core создаёт облачный логгер на module-load даже когда он не нужен: packages/api-core/src/moleculer/moleculerConfig.template.ts:13. Это уже проявилось при тесте api-core как MetadataLookupWarning
     на запрос к 169.254.169.254. Такого кода в базовом shared-пакете быть не должно; инициализация должна быть lazy и opt-in.
  4. api-rlr не до конца “чистый” как отдельный пакет. Runtime-код импортирует ioredis в packages/api-rlr/src/client/rlr.ts:5, но ioredis и moleculer-web сидят только в devDependencies в packages/api-rlr/
     package.json:52. Одновременно пакет жёстко завязан на @gertsai/api-core через APIError/ResponseCode в packages/api-rlr/src/utils/validations.ts:3 и packages/api-rlr/src/errors/RateLimitError.ts:1. Для
     platform-grade limiter это лишняя связность.
  5. m9s-example в целом hexagonal и сделан заметно чище, чем средний example: domain и application чистые, transport thin, composition вынесен. Но есть горизонтальная связность между use case’ами: search
     reuse’ит PermissionDeniedError из ingest в examples/m9s-example/src/application/SearchDocumentsUseCase.ts:5 и examples/m9s-example/src/services/search/src/actions/search-query.action.ts:19. Это надо
     вынести в отдельный shared application/domain error.
  6. У example есть лишний dependency noise: по текущему исходному графу @gertsai/collection и @gertsai/utils из examples/m9s-example/package.json:24 в коде не участвуют как реальные импорты. Для
     “reference implementation” это размывает сообщение, какие пакеты действительно нужны.

  Вывод по архитектуре

  api-core не стоит делать центром всей будущей platform. По факту это Node + Moleculer + HTTP gateway + BullMQ + partly PubSub adapter layer. Для вашей цели “language agnostic AI platform” я бы развёл
  так:

  - platform-core: нейтральные контракты и модели. Pipeline step, task/job state, event envelope, workflow signal model, auth context, trace/correlation IDs, chunk/embed/search contracts.
  - runtime adapters: api-moleculer, позже api-fastapi, api-go, worker-rust и т.д.
  - infra adapters: Redis, NATS, OpenFGA, vector stores, LLM providers.
  - examples: показывают composition, а не диктуют core abstractions.

  Channels / Workflows

  channels уже частично интегрированы в api-core через setChannels(...) и прокидку channels в service schema в packages/api-core/src/lib/controller/ApiController.class.ts:423. Это нормальный уровень
  интеграции: тонкий passthrough без захвата domain model.

  workflows я бы пока не встраивал глубоко в api-core. Причины простые:

  - сильная сторона channels: durable async messaging, consumer groups, retry, DLQ, multiple adapters;
  - сильная сторона workflows: long-running/idempotent orchestration, replay, signals, human-in-the-loop;
  - но официальный @moleculer/workflows сам помечен как work-in-progress, с осторожностью для production: https://www.npmjs.com/package/@moleculer/workflows
  - @moleculer/channels выглядит зрелее как transport primitive: https://github.com/moleculerjs/moleculer-channels

  То есть да, это может стать “единой мощной системой”, но только если api-core станет не “системой”, а Node-specific adapter над более нейтральным platform core.

  Проверка

  pnpm --filter @gertsai/api-core test прошёл. pnpm --filter @gertsai-examples/m9s-example typecheck тоже прошёл. Код я пока не менял.

  Следующим ходом могу сразу сделать практический cleanup-пакет:

  1. почистить зависимости и packaging metadata,
  2. вынести общие ошибки/контракты,
  3. разрезать api-core на platform-neutral и moleculer-specific части,
  4. затем обновить example и документационный каркас под эту целевую архитектуру.



  Как я буду делать 3:
 
   Сначала не буду сразу создавать новый пакет и ломать импорты. Сделаю это в два прохода.
 
   Фаза A: логическое разделение без breaking changes
 
   - Внутри api-core разделю код на 3 зоны:
   - contracts/: APIError, ResponseCode, envelope/response types, общие API-контракты.
   - runtime/moleculer/: ApiController, gateway templates, createApiService, createOpenApiService, createMoleculerConfig, BullMQ, channels/workflows integration.
   - runtime/node/: всё, что привязано к process.env, логгерам, lazy config loading.
   - Корневой экспорт @gertsai/api-core временно оставлю совместимым.
   - Добавлю новые subpath exports:
   - @gertsai/api-core/contracts
   - @gertsai/api-core/moleculer
 
   Это даст чистую границу сразу, без массовой миграции.
 
   Что конкретно переедет
 
   - В contracts:
       - src/lib/error/*
       - src/lib/apiResponse/*
       - src/lib/envelope/*
       - часть чистых типов из src/lib/common/*
   - В moleculer:
       - src/lib/controller/*
       - src/moleculer/*
       - src/lib/oauth/*
       - typia/query coercion helper’ы, если они реально нужны только transport layer
   - loadConfig из src/project-config/index.ts не считаю language-agnostic core. Либо уедет в runtime/node, либо вообще в utils.
 
   Фаза B: фактическое выделение пакета
 
   - После того как example и внутренние импорты переедут на subpath’ы, можно вынести moleculer-часть в отдельный пакет, почти механически:
   - @gertsai/api-moleculer или @gertsai/runtime-moleculer
   - @gertsai/api-core тогда станет либо contracts-only пакетом, либо compatibility facade на переходный период
 
   Я бы делал именно так, потому что это минимизирует риск и сохраняет рабочий example на каждом шаге.
 
   По workflows
   Да, принимаю это как проектное решение: считаем workflows production-ready и закладываем их сразу как first-class capability.
 
   Но архитектурно я всё равно не помещу workflows в neutral core. Я встрою их в moleculer runtime слой:
 
   - общий runtime API для actions / queues / channels / workflows
   - optional registration surface в стиле controller.setWorkflows(...) или controller.registerWorkflow(...)
   - optional middleware wiring в broker config factory
 
   Что это даст:
 
   - в Node/Moleculer у вас получится единая система orchestration: sync actions + durable queues + channels + workflows
   - при этом language-agnostic цель не ломается, потому что workflow contract и pipeline model можно потом реализовать поверх Go/Rust/Python runtime отдельно
 
   Порядок работ теперь такой
 
   1. Почищу зависимости и metadata.
   2. Вынесу neutral contracts/errors.
   3. Разрежу api-core по схеме выше с compatibility exports.
   4. Обновлю example под новые границы, включая workflows как first-class runtime path.
   5. Обновлю README/архитектурные заметки под platform-first модель.
 
   Если это направление подходит, следующим сообщением начну уже правки.


   Ключевое решение
   
     Нам нужна не “чистая Moleculer-библиотека”, а слоистая platform:
   
     1. @gertsai/core или будущий @gertsai/platform-core
        Это языконезависимые понятия и контракты: session, tenant, trace, envelope, error model, task/job state, workflow contract, event envelope, AI pipeline contracts, document/chunk/embed/search
        contracts.
     2. @gertsai/api-core
        Я бы пока трактовал как API contract layer, но сейчас он смешан с runtime. В нём допустимы response envelope, error codes, validation contracts, OpenAPI contract helpers. Недопустимо держать там
        BullMQ, Moleculer, Google PubSub, .env side effects и конкретный gateway runtime как “core”.
     3. @gertsai/api-moleculer или @gertsai/runtime-moleculer
        Вот сюда в итоге должны уйти ApiController, createApiService, createMoleculerConfig, BullMQ queues, channels, workflows, moleculer-web gateway, repl, broker lifecycle.
     4. @gertsai/api-rlr
        Rate limiter должен быть самостоятельным infra package. Сейчас он слишком привязан к api-core и moleculer-web. Правильнее иметь core limiter engine + adapters: Moleculer/Express/Fastify/FastAPI потом
        отдельно.
     5. examples/m9s-example
        Должен стать reference blueprint: hexagonal AI pipeline, где domain/application ничего не знают про Moleculer, queues, workflows, HTTP, OpenFGA, Redis. Сейчас он близко к этому, но надо убрать мелкие
        нарушения и dependency noise.
   
     Про Workflows
   
     Принимаем как production-ready для нашей платформы. Но это не значит, что он должен попасть в neutral core. Правильная позиция: workflows становятся first-class capability в runtime-moleculer.
   
     То есть в Node/Moleculer runtime должны быть четыре равноправные поверхности:
   
     - actions: sync request/response API
     - queues: background jobs
     - channels: durable events
     - workflows: long-running orchestration с replay/signals/state
   
     Но platform core должен описывать саму идею workflow нейтрально: WorkflowDefinition, WorkflowRun, WorkflowSignal, WorkflowState, WorkflowStepResult. Moleculer workflows будет одной реализацией.
   
     Как делать шаг 3 аккуратно
   
     Я бы не начинал с физического переноса файлов. Сначала сделать “логическое разделение” внутри текущего пакета:
   
     1. Добавить subpath exports:
        @gertsai/api-core/contracts
        @gertsai/api-core/moleculer
     2. Разложить barrel exports:
        contracts экспортирует errors, response codes, envelope, pure API types.
        moleculer экспортирует ApiController, Moleculer templates, queue/channel/workflow runtime helpers.
     3. Корневой @gertsai/api-core оставить совместимым на переходный период.
     4. Обновить example, чтобы он импортировал runtime-вещи из @gertsai/api-core/moleculer, а контрактные вещи из @gertsai/api-core/contracts.
     5. Только после этого физически выделять @gertsai/runtime-moleculer.
   
     Так мы увидим реальные границы по импортам без большого одномоментного переноса.
   
     Что я бы делал первым коммитом
   
     Первый практический этап должен быть маленьким и проверяемым:
   
     1. Исправить package hygiene: api-core license/private, убрать .env side effect из root import, сделать Google logging lazy.
     2. Добавить contracts и moleculer barrel exports без переноса логики.
     3. Вынести shared PermissionDeniedError в example из ingest use case в общий application/domain error.
     4. Убрать лишние deps из example или явно использовать/документировать, если они нужны как демонстрация.
     5. Добавить docs/ADR: Platform Runtime Boundaries, где зафиксировать: neutral contracts отдельно, Moleculer runtime отдельно, workflows production-ready capability.
   
     После этого уже можно начинать второй этап: registerWorkflow / setWorkflows в ApiController, middleware config helpers для workflows, и миграция example на эту поверхность.




     рочитал именно /Users/explosovebit/Work/GertsHub/docs/drafts/{one,two,three}.md и сопоставил с текущим shared.
     
       Главный вывод
       shared сейчас не готов быть фундаментом для GertsHub/GERTS OSS/runtime как “единой мощной системы”. Он уже содержит хорошие куски: ApiController, queue/BullMQ, setChannels, m9s-example с hexagonal
       layout, channels и workflows. Но пока это набор библиотек и пример, а не полноценный backend-platform-kit.
     
       В drafts целевая модель шире: Hub = control-plane/marketplace/OntologyOps, Runtime = consumer pinned bundles. Для этого shared должен стать слоем контрактов, модульной сборки и Moleculer runtime-
       инфраструктуры.
     
       Что нужно сделать в shared
     
       1. Сначала зафиксировать platform contracts: package manifest, bundle manifest, manifest.lock, validation reports, semantic diff, tenant installation/update/rollback, event envelope, GSP/GTP protocol
          frames. Это лучше как @gertsai/protocol или @gertsai/protocol-types, не внутри api-core.
       2. Реализовать YAML module system из ADR: @gertsai/module-spec + @gertsai/module-loader. Это уже правильно описано в .forgeplan/adrs/ADR-001-module-composition-framework-gerts-module-yaml-module-loader-
          yaml-driven.md:44: gerts-module.yaml для модулей и gerts-app.yaml для deployment composition.
       3. Разделить api-core: сейчас он слишком широкий и имеет side-effect import 'dotenv/config' в packages/api-core/src/index.ts:4. Нужно отделить чистые контракты/errors/envelope от Moleculer runtime,
          queue, oauth, config и OpenAPI. Иначе любой пакет тянет лишние зависимости.
       4. Сделать Moleculer runtime-пакет: условно @gertsai/runtime-moleculer или @gertsai/moleculer-kit. Туда должны уйти channels, workflows, BullMQ, config, observability, tenant context, service bootstrap,
          S2S auth, health, tracing.
       5. Workflows можно считать production-ready направлением, но не оставлять их как ручной plain service в примере. Сейчас m9s-example подключает workflow вручную в examples/m9s-example/src/index.ts:50.
          Нужно дать платформенный API: controller.setWorkflows(...) или module-loader declaration exposes.workflows.
       6. Channels уже частично есть через setChannels в packages/api-core/src/lib/controller/ApiController.class.ts:430, но не хватает typed event envelope, idempotency keys, DLQ policy, deferred publisher/
          outbox и naming convention. Для Hub это критично: release/build/install/update должны быть event-driven.
       7. Добавить инфраструктурные adapters/packages для Hub: git-client для Gitea/GitLab, artifact-client для S3/MinIO/checksums/signatures, rdf-client для Fuseki/Jena named graphs/SPARQL, database как
          agnostic Postgres client, observe, tenant, config, auth-moleculer.
       8. Почистить package hygiene: api-core помечен private: true и MIT в packages/api-core/package.json:13, хотя repo заявлен как Apache-2.0 OSS; CLAUDE.md говорит про 13 пакетов, но фактически их 14 с api-
          rlr.
     
       Hexagonal
       Hexagonal подходит очень хорошо, но только если сделать его не “стилем папок”, а платформенным правилом. Для GertsHub каждый bounded context должен иметь domain/application без Moleculer/Jena/Gitea/
       MinIO/OpenFGA imports. Все внешнее только через ports/adapters. Workflows должны жить в application orchestration layer, не в domain.
     
       Порядок я бы сделал такой: сначала protocol-types + module-spec, потом module-loader, потом вынос Moleculer runtime/channels/workflows из api-core, потом refactor m9s-example на YAML, потом adapters для
       Hub (database, git-client, artifact-client, rdf-client). Код пока не правил, это аудит и план по drafts.
