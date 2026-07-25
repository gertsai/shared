# Building applications on the @gertsai stack

This guide shows how to build a production application on top of the published
`@gertsai/*` packages, wired the way the reference application
[`examples/m9s-example`](../examples/m9s-example) wires them. It is the
companion prose to the Claude Code skill `building-gertsai-apps` (whose
`references/` and `templates/` carry the full per-concern depth) and to
[`guides/CONSUMING-PACKAGES.ru.md`](./CONSUMING-PACKAGES.ru.md) (which covers
how to *install* `@gertsai/*` in a consuming project — versions, peer deps,
subpath exports). Read this when you need to *structure and build* an app, not
just install the packages.

The English in this guide and all code identifiers are deliberate; comments and
copy paths follow the repo conventions.

## What the @gertsai stack is

`@gertsai/*` is a 38-package OSS infrastructure monorepo: a finite set of
framework-agnostic primitives (errors taxonomy, tenant resolution, runtime
context, session + session-guard, entity/storage abstractions, query DSL,
pg-client, OpenFGA auth, OTel, logger factory, rate limiter, and a Moleculer SDK
called `@gertsai/api-core`). An *application* composes these behind a hexagonal
core and exposes them over a Moleculer broker. You can build:

- HTTP/RPC services with a declarative REST gateway (`@gertsai/api-core`).
- Async pipelines with BullMQ queues and workers.
- Realtime UIs over Server-Sent Events plus durable cross-service events
  (`@moleculer/channels`).
- Durable, replayable workflows (`@moleculer/workflows`).
- Multi-tenant, authenticated, authorized backends (JWT + OpenFGA ReBAC).

`examples/m9s-example` exercises all of the above on a deliberately tiny
"ingest + semantic search" workload — the architecture is the lesson, not the
feature set.

## Architecture & mental model

Two orthogonal axes hold the whole design together.

**Axis 1 — the hexagonal dependency rule.** Code flows in exactly one
direction:

```
domain/  →  application/  →  infrastructure/  →  services/
```

- `domain/` — `readonly` entity interfaces + invariant-guarding factory
  functions, plus outbound **port** interfaces (`domain/ports/IFoo.ts`). The
  *only* `@gertsai` import allowed here is the Shared Kernel `@gertsai/errors`.
- `application/` — class-based use-cases with constructor-injected ports. No
  I/O of its own; every side effect goes through a port. Imports only `domain/`.
- `infrastructure/` — concrete adapters that `implements IFoo`. May import any
  `@gertsai/*` package and external drivers.
- `services/` — the Moleculer transport edge: controllers, actions, lifecycle,
  workers, wiring.

The single **composition root** `src/composition/infrastructure.ts` is the only
file that imports concrete adapter classes. It selects adapters by environment
variable (`pickStores` / `pickEmbedder` / `pickGate` / `pickRotationStore`) and
exports the built graph as a module-load **singleton**:
`export const infrastructure = buildInfrastructure()`. Sharing one instance
across services is what lets a write through `ingest` be visible to a query
through `search` in the same process. Swapping a backend
(`InMemoryStorageProvider` → `PgStorageProvider`, `MockEmbedder` → Ollama,
`AllowAll` → OpenFGA) is a **one-file change** with zero domain/application
edits.

**Axis 2 — the Moleculer lifecycle owned by `@gertsai/api-core/moleculer`.** The
app never calls `new ServiceBroker()`. Controllers register themselves as
**import side-effects**; `ApiController.configure(...)` seeds the static
registry **once**; `ApiController.Start({ brokerConfig, services, ... })` builds
the broker, synthesizes one Moleculer service schema per registered controller,
and starts everything. This guarantees ordering: lifecycle handlers, workflow
blocks, and queue worker registrations all attach **before** `broker.start()`.

Cross-cutting concerns sit at the **broker-middleware seam** — `tenantMiddleware`
then `sessionMiddleware`, in that order — and at small composition facades
(logger redaction, HTTP error scrubbing, the neutral error kernel). They never
leak into business code.

## Build a new app from scratch (ordered walkthrough)

1. **Lay out the hexagon and the boot chain.** Create `src/{domain,application,
   infrastructure,services,composition,shared,lib,mol-services}`,
   `project.config.ts`, `moleculer.config.ts`, `src/index.ts`. See
   *Project bootstrap* below and `references/bootstrap.md`.
2. **Author config** in `project.config.ts` (parsed once, `loadConfig`
   overlay). See *Configuration*.
3. **Model the domain**: entities + factories + outbound ports + use-cases. See
   *Domain core*.
