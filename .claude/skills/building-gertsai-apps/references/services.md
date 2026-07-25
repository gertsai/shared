# Service modules & composition

## What & why

In m9s-example, a "service" is a directory under `src/services/` that resolves an
`ApiController` via `ApiController.resolveController(version, name)`, then
registers actions, queue workers, and lifecycle handlers against that controller
as **module-load side effects**. Nothing happens at runtime unless the module is
imported — the entire discovery mechanism is built on side-effect imports.

The composition root (`src/composition/infrastructure.ts`) builds the concrete
adapter graph **exactly once** at module-load and exports a single
`infrastructure` singleton. Every service's lifecycle handler stashes references
off that singleton onto `ctx.service.<thing>` — this is precisely what lets
ingest-then-search work over the same in-memory stores within one process. If
two services each constructed their own `new MemoryVectorStore()`, search would
never observe what ingest wrote.

Broker middlewares (tenant + session, `src/composition/wave5-middlewares.ts`) are
composed separately in a dedicated builder and spread into
`BrokerOptions.middlewares`. They run in a strict canonical order: tenant resolves
`ctx.meta.tenantId` **before** session composes and `$freeze()`s the
`RequestContext` (TOCTOU protection, ADR-007 I-16 / ADR-010 §B).

The wiring order is strict and load-bearing:

1. `ApiController.configure({ sessionFactory, queue })` runs **first** (in
   `services/index.ts`, before any service import) — it seeds the static config
   that `registerWorker` later reads.
2. Side-effect imports register controllers — each domain barrel does
   `import './lifecycle'` **first**, so the controller plus its started/stopped
   handlers and any `setWorkflows()` block exist before action/worker files
   append registrations to the same controller.
3. `ApiController.Start()` synthesizes one Moleculer service schema per
   registered controller and boots the broker — `src/index.ts` never constructs
   a `ServiceBroker` directly.

## How it works in m9s-example

### Controller-per-service via resolveController

- **What** — Each service is anchored by an `ApiController` instance obtained from
  `ApiController.resolveController<V, N, S>(version, name)`. m9s wraps this in
  `resolveExampleController` so each service injects its own `ServiceContext`
  interface (e.g. `IngestServiceContext extends ServiceContextBase`).
- **Why** — `resolveController` is a registry lookup keyed by `(version, name)`.
  Every file in the service (lifecycle, each action, each worker) that calls it
  with the **same** key gets the **same** controller object, so registrations
  accumulate onto one synthesized Moleculer service schema. The generic
  `ServiceContext` param gives compile-time `ctx.service.<thing>` typing without
  per-call casts.
- **How** —
  `const controller = resolveExampleController<'v1', 'ingest', IngestServiceContext>('v1', 'ingest');`
  then `controller.register(...)`, `controller.registerWorker(...)`,
  `controller.addStartedHandler(...)`.

### Module-load side-effect registration with strict barrel ordering

- **What** — Services register themselves purely as import side effects. The
  domain barrel (`services/ingest/index.ts`) imports `'./lifecycle'` FIRST, then
  re-exports `'./src'` (actions + queues) and `'./types'`. The top-level barrel
  (`services/index.ts`) calls `ApiController.configure()` before any service
  import, then side-effect-imports each domain folder.
- **Why** — api-core discovers controllers by iterating its static `_controllers`
  registry at `Start()` time. Nothing is registered unless its module is
  imported. Lifecycle-first ordering ensures the controller exists and its
  started/stopped handlers plus workflows are attached **before** action/worker
  registrations append to the same controller. `configure()` must precede imports
  because it seeds the static config (`sessionFactory`, `queue`) that
  `registerWorker` writes into.
- **How** —
  ```ts
  // services/ingest/index.ts
  import './lifecycle';
  export * from './src';
  export * from './types';
  // services/index.ts: ApiController.configure({...}); then import './ingest'; import './search';
  ```

### Shared composition-root singleton injected via lifecycle

- **What** — `src/composition/infrastructure.ts` builds the full concrete-adapter
  graph exactly once at module-load (`export const infrastructure = buildInfrastructure()`)
  and exports a single readonly `SharedInfrastructure` object. Each service's
  `addStartedHandler` copies references off `infrastructure` onto `ctx.service`
  (docStore, chunkStore, embedder, gate, useCase).
