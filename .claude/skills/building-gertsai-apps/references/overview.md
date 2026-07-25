# Architecture & mental model

## What & why

`m9s-example` is a hexagonal Moleculer.js application that consumes the
published `@gertsai/*` packages end-to-end on a deliberately tiny "ingest +
search" workload. It is the reference for how a real app wires the ecosystem
together, so the architecture is the lesson — not the feature set.

The mental model has **two orthogonal axes**:

1. **A hexagonal dependency rule.** Code flows in one direction:
   `domain/` → `application/` → `infrastructure/` → `services/`. There is a
   single composition root (`src/composition/infrastructure.ts`) that wires
   concrete adapters behind ports. `domain/` knows only the Shared Kernel
   (`@gertsai/errors`); `application/` knows only `domain/` (ports + entities);
   `infrastructure/` implements `domain/ports` and may import `@gertsai/*`
   packages; `services/` wires application + infrastructure + lib at the
   transport edge.

2. **A Moleculer service-with-lifecycle pattern owned by
   `@gertsai/api-core/moleculer`.** Controllers register themselves as import
   side effects. `ApiController.configure()` seeds the static queue/session
   registry **once**. Then `ApiController.Start()` builds the broker,
   synthesizes a Moleculer service schema per registered controller, and starts
   everything. **No code ever does `new ServiceBroker()` directly.**

Cross-cutting concerns — tenant resolution, `RequestContext`, logging
redaction, error scrubbing — are composed at the **broker-middleware seam** and
at small **composition facades**, never scattered into business code. Keeping
those two axes straight is the whole game: the hex rule keeps business logic
portable and unit-testable; the lifecycle pattern guarantees ordering
(handlers and workflow/queue schema attach before the broker starts) and makes
deployment commands transfer verbatim across every `@gertsai` app.

## How it works in m9s-example

### Pattern 1 — No-direct-broker: `ApiController.Start` owns the broker

- **What:** The app never calls `new ServiceBroker(...)`. `src/index.ts`
  side-effect-imports `./services` to register controllers, then calls
  `ApiController.Start({ brokerConfig, services, repl, workersEnabled,
  enabledServices, enabledWorkers })`, which creates the broker, synthesizes a
  Moleculer service schema per registered controller, and starts everything.
- **Why:** Lifecycle handlers (`started`/`stopped`) must fire before any action
  runs, and workflow/queue schema must be attached **before** `broker.start()`.
  Letting `api-core` own broker construction guarantees that ordering. It also
  means deployment commands (`SERVICES=`, `WORKERS_ENABLED=`, `--repl`)
  transfer verbatim across all `@gertsai` apps.
- **How:** Keep `brokerConfig` in `moleculer.config.ts`; export controllers as
  import side effects; call `ApiController.Start()` exactly once in `main()`;
  guard with `if (require.main === module)` so tests can import `index.ts`
  without booting the broker.

### Pattern 2 — Configure-before-import registration chain

- **What:** `services/index.ts` calls `ApiController.configure({ sessionFactory,
  queue, strictResponseValidation })` **once**, then side-effect-imports each
  domain service (`'./ingest'`, `'./search'`, `'./auth'`). Each service's
  `index.ts` imports `'./lifecycle'` first (registering the controller into
  `ApiController._controllers` and attaching handlers), then re-exports actions
  and types.
- **Why:** `controller.register(...)` and `controller.registerWorker(...)` write
  into the static registry that `ApiController.configure()` seeds and that
  `ApiController.Start()` later iterates. If a service imports before
  `configure()` runs, the queue/session config is missing and worker
  registration silently misses its connection.
- **How:** Order matters: (1) build `queueConfig` from `REDIS_URL`, (2)
  `ApiController.configure(...)`, (3) `import './<service>'`. Inside each service
  barrel, `import './lifecycle'` MUST be the first statement.

### Pattern 3 — Composition root singleton behind ports

- **What:** `src/composition/infrastructure.ts` builds the entire
  concrete-adapter graph once at module-load (`buildInfrastructure` → exported
  `const infrastructure`) and is the only file that imports concrete adapter
  classes. Adapter selection is env-driven via `pickStores` / `pickEmbedder` /
  `pickGate` / `pickRotationStore` switches.