4. **Build the composition root** with env-driven `pick*` helpers and the
   module-load singleton. See *Service modules & composition*.
5. **Wire the Wave 5 middleware stack** (tenant → session) and the neutral error
   kernel + scrubber in `shared/`. See *Cross-cutting*.
6. **Stand up the API gateway** (`createApiService`) and one `ApiController` per
   service. See *API gateway & controllers*.
7. **Write actions** as pure transport (`defineAction`). See *Actions*.
8. **Add async** (queues/workers), **realtime** (SSE/channels), and **durable
   workflows** as the workload needs them.
9. **Add auth** (JWT) and **authorization** (`IPermissionGate` / OpenFGA),
   fail-closed.
10. **Pick storage backends** behind the ports.
11. **Test** (two-tier), containerize, and deploy.

Each concern below gives a tight narrative, its key template (fenced), and a
link to the skill reference doc for full depth.

---

## 1. Project bootstrap & entrypoint

A `@gertsai` app boots through a strict 3-stage entrypoint owned by
`ApiController.Start`. `project.config.ts` parses env once; `moleculer.config.ts`
is a pure `export default brokerConfig` literal (Console logger, `M9sCacheCacher`,
env-driven transporter, `validator: false`, the Wave 5 middleware stack, and
`@moleculer/channels` + `@moleculer/workflows` pushed only when `REDIS_URL` is
set); `src/index.ts` initializes OTel **first**, side-effect-imports `./services`
(which calls `ApiController.configure` once and registers all controllers), then
hands everything to `ApiController.Start`. Broker startup is guarded behind
`require.main === module` so tests can import the entrypoint inertly. Build with
`tspc` (ts-patch + typia), dev with `ts-node-dev`.

```ts
// src/index.ts — entrypoint. NEVER `new ServiceBroker()`.
import { initObservability, shutdownObservability } from './observability';
initObservability(); // first — before span-creating modules load (no-op if OTEL unset)

import './services'; // side-effect: configure() ONCE + register all controllers

import { ApiController } from '@gertsai/api-core/moleculer';
import config from '../project.config';
import brokerConfig from '../moleculer.config';
import ApiService from './mol-services/api.service';

async function main(): Promise<void> {
  await ApiController.Start({
    brokerConfig,
    services: [ApiService /* , openApiService, channelService */],
    repl: process.argv.includes('--repl'),
    workersEnabled: config.WORKERS_ENABLED,      // false => producer-only node
    // ...(enabledServices && { enabledServices }), // from SERVICES env
  });
}

if (require.main === module) {
  process.once('SIGTERM', (s) => void shutdownObservability().finally(() => process.kill(process.pid, s)));
  main().catch((err: unknown) => { console.error(err); process.exit(1); });
}
export { main };
```

Full depth: `.claude/skills/building-gertsai-apps/references/bootstrap.md`.
Template: `templates/app-bootstrap.ts`.

## 2. Configuration & run modes

All knobs live in a single typed `project.config.ts`, parsed once at import time.
A ~25-line `loadConfig()` overlays `process.env` onto literal defaults with
type coercion (boolean: `'true'`/`'1'`; number: `Number()`; string verbatim).
Run modes are **not** separate files — they are env-var branches at the
consumption sites: the transporter ternary in `moleculer.config.ts`, the `pick*`
switches in the composition root, the SSE/OTel reads in their own modules. The
master async-infra gate is `REDIS_URL` (BullMQ + channels + workflows + durable
rotation store); the Redis *transporter* additionally needs `TRANSPORT_TYPE=Redis`.

```ts
// project.config.ts — single typed config, parsed ONCE
import 'dotenv/config'; // MUST precede any process.env read
import { loadConfig } from './src/utils/project-config';

const config = loadConfig({
  APP_NAME: 'my-app',
  API_VERSION: 'v1',
  WEB_SERVER_PORT: 3000,
  TRANSPORT_TYPE: 'Local' as 'Local' | 'Redis' | 'NATS',
  REDIS_URL: '',                                  // the single async-infra gate
  STORAGE_PROVIDER: 'memory' as 'memory' | 'postgres',
  AUTH_GATE: 'allow-all' as 'allow-all' | 'openfga', // refused under NODE_ENV=production
  EMBEDDER_PROVIDER: 'mock' as 'mock' | 'ollama' | 'openai',
  WORKERS_ENABLED: true,
  NODE_ENV: 'development',
});
export type Config = typeof config;
export default config;
```

Validate enum values at the `pick*` switch (throw naming the missing companion
var), not in `loadConfig`. Fail-closed in production: `AUTH_GATE='allow-all'`
throws under `NODE_ENV=production`.