- **Why** — Two services constructing their own `new MemoryVectorStore()` would
  produce two independent in-memory stores in one process — search would never
  see what ingest wrote. Resolving the singleton at import time guarantees BOTH
  services observe the SAME instances regardless of lifecycle fire order. In
  production (remote vector DB) the singleton becomes irrelevant but the shape is
  unchanged.
- **How** —
  ```ts
  import { infrastructure } from '../../composition/infrastructure';
  controller.addStartedHandler(async (ctx) => {
    ctx.service.docStore = infrastructure.docStore;
    ctx.service.useCase = new IngestDocumentUseCase(infrastructure);
  });
  ```

### Env-driven backend selection in pick* helpers

- **What** — The composition root is the single place that knows concrete
  adapters. `pickStores()` / `pickEmbedder()` / `pickGate()` / `pickRotationStore()`
  switch on config (`STORAGE_PROVIDER`, `EMBEDDER_PROVIDER`, `AUTH_GATE`,
  `REDIS_URL`) and fail-closed on misconfiguration (e.g. `AUTH_GATE='allow-all'`
  throws under `NODE_ENV='production'` per ADR-011 I-12).
- **Why** — Keeps adapter selection out of services and use cases (they depend
  only on ports). Makes the example boot with zero env vars (mock embedder,
  in-memory stores, in-memory rotation store) while letting a deployment flip to
  Ollama/OpenAI/Postgres/OpenFGA/Redis purely via env — and refuse insecure
  combinations at boot.
- **How** —
  ```ts
  function pickStores() {
    switch (config.STORAGE_PROVIDER) {
      case 'postgres': /* Pg adapters */;
      case 'memory': default: /* InMemoryStorageProvider + MemoryVectorStore */
    }
  }
  ```

### Broker middleware composition (tenant → session)

- **What** — Wave 5 middlewares are composed in a dedicated file:
  `buildWave5Middlewares()` returns `[tenantMiddleware(resolver), sessionMiddleware({ resolver })]`
  in canonical order. The resolver is a `ChainTenantResolver` of `HeaderStrategy`
  adapted to the Moleculer `Context`. Action handlers read the composed
  `RequestContext` via `tryGetRequestContextFromCtx(ctx)`.
- **Why** — `tenantMiddleware` must run BEFORE `sessionMiddleware` so
  `ctx.meta.tenantId` is resolved before the `RequestContext` is composed and
  `$freeze()`'d (TOCTOU protection, ADR-007 I-16). Isolating the stack into one
  file keeps `moleculer.config.ts` focused on transport/cacher and makes the Wave
  5 reference a single self-contained import.
- **How** —
  ```ts
  // moleculer.config.ts: middlewares: [...buildWave5Middlewares(), ...custom]
  // action: const { session, expectedTenantId } = tryGetRequestContextFromCtx(ctx); assertAuthenticated(session);
  ```

### Queue worker registration owned by api-core

- **What** — Queue lifecycle is owned by api-core: `ApiController.configure({ queue })`
  supplies the BullMQ connection; `controller.registerWorker(queueName, [{ name, concurrency, handler }])`
  registers the consumer at module-load. api-core's service `started()` creates
  ONE BullMQ Worker per queue (routing on `job.name`) and injects
  `service.addJob` / `getQueue`. The action enqueues via `addJob`; the worker
  delegates to `this.useCase`.
- **Why** — Services never touch bullmq directly — produce side (`addJob`) and
  consume side (`registerWorker`) are both mediated by api-core so queue config,
  worker gating (`workersEnabled` / `enabledWorkers`), and cleanup are uniform.
  The worker handler is a non-arrow function so `this` binds to the Moleculer
  service carrying the typed `ServiceContext` fields.
- **How** —
  ```ts
  controller.registerWorker(INGEST_QUEUE_NAME, [{
    name: JOB_PROCESS_DOCUMENT,
    concurrency: config.WORKER_CONCURRENCY,
    async handler(this: IngestQueueThis, ctx) { return this.useCase.execute(ctx.job.data); },
  }]);
  ```