- **Why:** Swapping adapters (`InMemoryStorageProvider` → `PgStorageProvider`,
  `MockEmbedder` → Ollama, `AllowAll` → OpenFGA) becomes a one-file change with
  zero domain/application edits. Sharing **one** singleton between `ingest` and
  `search` services means a write through one service is visible to a query
  through the other in the same process (otherwise two independent in-memory
  stores would make search always return 0).
- **How:** `export const infrastructure = buildInfrastructure()`; lifecycle
  handlers read this singleton and stash it on `ctx.service`. Adapter choice
  lives in env-switch functions returning the port type, never the concrete
  class.

### Pattern 4 — Typed lifecycle: `controller.addStartedHandler` stashes deps on `ctx.service`

- **What:** Each service has a `lifecycle.ts` that resolves a typed controller,
  optionally `setRestBasePath('/')` and `setWorkflows(...)`, and registers
  `addStartedHandler(async ctx => { ctx.service.docStore =
  infrastructure.docStore; ...; ctx.service.useCase = useCase; })` plus
  `addStoppedHandler`.
- **Why:** Action handlers receive a strongly-typed `ctx.service.<dep>` via the
  `ServiceContext` generic — no per-call casts. Centralising dependency wiring
  in `started()` keeps the action handler free of construction logic. The use
  case is constructed at module-load (closure over the same singleton) because
  `@moleculer/workflows` reads `schema.workflows` at `createService` time,
  before any `started()` callback.
- **How:** Declare a `ServiceContext` interface extending `ServiceContextBase`
  listing the deps; `resolveExampleController<'v1','ingest',IngestServiceContext>
  ('v1','ingest')`; assign `infrastructure` fields onto `ctx.service` inside
  `addStartedHandler`.

### Pattern 5 — Pure-transport action over a pure-orchestration use case

- **What:** `defineAction(controller.register('<name>', { auth, rest, params:
  typia.createValidate<Req>(), response: typia.createValidate<Res>(),
  responseCode, responseMessage, handler }))`. The handler validates input,
  resolves identity, asserts session guards, calls `service.useCase.execute(...)`
  (or enqueues), and maps domain/`AppError` to `APIError`. All business logic is
  in the application-layer use case, which depends only on ports.
- **Why:** Keeps the application layer independent of `@gertsai/api-core`
  (transport). Errors are translated to HTTP/RFC-9457 only at the boundary. The
  use case is unit-testable by mocking the four ports; the action is thin enough
  to need only an integration/e2e test.
- **How:** Action body: typia-validated params in → `assertAuthenticated` /
  `assertSessionInTenant` → branch queue vs inline → `respond(...)` on success →
  catch maps `AuthenticationRequiredError` / `TenantScopeViolationError` /
  `isAppError(err)` through `appErrorToHttpResponse` scrubber to `APIError`,
  re-throwing unknowns.

### Pattern 6 — Cross-cutting concerns at the middleware + facade seam

- **What:** Tenant resolution and `RequestContext` are composed as broker
  middlewares in canonical order `tenantMiddleware` → `sessionMiddleware`
  (`wave5-middlewares.ts`). Logging (`composition/logger.ts` via
  `@gertsai/logger-factory` with `REDACT_KEYS`), error scrubbing
  (`composition/errors.ts` wrapping `@gertsai/errors/http`), and the neutral
  error kernel (`shared/errors.ts`) live in small composition facades importable
  from any layer.
- **Why:** `tenantMiddleware` MUST precede `sessionMiddleware` so
  `ctx.meta.tenantId` is set before `RequestContext` is composed and `$freeze()`d
  (TOCTOU protection, ADR-007 I-16). Facades centralise log level / redaction
  keys / HTTP boundary policy so adopters do not drift across modules;
  `shared/errors.ts` avoids a hex inversion by being a neutral kernel re-export.
- **How:** `moleculer.config.ts` pushes `buildWave5Middlewares()` into
  `broker.middlewares`; handlers read `getRequestContext(ctx)` /
  `ctx.locals.requestContext` (per-request) and reserve `ctx.meta` for
  cross-broker serialisation only.

## Template