Full depth: `references/configuration.md`. Template: `templates/project.config.ts`.

## 3. Domain, ports & use-cases (hexagonal core)

Entities are `readonly` interfaces with a `createX()` factory that throws
`ValidationError` from `@gertsai/errors`. Every external dependency is an
I-prefixed port interface in `domain/ports/`. Use-cases are classes taking one
constructor `deps` object (typed to ports, never impls) with one `execute(input)`
method: optional session-guard assertions → fail-closed authZ gate → build entity
→ call ports → return. Because use-cases do no real I/O, they unit-test with
`vi.fn()` stubs.

```ts
// application/DoSomethingUseCase.ts
import { ValidationError } from '@gertsai/errors';
import { assertAuthenticated, assertSessionInTenant } from '@gertsai/session-guard';
import type { Session } from '@gertsai/session';
import type { IFooStore } from '../domain/ports/IFooStore';
import type { IPermissionGate } from '../domain/ports/IPermissionGate';
import { permissionDenied } from '../shared/errors';

export interface DoSomethingDeps { readonly fooStore: IFooStore; readonly gate: IPermissionGate; }
export interface DoSomethingInput {
  readonly userId: string; readonly docId: string; readonly text: string;
  readonly session?: Session; readonly expectedTenantId?: string; // optional, additive
}

export class DoSomethingUseCase {
  constructor(private readonly deps: DoSomethingDeps) {}
  async execute(input: DoSomethingInput): Promise<{ docId: string }> {
    const { userId, docId, text, session, expectedTenantId } = input;
    if (session !== undefined) {                  // back-compat guard
      assertAuthenticated(session);
      if (expectedTenantId !== undefined) assertSessionInTenant(session, expectedTenantId);
    }
    if (!(await this.deps.gate.can(userId, 'do-something', docId))) {
      throw permissionDenied(userId, 'do-something', docId); // fail closed, before side effects
    }
    if (text.trim().length === 0) throw new ValidationError({ message: 'text required', details: { field: 'text' } });
    await this.deps.fooStore.save({ id: docId, text });
    return { docId };
  }
}
```

Keep the neutral error kernel in `shared/` (not `composition/`) so all layers can
import it without inverting hex direction.

Full depth: `references/domain-core.md`. Template: `templates/DoSomethingUseCase.ts`.

## 4. Service modules & composition

A "service" is a directory under `src/services/` that resolves one
`ApiController` via `resolveExampleController<V, N, ServiceContext>(version,
name)` and registers actions, workers, and lifecycle handlers against it as
**module-load side-effects**. Wiring order is strict: `ApiController.configure`
runs first (in `services/index.ts`, before any service import); each domain
barrel does `import './lifecycle'` first; `ApiController.Start` synthesizes the
schemas. The `addStartedHandler` stashes the shared `infrastructure` singleton
onto the typed `ctx.service.<dep>`.

```ts
// src/services/<svc>/lifecycle.ts — controller wiring + handlers
import { resolveExampleController } from '../../lib/example-controller';
import { infrastructure } from '../../composition/infrastructure';
import { MyUseCase } from '../../application/MyUseCase';
import type { MyServiceContext } from './types';

const controller = resolveExampleController<'v1', 'myservice', MyServiceContext>('v1', 'myservice');
controller.setRestBasePath('/'); // gateway already prefixes /api/v1 — avoid duplication

const useCase = new MyUseCase(infrastructure); // module-load: stable ref (workflow timing)

controller.addStartedHandler(async (ctx) => {
  ctx.service.store = infrastructure.store;      // SAME singleton across services
  ctx.service.useCase = useCase;
});
controller.addStoppedHandler(async (ctx) => {
  (ctx.service as { _destroyed?: boolean })._destroyed = true;
});
export { controller };
```

Declare your wiring on the `ServiceContext` interface, but do **not** declare
`addJob` / `getQueue` — api-core injects those when a queue is configured.

Full depth: `references/services.md`. Template: `templates/service-module.lifecycle.ts`.

## 5. API gateway & controllers

The HTTP surface is built from two halves: an **API gateway** Moleculer service
from `createApiService(options, packageJson)` (mounts `moleculer-web` with
`routes[].autoAliases` + a `whitelist` of action globs like `v1.**`, an
Express-style `settings.use` chain for CORS/rate-limit/SSE), and **one
`ApiController` per service**. Routing is declarative (driven by each action's
`rest` string); the `whitelist` is the security boundary. `onAfterCall` wraps
results in the response envelope; `onError` maps thrown `APIError` to HTTP status.