### Centralized launch via ApiController.Start

- **What** — `src/index.ts` never constructs a `ServiceBroker`. It
  side-effect-imports `'./services'` (registering all controllers), builds extra
  plain Moleculer services (api gateway, channels, openapi), then awaits
  `ApiController.Start({ brokerConfig, services, workersEnabled, enabledServices, enabledWorkers })`.
- **Why** — `ApiController.Start` owns broker construction so it can synthesize a
  Moleculer service schema for every registered controller and guarantee
  lifecycle handlers plus workflow blocks are attached before `broker.start()`
  and before any action runs. Env-driven `SERVICES`/`WORKERS` toggles let the
  same binary run as API-gateway (producer-only), full worker, or single-service
  deployments.
- **How** —
  ```ts
  import './services';
  await ApiController.Start({ brokerConfig, services: [ApiService, ...], workersEnabled, ...(enabledServices && { enabledServices }) });
  ```

## Template

```ts
// SPDX-License-Identifier: Apache-2.0
// =============================================================================
// A complete "service module" skeleton for the @gertsai/api-core (Moleculer)
// stack, mirroring examples/m9s-example. Lay it out as:
//
//   src/composition/infrastructure.ts      <- shared adapter singleton
//   src/composition/wave5-middlewares.ts   <- tenant + session broker stack
//   src/lib/example-controller.ts          <- typed resolveController facade
//   src/services/index.ts                  <- top-level barrel + configure()
//   src/services/<svc>/index.ts            <- domain barrel (lifecycle FIRST)
//   src/services/<svc>/lifecycle.ts        <- controller wiring + handlers
//   src/services/<svc>/types.ts            <- ServiceContext + transport DTOs
//   src/services/<svc>/src/index.ts        <- actions + queues barrel
//   src/services/<svc>/src/actions/*.ts    <- defineAction(controller.register)
//   src/services/<svc>/src/queues/*.ts     <- controller.registerWorker
//   src/index.ts                           <- ApiController.Start
// =============================================================================

// ----------------------------------------------------------------------------
// src/lib/example-controller.ts — typed controller facade
// ----------------------------------------------------------------------------
import { ApiController } from '@gertsai/api-core/moleculer';
import type { ServiceContextBase } from '@gertsai/api-core/moleculer';

export function resolveExampleController<
  V extends string,
  N extends string,
  S extends ServiceContextBase = ServiceContextBase,
>(version: V, name: N) {
  return ApiController.resolveController<V, N, S>(version, name);
}

// ----------------------------------------------------------------------------
// src/composition/infrastructure.ts — build the adapter graph ONCE
// ----------------------------------------------------------------------------
import config from '../../project.config';
// TODO: import your concrete adapters + the ports they implement
import type { IMyStore } from '../domain/ports/IMyStore';

export interface SharedInfrastructure {
  readonly store: IMyStore;
  // TODO: add embedder / gate / rotationStore / etc.
}

export function buildInfrastructure(): SharedInfrastructure {
  const store = pickStore();
  // TODO: build other adapters via env-driven pick* helpers
  return { store };
}

function pickStore(): IMyStore {
  switch (config.STORAGE_PROVIDER) {
    case 'postgres': {
      if (!config.POSTGRES_URL) throw new Error("STORAGE_PROVIDER='postgres' requires POSTGRES_URL.");
      // TODO: return new PgAdapter({ connectionString: config.POSTGRES_URL });
      throw new Error('TODO: wire postgres adapter');
    }
    case 'memory':
    default:
      // Fail-closed example: refuse demo adapters in production.
      if (config.NODE_ENV === 'production') throw new Error("memory backend refused in production");
      // TODO: return new InMemoryAdapter();
      throw new Error('TODO: wire in-memory adapter');
  }
}

// Module-load singleton — imported by every service lifecycle so they
// observe the SAME instances. Exported separately so tests can build an
// isolated instance via buildInfrastructure().
export const infrastructure: SharedInfrastructure = buildInfrastructure();

// ----------------------------------------------------------------------------
// src/composition/wave5-middlewares.ts — tenant -> session broker stack
// ----------------------------------------------------------------------------
import type { Context } from 'moleculer';
import { ChainTenantResolver, HeaderStrategy, type TenantResolverStrategy } from '@gertsai/tenant-resolver';
import { tenantMiddleware } from '@gertsai/tenant-resolver/moleculer';
import { REQUEST_CONTEXT_LOCALS_KEY, sessionMiddleware } from '@gertsai/runtime-context/moleculer';
import type { RequestContext } from '@gertsai/runtime-context';
import type { Session } from '@gertsai/session';
import { asTenantId, type TenantId } from '@gertsai/tenant';

export function buildTenantResolver(): TenantResolverStrategy<Context> {
  // SECURITY (CWE-639): trustProxy: true requires a reverse proxy that strips
  // inbound X-Tenant-ID and re-sets it from authenticated context.
  const headerStrategy = new HeaderStrategy({ headerName: 'X-Tenant-ID', trustProxy: true });
  const adapted: TenantResolverStrategy<Context> = {
    name: headerStrategy.name,
    async resolve(ctx) {
      const headers = (ctx.meta as Record<string, unknown>)?.['headers'];
      if (!headers || typeof headers !== 'object' || Array.isArray(headers)) return null;
      return headerStrategy.resolve({ headers: headers as Record<string, string | string[] | undefined> });
    },
  };
  // TODO: production should use mode: 'strict' (the library default, ADR-006 I-18).
  return new ChainTenantResolver<Context>([adapted], { mode: 'optional' });
}

export function buildWave5Middlewares(): readonly unknown[] {
  const resolver = buildTenantResolver();
  // Canonical order (ADR-010 §B): tenant BEFORE session.
  return [tenantMiddleware(resolver), sessionMiddleware({ resolver })];
}

export interface Wave5ContextSnapshot {
  readonly session: Session | undefined;
  readonly expectedTenantId: TenantId | undefined;
}

export function tryGetRequestContextFromCtx(ctx: Context): Wave5ContextSnapshot {
  const locals = (ctx as unknown as { locals?: Record<string, unknown> }).locals;
  const value = locals?.[REQUEST_CONTEXT_LOCALS_KEY];
  // Structural duck-typing, NOT instanceof — tsup bundles a separate
  // RequestContext class per subpath, so instanceof fails cross-subpath.
  if (!value || typeof value !== 'object' || !('sessionOptional' in value) || !('tenantIdOptional' in value)) {
    return { session: undefined, expectedTenantId: undefined };
  }
  const rc = value as RequestContext;
  const raw = rc.tenantIdOptional;
  return {
    session: rc.sessionOptional,
    expectedTenantId: raw !== undefined && raw.length > 0 ? asTenantId(raw) : undefined,
  };
}

// ----------------------------------------------------------------------------
// src/services/<svc>/types.ts — ServiceContext + transport DTOs
// ----------------------------------------------------------------------------
import type { ServiceContextBase } from '@gertsai/api-core/moleculer';
// TODO: import your use case + port types

export interface MyServiceContext extends ServiceContextBase {
  // Fields wired in by the lifecycle handler; seen strongly-typed in handlers.
  // NOTE: addJob / getQueue are NOT declared here — api-core adds them when a
  // queue connection is configured.
  store: IMyStore;
  useCase: /* TODO MyUseCase */ unknown;
}

export interface MyRequest { id: string; /* TODO transport DTO */ }
export interface MyResponse { id: string; /* TODO transport DTO */ }

// ----------------------------------------------------------------------------
// src/services/<svc>/lifecycle.ts — controller wiring + lifecycle handlers
// ----------------------------------------------------------------------------
import { resolveExampleController } from '../../lib/example-controller';
import { infrastructure } from '../../composition/infrastructure';
import type { MyServiceContext } from './types';

const controller = resolveExampleController<'v1', 'myservice', MyServiceContext>('v1', 'myservice');

// REST routes are already prefixed by the api-gateway route; '/' avoids the
// `v1/myservice/v1/myservice/...` duplication autoAliases would produce.
controller.setRestBasePath('/');

// TODO (only if this service hosts a @moleculer/workflows workflow):
//   setWorkflows(controller as never, { process: createMyWorkflow({ useCase }) });
//   MUST run at module-load — the middleware reads schema.workflows before
//   any addStartedHandler callback fires.

controller.addStartedHandler(async (ctx) => {
  ctx.logger?.info('[v1.myservice] starting...');
  // Stash the SHARED singleton refs so sibling services see the same instances.
  ctx.service.store = infrastructure.store;
  // TODO: ctx.service.useCase = new MyUseCase(infrastructure);
});

controller.addStoppedHandler(async (ctx) => {
  (ctx.service as { _destroyed?: boolean })._destroyed = true; // workers short-circuit mid-shutdown
  ctx.logger?.info('[v1.myservice] stopped.');
});

export { controller };

// ----------------------------------------------------------------------------
// src/services/<svc>/src/actions/my.action.ts — transport-only handler
// ----------------------------------------------------------------------------
import { APIError, ResponseCode } from '@gertsai/api-core/contracts';
import { defineAction } from '@gertsai/api-core/moleculer';
import { assertAuthenticated, assertSessionInTenant } from '@gertsai/session-guard';
import typia from 'typia';
import { resolveExampleController as _resolve } from '../../../../lib/example-controller';
import { tryGetRequestContextFromCtx } from '../../../../composition/wave5-middlewares';
import type { MyServiceContext, MyRequest, MyResponse } from '../../types';

const ctl = _resolve<'v1', 'myservice', MyServiceContext>('v1', 'myservice');

export const myAction = defineAction(ctl.register('do', {
  auth: 'none', // TODO: switch to 'required' once a real auth middleware is wired
  rest: 'POST /myservice/do',
  params: typia.createValidate<MyRequest>(),
  response: typia.createValidate<MyResponse>(),
  responseCode: ResponseCode.SUCCESS_CREATED,
  responseMessage: 'Accepted',
  async handler({ params, ctx, service, logger, respond /* , addJob */ }) {
    try {
      const { session, expectedTenantId } = tryGetRequestContextFromCtx(ctx);
      assertAuthenticated(session);
      if (expectedTenantId !== undefined) assertSessionInTenant(session, expectedTenantId);
      // TODO: const result = await service.useCase.execute({ ...params, session });
      const response: MyResponse = { id: params.id };
      return respond(response, 'Accepted', ResponseCode.SUCCESS_CREATED);
    } catch (err) {
      // Map domain errors to transport here — keep the app layer free of api-core.
      if (err instanceof Error && err.message.startsWith('Domain.')) {
        throw new APIError(ResponseCode.BAD_REQUEST, undefined, err.message);
      }
      throw err;
    }
  },
}));

// ----------------------------------------------------------------------------
// src/services/<svc>/src/queues/my.worker.ts — registered, api-core-owned
// ----------------------------------------------------------------------------
import type { QueueHandlerCtx } from '@gertsai/api-core/moleculer';
import type Moleculer from 'moleculer';
import config from '../../../../../project.config';
import { resolveExampleController as _resolveQ } from '../../../../lib/example-controller';
import type { MyServiceContext } from '../../types';

export const MY_QUEUE_NAME = 'myapp.myservice' as const;
export const JOB_DO = 'do-job' as const;
export interface MyJobData { id: string }

type MyQueueThis = MyServiceContext & Pick<Moleculer.Service, 'logger' | 'broker'>;
const qctl = _resolveQ<'v1', 'myservice', MyServiceContext>('v1', 'myservice');

qctl.registerWorker(MY_QUEUE_NAME, [{
  name: JOB_DO,
  concurrency: config.WORKER_CONCURRENCY,
  // Non-arrow function so `this` binds to the Moleculer service (typed ctx fields).
  async handler(this: MyQueueThis, ctx: QueueHandlerCtx<import('bullmq').Job<MyJobData>>) {
    if ((this as { _destroyed?: boolean })._destroyed === true) return;
    // TODO: return this.useCase.execute(ctx.job.data);
  },
}]);

// ----------------------------------------------------------------------------
// src/services/<svc>/src/index.ts — actions + queues barrel
// ----------------------------------------------------------------------------
// export * from './actions';
// export * from './queues';   // side-effect import registers the worker

// ----------------------------------------------------------------------------
// src/services/<svc>/index.ts — domain barrel (lifecycle FIRST)
// ----------------------------------------------------------------------------
// import './lifecycle';        // MUST be first — registers controller + handlers
// export * from './src';
// export * from './types';

// ----------------------------------------------------------------------------
// src/services/index.ts — top-level barrel: configure() BEFORE imports
// ----------------------------------------------------------------------------
// import { ApiController, type BullMQConnectionOptions } from '@gertsai/api-core/moleculer';
// import { defaultSession, UserType } from '@gertsai/core';
// const queueConfig: BullMQConnectionOptions | undefined = config.REDIS_URL ? { /* connection, ... */ } : undefined;
// ApiController.configure({
//   sessionFactory: ((uid: string, t: UserType) => defaultSession(uid, t, 'api', config.APP_VERSION)) as never,
//   ...(queueConfig && { queue: queueConfig }),
//   strictResponseValidation: process.env.NODE_ENV === 'development',
// });
// import './myservice';        // side-effect imports register all controllers

// ----------------------------------------------------------------------------
// src/index.ts — boot via ApiController.Start (NO `new ServiceBroker`)
// ----------------------------------------------------------------------------
// import './services';
// import { ApiController } from '@gertsai/api-core/moleculer';
// import brokerConfig from '../moleculer.config'; // middlewares: [...buildWave5Middlewares()]
// await ApiController.Start({ brokerConfig, services: [ApiService], workersEnabled: config.WORKERS_ENABLED });
```