```ts
// =============================================================================
// src/index.ts — entry point. NEVER `new ServiceBroker()`.
// =============================================================================
import { initObservability, shutdownObservability } from './observability';
initObservability(); // no-op unless OTEL_EXPORTER_OTLP_ENDPOINT set

import './services'; // side-effect: register all controllers + lifecycle handlers

import { ApiController } from '@gertsai/api-core/moleculer';
import config from '../project.config';
import brokerConfig from '../moleculer.config';
import { createAppLogger } from './shared/logger';
import ApiService from './mol-services/api.service';

const log = createAppLogger('my-app');

async function main(): Promise<void> {
  await ApiController.Start({
    brokerConfig,
    services: [ApiService /* , ...plain moleculer services */],
    repl: process.argv.includes('--repl'),
    workersEnabled: config.WORKERS_ENABLED,
    // ...(enabledServices && { enabledServices }),   // from SERVICES env
    // ...(enabledWorkers && { enabledWorkers }),      // from WORKERS env
  });
}

if (require.main === module) {
  // install SIGTERM/SIGINT handlers that flush OTel then re-raise, then:
  main().catch((err: unknown) => { log.error('startup failed', { err }); process.exit(1); });
}
export { main };

// =============================================================================
// src/services/index.ts — configure ONCE, then side-effect import each service.
// =============================================================================
import IORedis from 'ioredis';
import { ApiController, type BullMQConnectionOptions } from '@gertsai/api-core/moleculer';
import { defaultSession, UserType } from '@gertsai/core';
import config from '../../project.config';

const queueConfig: BullMQConnectionOptions | undefined = config.REDIS_URL
  ? {
      connection: new IORedis(config.REDIS_URL, {
        maxRetriesPerRequest: null,   // required by BullMQ
        enableReadyCheck: false,
      }) as unknown as BullMQConnectionOptions['connection'],
      defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 1_000 } },
    }
  : undefined;

// MUST run before any service import — seeds the static registry.
ApiController.configure({
  sessionFactory: ((uid: string, type: UserType) =>
    defaultSession(uid, type, 'api', config.APP_VERSION)) as never,
  ...(queueConfig && { queue: queueConfig }),
  strictResponseValidation: process.env.NODE_ENV === 'development',
});

import './ingest'; // TODO: side-effect imports register controllers + workers
// import './search';

// =============================================================================
// src/composition/infrastructure.ts — composition root (module-load singleton).
// =============================================================================
import { InMemoryStorageProvider } from '@gertsai/entity-storage';
import { Session } from '@gertsai/session';
import type { IDocumentStore } from '../domain/ports/IDocumentStore';
import type { IEmbedder } from '../domain/ports/IEmbedder';
// import { DocumentRepository } from '../infrastructure/document.repository';

export interface SharedInfrastructure {
  readonly docStore: IDocumentStore;
  readonly embedder: IEmbedder;
  // TODO: add other outbound ports (chunkStore, gate, ...)
}

export function buildInfrastructure(): SharedInfrastructure {
  // TODO: env-driven switch over concrete adapters; return PORT types only.
  const docStore = /* new DocumentRepository(new InMemoryStorageProvider(), session) */ {} as IDocumentStore;
  const embedder = /* new MockEmbedder(384) */ {} as IEmbedder;
  return { docStore, embedder };
}

// One instance shared by every service → write-through-one visible to query-through-other.
export const infrastructure: SharedInfrastructure = buildInfrastructure();

// =============================================================================
// src/services/ingest/types.ts — typed service context.
// =============================================================================
import type { ServiceContextBase } from '@gertsai/api-core/moleculer';

export interface IngestServiceContext extends ServiceContextBase {
  docStore: import('../../domain/ports/IDocumentStore').IDocumentStore;
  useCase: import('../../application/IngestDocumentUseCase').IngestDocumentUseCase;
  // addJob / getQueue are injected by api-core when queue is configured — do NOT declare.
}

// =============================================================================
// src/services/ingest/lifecycle.ts — resolve typed controller, stash deps.
// =============================================================================
import { resolveExampleController } from '../../lib/example-controller';
import { IngestDocumentUseCase } from '../../application/IngestDocumentUseCase';
import { infrastructure } from '../../composition/infrastructure';
import type { IngestServiceContext } from './types';

const controller = resolveExampleController<'v1', 'ingest', IngestServiceContext>('v1', 'ingest');
controller.setRestBasePath('/'); // api-gateway already prefixes /api/v1

const ingestUseCase = new IngestDocumentUseCase(infrastructure); // module-load: stable ref

controller.addStartedHandler(async (ctx) => {
  ctx.service.docStore = infrastructure.docStore; // SAME singleton across services
  ctx.service.useCase = ingestUseCase;
});
controller.addStoppedHandler(async (ctx) => {
  (ctx.service as { _destroyed?: boolean })._destroyed = true;
});
export { controller };

// =============================================================================
// src/services/ingest/src/actions/ingest-document.action.ts — pure transport.
// =============================================================================
import { APIError, ResponseCode } from '@gertsai/api-core/contracts';
import { defineAction } from '@gertsai/api-core/moleculer';
import { isAppError } from '@gertsai/errors';
import typia from 'typia';
import { appErrorToHttpResponse } from '../../../../shared/error-scrubber';

export const ingestDocument = defineAction(controller.register('document', {
  auth: 'none', // TODO: 'required' once a real auth middleware is wired
  rest: 'POST /ingest/document',
  params: typia.createValidate</* IngestDocumentRequest */ unknown>(),
  response: typia.createValidate</* IngestDocumentResponse */ unknown>(),
  responseCode: ResponseCode.SUCCESS_CREATED,
  responseMessage: 'Accepted',
  async handler({ params, ctx, service, logger, respond, addJob }) {
    try {
      // TODO: assertAuthenticated(session) / assertSessionInTenant(...) BEFORE branching.
      // TODO: if (QUEUE_ENABLED) await addJob(QUEUE, JOB, payload); else service.useCase.execute(...)
      return respond(/* result */ {} as never, 'Accepted', ResponseCode.SUCCESS_CREATED);
    } catch (err) {
      if (isAppError(err)) {
        const { body } = appErrorToHttpResponse(err); // scrub PII before the wire
        throw new APIError(ResponseCode.INTERNAL_ERROR, body.details as never, body.title);
      }
      throw err; // let the framework default handler take unknowns
    }
  },
}));
```