```ts
// src/mol-services/api.service.ts
import { createApiService } from '@gertsai/api-core/moleculer';
const pkg = require(`${process.cwd()}/package.json`) as Record<string, unknown>;

export default createApiService(
  {
    name: 'api',
    settings: {
      port: Number(process.env.WEB_SERVER_PORT ?? 3000),
      cors: { origin: '*', methods: ['GET', 'POST', 'OPTIONS'] }, // NEVER '*' + credentials in prod
      rateLimit: null,                       // disable built-in; api-rlr is the single pass
      use: [],                               // RLR / SSE chain goes here
      routes: [{
        path: '/api/v1',
        autoAliases: true,                   // derive REST paths from action `rest` strings
        whitelist: ['v1.**'],                // ** matches nested action names — security boundary
        authentication: false, authorization: false,
        bodyParsers: { json: { strict: false, limit: '1MB' } },
      }],
    },
  },
  pkg,
);
```

`disableAuth: true` is a no-op since Wave 16.A — auth is consumer-mounted
middleware now. Use `setRestBasePath('/')` so the gateway prefix isn't doubled.

Full depth: `references/api-controllers.md`. Template: `templates/api-gateway-and-controllers.template.ts`.

## 6. Actions & request handling

Every endpoint is `defineAction(controller.register(name, options))`. The
`defineAction` brand keeps typia transformer-only types out of the emitted
`.d.ts` without `: any`. The handler is **pure transport**: typia-validated
`params`/`response`, an `auth` mode, a `rest` route (omit it for a broker-only
internal action), and a destructuring handler that asserts the session
fail-closed, delegates to a use-case, and maps `@gertsai/errors` to `APIError`.

```ts
// src/services/<svc>/src/actions/my.action.ts
import { APIError, ResponseCode } from '@gertsai/api-core/contracts';
import { defineAction } from '@gertsai/api-core/moleculer';
import { isAppError } from '@gertsai/errors';
import { AuthenticationRequiredError, TenantScopeViolationError, assertAuthenticated, assertSessionInTenant } from '@gertsai/session-guard';
import typia from 'typia';
import { resolveExampleController } from '../../../../lib/example-controller';
import { tryGetRequestContextFromCtx } from '../../../../composition/wave5-middlewares';
import { appErrorToHttpResponse } from '../../../../shared/error-scrubber';
import type { MyServiceContext, MyRequest, MyResponse } from '../../types';

const controller = resolveExampleController<'v1', 'myservice', MyServiceContext>('v1', 'myservice');

export const myAction = defineAction(controller.register('do', {
  auth: 'none',                              // 'required' once a real auth middleware is wired
  rest: 'POST /myservice/do',
  params: typia.createValidate<MyRequest>(),
  response: typia.createValidate<MyResponse>(),
  responseCode: ResponseCode.SUCCESS_CREATED,
  async handler({ params, ctx, service, respond }) {
    try {
      const { session, expectedTenantId } = tryGetRequestContextFromCtx(ctx);
      assertAuthenticated(session);            // fail-closed, BEFORE any side effect
      if (expectedTenantId !== undefined) assertSessionInTenant(session, expectedTenantId);
      const result = await service.useCase.execute({ ...params, session, ...(expectedTenantId !== undefined && { expectedTenantId }) });
      return respond(result as MyResponse);
    } catch (err) {
      if (err instanceof AuthenticationRequiredError) { const { body } = appErrorToHttpResponse(err); throw new APIError(ResponseCode.UNAUTHORIZED_REQUEST, body.details as never, 'Authentication required'); }
      if (err instanceof TenantScopeViolationError) { const { body } = appErrorToHttpResponse(err); throw new APIError(ResponseCode.FORBIDDEN__INSUFFICIENT_RIGHTS, body.details as never, 'Tenant scope violation'); }
      if (isAppError(err)) { const { body } = appErrorToHttpResponse(err); throw new APIError(ResponseCode.INTERNAL_ERROR, body.details as never, body.title); }
      throw err;                              // unknowns → framework default 500
    }
  },
}));
```

Full depth: `references/actions.md`. Template: `templates/myaction.action.ts`.

## 7. Queues & workers

BullMQ is owned end-to-end by api-core — never `new Queue`/`new Worker`. The
producer is enabled by `ApiController.configure({ queue })` (gated on
`REDIS_URL`); the consumer is registered at module-load via
`controller.registerWorker(queueName, [{ name, concurrency, handler }])`. api-core
creates one `Worker` per queue routing on `job.name`, honoring `workersEnabled` /
`enabledWorkers` for producer-only vs worker-node deploys. The action gates on
`!!config.REDIS_URL`: enqueue (`mode:'queued'`) or run the use-case inline.