## Best practices

- **Wire in dependency order.** `ApiController.configure({ sessionFactory, queue })`
  must run BEFORE any service is imported (`services/index.ts` does this at the
  top); each domain barrel must `import './lifecycle'` FIRST so the controller +
  handlers are registered before action/worker files append to the same
  controller.
- **Build all concrete adapters in ONE composition root**
  (`src/composition/infrastructure.ts`) and export a module-load singleton; have
  every service's `addStartedHandler` copy references off it onto `ctx.service`
  so sibling services share the same instances (the only reason ingest-then-search
  works in-process).
- **Keep services and use cases dependent on ports only.** Backend selection
  (memory vs postgres, mock vs ollama vs openai, allow-all vs openfga, in-memory
  vs redis) belongs exclusively in the composition root's `pick*` helpers,
  switched on `project.config`.
- **Make `pick*` helpers fail-closed.** Refuse insecure combinations at boot
  (e.g. `AUTH_GATE='allow-all'` throws under `NODE_ENV='production'`;
  `STORAGE_PROVIDER='postgres'` throws if `POSTGRES_URL` is unset) so the process
  dies on startup, not on first request.
- **Resolve the controller in every file of a service with the SAME `(version, name)`**
  via `resolveExampleController<V, N, ServiceContext>(...)` — this returns the
  same registry-backed instance and gives compile-time `ctx.service` typing
  through the `ServiceContext` generic.