> The same skeleton is available as a standalone copy-paste file:
> `templates/m9s-app-architecture.skeleton.ts`.

## Best practices

- Never call `new ServiceBroker(...)` directly — `ApiController.Start({
  brokerConfig, services, ... })` owns broker construction so lifecycle handlers
  and workflow/queue schema attach in the right order.
- Respect the registration ordering: call `ApiController.configure({
  sessionFactory, queue, strictResponseValidation })` **once** before any service
  is imported; inside a service barrel, `import './lifecycle'` must be the first
  statement so the controller registers before its actions.
- Build the concrete-adapter graph in **one** composition root
  (`src/composition/infrastructure.ts`) and export it as a module-load
  singleton; every other file depends on ports, never on a concrete adapter
  class.
- Share a single `infrastructure` instance across services so in-process state
  (in-memory stores) is consistent — a write through `ingest` must be visible to
  a query through `search`.
- Keep the hexagonal dependency rule: `domain/` imports only stdlib +
  `@gertsai/errors` (Shared Kernel); `application/` imports only `domain/`
  (ports + entities); `infrastructure/` implements `domain/ports` and may import
  `@gertsai/*` packages; `services/` wires application + infrastructure + lib.
- Actions are pure transport: typia-validate params/response, resolve identity,
  assert session guards, delegate to a use case, and map errors to `APIError` at
  the boundary — put zero business logic in the handler.
- Type `ctx.service` via a `ServiceContext` interface extending
  `ServiceContextBase`, resolved through `resolveExampleController<V,N,S>()`; do
  NOT declare `addJob` / `getQueue` — `api-core` injects them when a queue is
  configured.
- Compose cross-cutting concerns at the seam: `tenantMiddleware` →
  `sessionMiddleware` order in `moleculer.config.ts` (tenant resolved before
  `RequestContext` is composed and frozen); logging redaction, HTTP error
  scrubbing, and the neutral error kernel live in `composition`/`shared` facades.
- Read per-request state from `ctx.locals.requestContext` (frozen) and reserve
  `ctx.meta` for cross-broker serialisation only.
- Gate optional infra on env: BullMQ queue, Redis transport,
  `@moleculer/channels`, and `@moleculer/workflows` all key off `REDIS_URL`; the
  app must boot with zero env vars (mock embedder + in-memory stores + inline
  fallback).

## Pitfalls

- Importing a service module before `ApiController.configure(...)` runs leaves
  the queue/session config unseeded, so `controller.registerWorker(...)`
  silently misses its BullMQ connection and jobs never get a worker.
- Constructing per-service adapters (e.g. `new MemoryVectorStore()` inside each
  lifecycle) instead of sharing the composition-root singleton produces **two**
  independent in-memory stores in one process — search then always returns 0
  results because it never sees what ingest wrote.