```ts
// queues/<feature>.worker.ts — module-load side-effect registration
import type { QueueHandlerCtx } from '@gertsai/api-core/moleculer';
import type Moleculer from 'moleculer';
import { resolveExampleController } from '../../../../lib/example-controller';
import config from '../../../../../project.config';
import type { MyServiceContext } from '../../types';

export const MY_QUEUE_NAME = 'myapp.myqueue' as const;
export const JOB_DO_WORK = 'do-work' as const;
export interface MyJobData { id: string; text: string; }

type MyQueueThis = MyServiceContext & Pick<Moleculer.Service, 'logger' | 'broker'>;
const controller = resolveExampleController<'v1', 'myservice', MyServiceContext>('v1', 'myservice');

controller.registerWorker(MY_QUEUE_NAME, [{
  name: JOB_DO_WORK,
  concurrency: config.WORKER_CONCURRENCY,
  // NON-arrow so `this` binds to the service (api-core calls handler.call(service, ctx)).
  async handler(this: MyQueueThis, ctx: QueueHandlerCtx<import('bullmq').Job<MyJobData>>) {
    if ((this as { _destroyed?: boolean })._destroyed === true) return;
    return this.useCase.execute(ctx.job.data); // delegate — keep the worker thin; rethrow → BullMQ retry
  },
}]);
```

Set retry policy in `defaultJobOptions`; use `ioredis` with
`maxRetriesPerRequest: null`.

Full depth: `references/queues-workers.md`. Template: `templates/queue-worker.worker.ts`.

## 8. Channels & SSE realtime

Two distinct mechanisms — do not conflate. **SSE** pushes per-entity lifecycle
frames to the browser via a bare `moleculer-web` `(req, res)` `AliasFunction`
(not a Moleculer action) backed by an in-process `EventEmitter` keyed by `docId`,
with a per-`docId` replay buffer for late subscribers. It is best-effort and
single-process; it re-implements auth + rate limits inline because it bypasses
the gateway. **`@moleculer/channels`** (Redis Streams) provides durable,
at-least-once, cross-service events for backend side-effects; handlers must be
idempotent and are gated on `REDIS_URL`.

```ts
// Durable channel consumer — thin Moleculer service, ONLY a `channels` property.
import type { ServiceSchema, Service } from 'moleculer';
export const DOCUMENT_INDEXED_CHANNEL = 'myapp.document.indexed' as const;

const ChannelService: ServiceSchema = {
  name: 'channel-document-events',
  channels: {
    [DOCUMENT_INDEXED_CHANNEL]: {
      group: 'document-events-readers',      // same group = load-balanced; new group = fan-out copy
      maxRetries: 5,
      deadLettering: { enabled: true, queueName: 'myapp:document.indexed:dlq' },
      async handler(this: Service, payload: { docId: string; chunkCount: number }) {
        // AT-LEAST-ONCE: MUST be idempotent. Throwing -> NACK -> retry -> DLQ.
        this.logger?.info(`[channel] doc=${payload.docId} chunks=${payload.chunkCount}`);
      },
    },
  },
};
export default ChannelService;
```

Producers publish with `if (broker?.sendToChannel) await broker.sendToChannel(...)`
(undefined without Redis). Emit the **same** SSE frame sequence from both inline
and queued paths so the UI has one code path.

Full depth: `references/channels-sse.md`. Template: `templates/realtime-sse-and-channels.template.ts`.

## 9. Durable workflows with replay

Author a pure, transport-agnostic `WorkflowDefinition<TInput, TOutput>` from
`@gertsai/core` (name/version/params/`handler(input, signal)`, no Moleculer
types) via a factory that injects the use-case. Register it at **module-load**
with `setWorkflows(controller, { key: def })` — the `@moleculer/workflows`
middleware reads `schema.workflows` during synchronous service creation, before
any `started()` callback. The middleware is gated on `REDIS_URL` (the durable
journal); the trigger action guards `broker.wf` and chooses sync
(`await job.promise()`) or async (return job id). Replay re-runs the handler, so
everything replayed must be deterministic.