- **Keep action handlers pure transport.** typia-validate params/response, read
  auth context via `tryGetRequestContextFromCtx` +
  `assertAuthenticated`/`assertSessionInTenant`, delegate to `service.useCase`,
  and map domain errors to `APIError`. No business logic in the handler.
- **Compose broker middlewares in a dedicated builder** (`buildWave5Middlewares`)
  in canonical order tenant→session, and spread the result into
  `BrokerOptions.middlewares`; read the composed `RequestContext` off
  `ctx.locals[REQUEST_CONTEXT_LOCALS_KEY]` via structural duck-typing, not
  `instanceof`.
- **Let api-core own the queue.** Supply the connection via
  `ApiController.configure({ queue })`, register consumers with
  `controller.registerWorker`, produce with the injected `service.addJob` — never
  construct bullmq Queues/Workers directly. Use a non-arrow worker handler so
  `this` binds to the Moleculer service.
- **Boot via `ApiController.Start`** (never `new ServiceBroker`) after
  side-effect-importing `'./services'`; gate process role with env
  (`SERVICES`/`WORKERS_ENABLED`/`WORKERS`) so the same binary runs as
  API-gateway, worker, or single-service.
- **Define transport DTOs (request/response shapes) in the service's `types.ts`**
  (shaped for typia + OpenAPI), separate from domain types; do NOT declare
  `addJob`/`getQueue` on the `ServiceContext` — api-core injects them when queue
  config is present.