- Deferring `setWorkflows(...)` into `addStartedHandler` breaks workflows:
  `@moleculer/workflows` reads `schema.workflows` at `broker.createService` time
  (during `ApiController.Start`), **before** any `started()` callback, so
  `broker.wf.run('v1.ingest.process', ...)` throws at runtime. Register
  workflows at module-load.
- Forgetting `controller.setRestBasePath('/')` causes the api-gateway route
  prefix to duplicate (`/api/v1/ingest/v1/ingest/...`) because `autoAliases`
  re-adds the service-name prefix.
- Leaking `@gertsai/api-core` (transport) types or `APIError` into the
  application or domain layer — error translation must happen only in the
  inbound action's `catch` block via `appErrorToHttpResponse`.
- Reordering the Wave 5 middlewares (`sessionMiddleware` before
  `tenantMiddleware`) means `RequestContext` is composed and `$freeze()`d before
  `ctx.meta.tenantId` exists, so tenant scoping is lost — order is load-bearing.
- Trusting `X-Tenant-ID` without a reverse proxy that strips/re-sets it:
  `HeaderStrategy({ trustProxy: true })` is spoofable end-to-end (CWE-639
  cross-tenant access) unless a proxy clears client-supplied headers.
- Copying demo-grade defaults to production: `AUTH_GATE=allow-all` (throws under
  `NODE_ENV=production` by design), `MockEmbedder` (deterministic hash, no
  semantic similarity → empty search), and `STORAGE_PROVIDER=memory` are
  intentionally demo-only.
- Leaving Moleculer's built-in `validator` enabled — `api-core` already
  validates via typia inside `controller.register`'s wrapper, so a
  double-validation pass and a 0.14.x deprecation warning result; set
  `validator: false`.
- Putting per-request state on `ctx.meta` thinking it's local — `ctx.meta` is
  serialised across brokers; per-request, per-process state belongs on
  `ctx.locals`.

## Canonical files

All paths are relative to `examples/m9s-example/`.

- `src/index.ts:42-208` — Entry point. `initObservability()` first, then
  side-effect `import './services'`, then `ApiController.Start({ brokerConfig,
  services, repl, workersEnabled, enabledServices, enabledWorkers })`. Shows the
  no-direct-broker rule, env-driven launch parsing, graceful shutdown, and the
  `require.main` guard so tests can import without booting.
- `src/services/index.ts:1-107` — Services barrel + the critical ordering
  contract: build optional BullMQ connection from `REDIS_URL`, call
  `ApiController.configure({ sessionFactory, queue, strictResponseValidation })`
  ONCE before any service import, then side-effect import `./ingest`, `./search`,
  `./auth`. `configure()` MUST precede the imports because `registerWorker`
  writes into the static registry `configure()` seeds.
- `src/composition/infrastructure.ts:1-366` — Composition root.
  `buildInfrastructure()` picks concrete adapters by env (`pickStores` /
  `pickEmbedder` / `pickGate` / `pickRotationStore`) and exports a module-load
  singleton `infrastructure`. The single place that knows concrete adapters; both
  ingest and search import the same instance so a write through one is visible to
  a query through the other in-process.
- `src/services/ingest/lifecycle.ts:41-135` — Per-service lifecycle.
  `resolveExampleController<V,N,S>()` gets the typed controller,
  `setRestBasePath('/')`, `setWorkflows()` at module-load, `addStartedHandler`
  stashes the shared `infrastructure` singleton onto the typed `ctx.service`,
  `addStoppedHandler` flips a `_destroyed` flag. Construction of the use case at
  module-load is deliberate (workflow timing).
- `src/services/ingest/types.ts:35-100` — Typed service context
  (`IngestServiceContext extends ServiceContextBase`) + transport
  request/response shapes. The `ServiceContext` generic is what makes
  `ctx.service.<dep>` strongly typed in action handlers; `addJob` / `getQueue`
  are injected by `api-core`, not declared here.
- `src/services/ingest/src/actions/ingest-document.action.ts:64-261` — Inbound
  action = pure transport. `defineAction(controller.register('document', { auth,
  rest, params/response typia validators, responseCode, handler }))`. Validates,
  asserts session-guard invariants, enqueues via `addJob` OR runs the use case
  inline, and maps domain/`AppError` to `APIError` at the HTTP boundary. Zero
  business logic.