```ts
// application/MyProcessWorkflow.ts
import type { WorkflowDefinition, WorkflowSignal } from '@gertsai/core';
import type { MyUseCase } from './MyUseCase';

export function createMyProcessWorkflow(deps: { readonly useCase: MyUseCase }): WorkflowDefinition<{ id: string; text: string }, { id: string; status: 'completed' }> {
  const { useCase } = deps;
  return {
    name: 'my.process', version: 1,
    params: { id: 'string', text: { type: 'string', min: 1 } } as const,
    async handler(input, _signal: WorkflowSignal) {
      // REPLAY SAFETY: this single call re-runs entirely on replay — safe only if deterministic.
      const result = await useCase.execute({ userId: 'anonymous', id: input.id, text: input.text });
      return { id: result.id, status: 'completed' };
    },
  };
}
// lifecycle.ts (module-load): setWorkflows(controller as never, { process: createMyProcessWorkflow({ useCase }) });
// runtime name = `<svc.fullName>.<key>` => 'v1.my.process'; call broker.wf.run('v1.my.process', payload).
```

Full depth: `references/workflows.md`. Template: `templates/durable-workflow.workflow.ts`.

## 10. Auth & authorization (JWT + OpenFGA)

Authentication (who you are) and authorization (what you may do) never mix.
**Auth** is JWT: HS256 access (15 min) + refresh (24 h) tokens via pure helpers;
refresh tokens carry a `jti` and use rotation + reuse-detection backed by a DI'd
`IRotationStore`; login runs a constant-time anti-enumeration bcrypt compare.
**AuthZ** is a one-method port `IPermissionGate.can(userId, action, resource)`
with two adapters — `AllowAllPermissionGate` (dev) and `OpenFgaPermissionGate`
(fail-closed: any error denies) — selected by env at the composition root and
enforced inside use-cases before any side effect.

```ts
// src/services/auth/src/jwt.ts
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
const ISSUER = 'my-app';
function getSecret(): string { const s = process.env.JWT_SECRET; if (!s) throw new Error('JWT_SECRET must be set'); return s; } // no default secret (CWE-798)

export interface JwtClaims { sub: string; email: string; tenantId: string; kind: 'access' | 'refresh'; iat: number; exp: number; iss: string; jti?: string; }

export function verifyToken(token: string): JwtClaims | null {
  try {
    const d = jwt.verify(token, getSecret(), { algorithms: ['HS256'], issuer: ISSUER });
    if (typeof d === 'string') return null;
    const p = d as Record<string, unknown>;
    if (typeof p.sub !== 'string' || (p.kind !== 'access' && p.kind !== 'refresh')) return null;
    return { sub: p.sub, email: String(p.email), tenantId: String(p.tenantId), kind: p.kind, iat: Number(p.iat), exp: Number(p.exp), iss: String(p.iss), ...(typeof p.jti === 'string' && { jti: p.jti }) };
  } catch { return null; }
}
```

Callers MUST check `claims.kind`. On raw HTTP endpoints (SSE) re-authenticate and
cross-check `claims.tenantId` against the requested tenant (IDOR / CWE-639).

Full depth: `references/auth-authz.md`. Template: `templates/auth-jwt-and-permission-gate.skeleton.ts`.

## 11. Errors, tenant, runtime-context, session-guard, rate-limit

The Wave 5 cross-cutting stack flows tenant identity and request context from
the broker boundary into use-cases via two middlewares in fixed order:
`tenantMiddleware` (resolves `X-Tenant-ID` onto `ctx.meta.tenantId`) then
`sessionMiddleware` (composes a `RequestContext` onto `ctx.locals.requestContext`
and `$freeze()`s it before the handler). Handlers project the frozen context with
`tryGetRequestContextFromCtx` (duck-typed, not `instanceof` — tsup ships a class
copy per subpath), enforce identity with `@gertsai/session-guard`, throw the
`@gertsai/errors` taxonomy, and scrub PII at the HTTP boundary via a local
`appErrorToHttpResponse`. Rate limiting is a separate `moleculer-web`
`settings.use` middleware from `@gertsai/api-rlr`, gated on `REDIS_URL`, with a
format-validated tenant-then-IP bucket key.