## Pitfalls

- **Forgetting the side-effect import.** A service that is never imported
  (directly or via `services/index.ts`) is invisible to `ApiController.Start` — it
  silently does not register. The whole discovery mechanism is module-load side
  effects.
- **Importing actions/queues before lifecycle in the domain barrel.** The
  controller's started/stopped handlers and any `setWorkflows()` block won't be
  attached before the action/worker registrations, breaking `ctx.service` wiring
  and (for workflows) causing `broker.wf.run` to throw at runtime.
- **Deferring `setWorkflows()` into `addStartedHandler`.** `@moleculer/workflows`
  reads `schema.workflows` at `broker.createService()` time, which fires BEFORE
  any `started()` callback — the middleware sees an empty workflows block and the
  workflow name never registers. `setWorkflows` MUST be a module-load call.
- **Constructing adapters per-service** (e.g. `new MemoryVectorStore()` inside
  each lifecycle) instead of using the shared singleton: you get two independent
  in-memory stores in one process and cross-service reads (search-after-ingest)
  return zero results.
- **Using `instanceof RequestContext` to read the middleware-composed context.**
  tsup bundles a separate `RequestContext` class into each subpath
  (`@gertsai/runtime-context` root vs `/moleculer`), so an instance composed by
  `sessionMiddleware` is NOT `instanceof` the root export. Use structural
  duck-typing (check for `sessionOptional`/`tenantIdOptional`).