- `src/application/IngestDocumentUseCase.ts:93-157` — Application layer.
  Constructor-injected deps (ports only), `execute()` orchestrates `gate.can` →
  `createDocument` → `splitIntoChunks` → `embedder.embed` → `docStore.save` →
  `chunkStore.addChunks`. Throws `@gertsai/errors` taxonomy. No transport, no
  infra import — trivially unit-testable with stub ports.
- `src/domain/document.ts:26-57` — Domain layer. Pure `Document` interface +
  `createDocument` factory that enforces invariants by throwing `ValidationError`
  from `@gertsai/errors`. Imports only `@gertsai/errors` (the Shared Kernel) — no
  adapters, no application.
- `src/lib/example-controller.ts:31-37` — Typed controller facade.
  `resolveExampleController<V,N,S extends ServiceContextBase>()` thinly wraps
  `ApiController.resolveController` so every domain service supplies its own
  `ServiceContext` type without per-call casts.
- `moleculer.config.ts:112-365` — Broker options object passed verbatim to
  `ApiController.Start`. `M9sCacheCacher` (env-driven memory/redis driver),
  transporter switch (Local/Redis/NATS), `validator: false` (typia validates
  instead), retry on, circuit-breaker/bulkhead off, and the Wave 5 middleware
  stack via `buildWave5Middlewares()`.
- `src/composition/wave5-middlewares.ts:1-60` — Cross-cutting middleware
  composition. Canonical order `tenantMiddleware`
  (`@gertsai/tenant-resolver/moleculer`) → `sessionMiddleware`
  (`@gertsai/runtime-context/moleculer`): tenant resolved onto
  `ctx.meta.tenantId` first, then `RequestContext` composed onto
  `ctx.locals.requestContext` and `$freeze()`d before the handler runs.
- `src/domain/ports/IEmbedder.ts:10-21` — Example outbound port — a plain TS
  interface in `domain/ports`. Concrete adapters (Mock/Ollama/OpenAI embedders)
  live in `infrastructure/` and are selected in the composition root; domain
  depends only on the interface.

## @gertsai packages used

- `@gertsai/api-core/moleculer` — `ApiController.Start` / `configure` /
  `resolveController`, `defineAction`, `setWorkflows`, `ServiceContextBase`,
  `BullMQConnectionOptions`, `createOpenApiService`.
- `@gertsai/api-core/contracts` — `APIError`, `ResponseCode`.
- `@gertsai/core` — `defaultSession`, `UserType`.
- `@gertsai/errors` — `AppError` taxonomy: `ValidationError`, `InternalError`,
  `isAppError`; Shared Kernel imported by domain.
- `@gertsai/errors/http` — `appErrorToHttpResponse` (RFC 9457 `ProblemDetails`
  at HTTP boundary).
- `@gertsai/session` — `Session` (system session in composition root).
- `@gertsai/session-guard` — `assertAuthenticated`, `assertSessionInTenant`,
  `AuthenticationRequiredError`, `TenantScopeViolationError`.
- `@gertsai/tenant-resolver` + `/moleculer` — `ChainTenantResolver`,
  `HeaderStrategy`, `tenantMiddleware`.
- `@gertsai/runtime-context` + `/moleculer` — `RequestContext`,
  `sessionMiddleware`, `REQUEST_CONTEXT_LOCALS_KEY`.
- `@gertsai/tenant` — `asTenantId`, `TenantId` brand.
- `@gertsai/entity-storage` — `BaseEntityStorageService`,
  `InMemoryStorageProvider`.
- `@gertsai/storage-core` — `StorageMetadata`, `IStorageProvider`.
- `@gertsai/entity-audit` — `MutationMarks`, `EntityBasicStatus`.
- `@gertsai/m9s-cache` + `/moleculer` + `/redis` — `M9sCacheCacher`,
  `MemoryCacheDriver`, `RedisCacheDriver`.
- `@gertsai/rest-request-manager` — `RestRequestManager` (fronts embedder HTTP
  with retry/rate-limit/circuit-breaker/SSRF).
- `@gertsai/logger-factory` — `createAppLogger` via `consoleBackend`,
  `REDACT_KEYS`.
- `@gertsai/auth-openfga` — `OpenFgaPermissionGate`.
- `@gertsai/pg-client` + `/storage` — `PgStorageProvider` for production swap.
- `@gertsai/api-rlr` — `RLRMiddleware` (Express-style rate limiting in
  `settings.use`).
- `@gertsai/fetch` — used by embedder adapters.