```ts
// src/composition/wave5-middlewares.ts — tenant → session, canonical order
import type { Context } from 'moleculer';
import { ChainTenantResolver, HeaderStrategy, type TenantResolverStrategy } from '@gertsai/tenant-resolver';
import { tenantMiddleware } from '@gertsai/tenant-resolver/moleculer';
import { REQUEST_CONTEXT_LOCALS_KEY, sessionMiddleware } from '@gertsai/runtime-context/moleculer';
import type { RequestContext } from '@gertsai/runtime-context';

export function buildWave5Middlewares(): readonly unknown[] {
  const header = new HeaderStrategy({ headerName: 'X-Tenant-ID', trustProxy: true }); // CWE-639: needs a proxy that strips inbound header
  const adapted: TenantResolverStrategy<Context> = {
    name: header.name,
    async resolve(ctx) {
      const h = (ctx.meta as Record<string, unknown>)?.['headers'];
      if (!h || typeof h !== 'object' || Array.isArray(h)) return null;
      return header.resolve({ headers: h as Record<string, string | string[] | undefined> });
    },
  };
  const resolver = new ChainTenantResolver<Context>([adapted], { mode: 'optional' });
  return [tenantMiddleware(resolver), sessionMiddleware({ resolver })]; // ORDER MATTERS
}

export function tryGetRequestContextFromCtx(ctx: Context): { session: unknown; expectedTenantId: string | undefined } {
  const value = (ctx as unknown as { locals?: Record<string, unknown> }).locals?.[REQUEST_CONTEXT_LOCALS_KEY];
  if (!value || typeof value !== 'object' || !('sessionOptional' in value) || !('tenantIdOptional' in value)) return { session: undefined, expectedTenantId: undefined };
  const rc = value as RequestContext;
  const raw = rc.tenantIdOptional;
  return { session: rc.sessionOptional, expectedTenantId: raw !== undefined && raw.length > 0 ? raw : undefined };
}
```

Full depth: `references/cross-cutting.md`. Template: `templates/wave5-cross-cutting.reference.ts`.

## 12. Storage adapters & ports (swapping backends)

Domain/application depend only on outbound ports; `infrastructure/` holds
concrete adapters; the composition root selects them by env. Two storage
strategies sit behind the *same* port: **A** — `BaseEntityStorageService` over a
pluggable `IStorageProvider` (`InMemoryStorageProvider` dev, `PgStorageProvider`
prod), jsonb-blob shaped with free audit stamping, for generic entities; **B** —
direct `@gertsai/pg-client` raw SQL adapters when the schema is normalised
(`tenant_id`/`owner_uuid`/`vector(768)` columns). Depend on the `PgClient`
3-method interface, never on `pg` directly, so `mockPgClient` substitutes in
tests. Multi-tenant SQL adapters carry `WHERE tenant_id = $1` on **every**
statement (defence-in-depth, ADR-011 I-13).

```ts
// composition/infrastructure.ts — the ONLY place concrete adapters are constructed
import config from '../../project.config';
import { InMemoryStorageProvider } from '@gertsai/entity-storage';
import { asTenantId } from '@gertsai/tenant';

function pickThingStore(): IThingStore {
  switch (config.STORAGE_PROVIDER) {
    case 'postgres': {
      if (!config.POSTGRES_URL) throw new Error("STORAGE_PROVIDER='postgres' requires POSTGRES_URL.");
      const client = new PgClientAdapter({ connectionString: config.POSTGRES_URL });
      return new PgThingRepository({ client, tenantId: asTenantId(config.TENANT_ID), ownerUuid: config.DEFAULT_OWNER_UUID });
    }
    case 'memory':
    default:
      return new ThingRepository(new InMemoryStorageProvider<ThingMeta>(), systemSession);
  }
}
export const infrastructure = { thingStore: pickThingStore() }; // module-load singleton
```

Full depth: `references/storage-adapters.md`. Template: `templates/storage-port-and-adapters.ts`.

## 13. Testing, Docker & deployment

Two-tier tests. **Mock-mode** (`pnpm test`) is hermetic: use-case units mock the
domain ports with `vi.fn()`; e2e boots a real broker via `ApiController.Start`
over in-memory store + mock embedder. **Real-infra** (`pnpm test:real-infra`,
`VITEST_REAL_INFRA=1`) exercises live Postgres+pgvector / OpenFGA / Redis+BullMQ /
Ollama, each suite auto-probing its dependency and `describe.skip`ping when
absent. The critical build nuance: actions use `typia.createValidate<T>()`, only
inlined by the `tspc` build into `dist/` — so e2e tests import runtime
side-effects from the pre-built `dist/` via `createRequire` (CJS module identity
with the controller registry). Deployment is `docker compose up -d` for a
5-service stack (NATS/Redis/pgvector/OpenFGA/Ollama, localhost-bound,
healthchecked) plus a raw-SQL migration runner with `pg_advisory_xact_lock`.