- **Writing the queue worker handler as an arrow function.** `this` will not bind
  to the Moleculer service, so `this.useCase` / `this.logger` / `this.broker` are
  undefined. api-core invokes the handler via `handler.call(service, ctx)`.
- **Declaring `addJob`/`getQueue` on the `ServiceContext` interface.** Those are
  injected by api-core only when a queue connection is configured; declaring them
  yourself fights the framework and misrepresents the no-Redis (inline) mode where
  they are absent.
- **Assuming auth is enforced because middlewares are registered.** With
  `ChainTenantResolver mode:'optional'` and action `auth:'none'`, unauthenticated
  requests pass through. Enforcement is the action's responsibility via
  `assertAuthenticated` (m9s made auth mandatory in Wave 12.E-fix-1 after exactly
  this gap).
- **Resolving the controller with a mismatched `(version, name)` across files of
  the same service.** You get a DIFFERENT controller instance and registrations
  land on the wrong synthesized schema. The version/name tuple is the join key.
- **Calling `setStageOverride` on a sensitive pipeline stage**
  (`establishAuthSession`/`validateRequest`/`validateResponse`/`injectTenantId`)
  without preserving its security semantics silently removes that check — api-core
  only emits a `logger.warn`, it does not block.

## Canonical files

All paths are relative to the repo root (`examples/m9s-example/...`).

- `examples/m9s-example/src/services/index.ts:81-107` — Top-level services barrel:
  calls `ApiController.configure({ sessionFactory, queue })` ONCE before any
  service import, then side-effect-imports each domain folder (`./ingest`,
  `./search`, `./auth`), then namespace re-exports for OpenAPI/typed clients.
- `examples/m9s-example/src/services/ingest/index.ts:15-21` — Per-service domain
  barrel: `import './lifecycle'` MUST be first (registers controller + handlers),
  then `export * from './src'` (actions + queues), then `export * from './types'`.
- `examples/m9s-example/src/services/ingest/lifecycle.ts:41-135` — Service
  lifecycle: resolves controller, `setRestBasePath('/')`, `setWorkflows()` at
  module-load (HARD requirement — middleware reads `schema.workflows` before any
  `started()` runs), `addStartedHandler` stashes the shared `infrastructure`
  singleton onto `ctx.service`, `addStoppedHandler` flips `_destroyed` flag.
- `examples/m9s-example/src/services/ingest/types.ts:35-48` — Per-service
  `IngestServiceContext extends ServiceContextBase` — declares the strongly-typed
  `ctx.service.<thing>` fields the lifecycle wires in; api-core adds
  `addJob`/`getQueue` automatically when queue config is present (NOT declared
  here).
- `examples/m9s-example/src/services/ingest/src/index.ts:11-14` — Service src
  barrel: re-exports `actions/` and `queues/` — importing it (transitively from
  the domain barrel) runs the module-load side-effect registrations.
- `examples/m9s-example/src/composition/infrastructure.ts:96-106` —
  `buildInfrastructure()` composition root: builds outbound-adapter graph
  (docStore/chunkStore/embedder/gate/rotationStore) via env-driven `pick*`
  helpers; exported as the module-load singleton `infrastructure` at line 366.
- `examples/m9s-example/src/composition/infrastructure.ts:190-232` —
  `pickStores()` — env-switch (`STORAGE_PROVIDER`) between
  `InMemoryStorageProvider`+`MemoryVectorStore` and Pg adapters; canonical pattern
  for backend selection lives in the composition root, not in services.
- `examples/m9s-example/src/composition/wave5-middlewares.ts:115-125` —
  `buildWave5Middlewares()` returns ordered broker middleware descriptors
  `[tenantMiddleware(resolver), sessionMiddleware({ resolver })]` — canonical order
  tenant→session per ADR-010 §B; spread into `BrokerOptions.middlewares`.
- `examples/m9s-example/src/composition/wave5-middlewares.ts:208-347` —
  `tryGetRequestContextFromCtx(ctx)`: reads `RequestContext` off
  `ctx.locals[REQUEST_CONTEXT_LOCALS_KEY]` (structural duck-typing, not
  `instanceof`) and projects to `{ session, expectedTenantId }`; action handlers
  call this to bridge middleware-composed context into use cases.
- `examples/m9s-example/src/lib/example-controller.ts:31-37` —
  `resolveExampleController<V, N, S>(version, name)`: thin generic facade over
  `ApiController.resolveController` so each service supplies its own
  `ServiceContext` type — every action/worker/lifecycle file in a service calls
  this with the SAME `(version, name)` to get the same controller instance.
- `examples/m9s-example/src/services/ingest/src/actions/ingest-document.action.ts:62-261` —
  Action: `defineAction(controller.register('document', { auth, rest, params, response, handler }))`
  — typia-validated transport layer; handler is pure transport delegating to
  `service.useCase`, mapping domain errors to `APIError`.
- `examples/m9s-example/src/services/ingest/src/queues/ingest-chunk.worker.ts:89-224` —
  Queue worker: `controller.registerWorker(QUEUE_NAME, [{ name, concurrency, handler }])`
  at module-load; non-arrow handler so `this` binds to the Moleculer service
  (typed via `IngestServiceContext`); delegates to `this.useCase.execute`.
- `examples/m9s-example/src/index.ts:46-172` — Entry point: `initObservability()`
  first, side-effect `import './services'`, then
  `ApiController.Start({ brokerConfig, services, workersEnabled, enabledServices, enabledWorkers })`
  — no direct `new ServiceBroker`.

## @gertsai packages used

- `@gertsai/api-core/moleculer` — `ApiController`, `defineAction`,
  `resolveController`, `ServiceContextBase`, `QueueHandlerCtx`, broker `Start`.
- `@gertsai/api-core/contracts` — `APIError`, `ResponseCode` for transport-layer
  error mapping.
- `@gertsai/core` — `defaultSession`, `UserType` for the `sessionFactory`.
- `@gertsai/tenant-resolver` — `ChainTenantResolver`, `HeaderStrategy`,
  `TenantResolverStrategy`.
- `@gertsai/tenant-resolver/moleculer` — `tenantMiddleware`.
- `@gertsai/runtime-context` — `RequestContext` type.
- `@gertsai/runtime-context/moleculer` — `sessionMiddleware`,
  `REQUEST_CONTEXT_LOCALS_KEY`.
- `@gertsai/session` — `Session` type.
- `@gertsai/session-guard` — `assertAuthenticated`, `assertSessionInTenant`.
- `@gertsai/tenant` — `asTenantId`, `TenantId`.
- `@gertsai/errors` — universal error taxonomy bridged from domain to transport.
- `@gertsai/entity-storage` — storage provider implementations behind the ports.
- `@gertsai/rest-request-manager` — outbound HTTP adapter (e.g. remote
  embedder/gate).