```ts
// tests/app-e2e.test.ts — PRE-REQUISITE: `pnpm build` first.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'node:module';
const requireFromHere = createRequire(import.meta.url); // CJS identity, NOT ESM await import

process.env.JWT_SECRET ??= 'test-only-secret';

describe('app e2e', () => {
  let broker: any;
  beforeAll(async () => {
    process.env['STORAGE_PROVIDER'] = 'memory';  // set BEFORE the dist require
    process.env['EMBEDDER_PROVIDER'] = 'mock';
    requireFromHere('../dist/src/services/index.js');          // side-effect: registers controllers
    const { ApiController } = requireFromHere('@gertsai/api-core/moleculer');
    const brokerConfig = requireFromHere('../dist/moleculer.config.js').default;
    const ApiService = requireFromHere('../dist/src/mol-services/api.service.js').default;
    broker = await ApiController.Start({ brokerConfig: { ...brokerConfig, logger: { type: 'Console', options: { level: 'error' } } }, services: [ApiService], repl: false });
  }, 60_000);
  afterAll(async () => { if (broker) await broker.stop(); });

  it('runs an authenticated action', async () => {
    const resp = await broker.call('v1.myservice.do', { id: 'x' }, { meta: { headers: { 'x-tenant-id': 'tenant-acme' }, testSession: makeAuthSession({ tenantId: 'tenant-acme' }) } });
    expect(resp).toBeDefined();
  });
});
```

Set `fileParallelism: false` (broker boots are heavy). In production: never
`AUTH_GATE=allow-all`, supply `FGA_API_TOKEN`, keep `MIGRATIONS_AUTO_APPLY=false`,
and front the broker with a proxy that strips client-supplied `X-Tenant-ID`.

Full depth: `references/testing-deploy.md`. Template: `templates/app-e2e.test.ts`.

---

## Troubleshooting / FAQ

**`ServiceNotFoundError` at broker boot in tests.** You imported
`@gertsai/api-core/moleculer` via ESM `await import` while the `dist/`
side-effect uses CJS `require` — two `ApiController` class identities, empty
`_controllers`. Route every test import through `createRequire(import.meta.url)`.

**`NoTransformConfigurationError` on import.** You imported app runtime from
`src/` in a test. `typia.createValidate<T>()` needs the `tspc` transform that
vitest's esbuild does not run — run `pnpm build` and import from `dist/`.

**Search always returns 0 results.** Either two independent in-memory stores
(you constructed adapters per-service instead of using the composition-root
singleton), or you are using `MockEmbedder` (deterministic hash, no semantic
similarity). Share one `infrastructure` instance; use a real Ollama embedder for
relevance.

**`broker.wf.run(...)` throws "unknown workflow" / TypeError.** Either you
registered workflows inside `addStartedHandler` (must be module-load via
`setWorkflows`), called the bare key instead of `<svc.fullName>.<key>`, or
`REDIS_URL` is unset (no `broker.wf`). Guard `broker.wf` in the action.

**Workers never run / `addJob` is undefined.** `addJob`/`getQueue` are injected
only when `ApiController.configure({ queue })` got a connection (i.e. `REDIS_URL`
set). Gate the producer on `!!config.REDIS_URL` with an inline fallback. Also:
worker handlers must be non-arrow functions (so `this` binds to the service), and
registration must be a module-load side-effect.

**Tenant scoping silently lost.** You reordered the middlewares. Keep the
canonical `[tenantMiddleware, sessionMiddleware]` so `tenantMiddleware` sets
`ctx.meta.tenantId` before `sessionMiddleware` composes and `$freeze()`s the
`RequestContext`. **Caveat — do not reason from array index.** Moleculer's
`middlewares` array wrap order is counterintuitive; the dual-probe analysis in
`examples/m9s-example/tests/e2e.test.ts` documents the real semantics. Two things
keep this robust regardless: the canonical pair is verified-correct, and
`sessionMiddleware` re-resolves the tenant through the *shared resolver* if
`ctx.meta.tenantId` is missing. If you add a third cross-cutting middleware,
confirm behavior with a probe rather than assuming a position. Also confirm the
edge proxy strips inbound `X-Tenant-ID` when `trustProxy: true`.

**Unauthenticated requests pass through.** With `ChainTenantResolver mode:'optional'`
and action `auth:'none'`, enforcement is the action's job — call
`assertAuthenticated` unconditionally at the boundary; do not wrap it in
`if (session !== undefined)`.

**Path duplication like `/api/v1/ingest/v1/ingest/...`.** Call
`controller.setRestBasePath('/')` in the lifecycle — `autoAliases` re-prefixes
the service name on top of the gateway route.

**SSE stream hangs for 30s.** You never emitted a terminal `done`/`error` frame,
or a late subscriber connected after a synchronous inline run finished — buffer
and replay the last N events per `docId`.

**Where is the real code?** `examples/m9s-example/` is the canonical reference;
every reference doc cites exact `path:line` anchors into it. For installing the
packages, see `guides/CONSUMING-PACKAGES.ru.md`. For full per-concern depth, see
`.claude/skills/building-gertsai-apps/references/`.
