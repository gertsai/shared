# API gateway & controllers

## What & why

In `m9s-example`, the HTTP surface is built from **two halves** of
`@gertsai/api-core`:

1. **An API gateway Moleculer service** produced by
   `createApiService(options, packageJson)` from `@gertsai/api-core/moleculer`.
   It mounts `moleculer-web` with `routes[].autoAliases` + `whitelist` and an
   Express-style `settings.use` middleware chain (CORS, `@gertsai/api-rlr`
   rate-limit, SSE handlers).
2. **One `ApiController` per domain service**, resolved via
   `ApiController.resolveController<V, N, S>(version, name)` (wrapped locally as
   `resolveExampleController`). Onto each controller, every action file calls
   `controller.register(name, { auth, rest, params, response, responseCode, handler })`
   wrapped in `defineAction(...)`.

Controllers register actions / workers / lifecycle handlers **as import
side-effects**. `ApiController.configure({ sessionFactory, queue, strictResponseValidation })`
runs **once** before service imports, and `ApiController.Start({ brokerConfig, services, ... })`
creates the broker, synthesizes a Moleculer `ServiceSchema` per controller, and
starts everything.

Actions stay **pure transport** — they typia-validate input, call an application
use case, and map domain errors to `APIError` / `ResponseCode`. The gateway's
`onAfterCall` wraps every result in `OrchestraApiResponse`, and `onError` maps a
thrown `APIError` to the right HTTP status. The result: routing is declarative
(driven by each action's `rest` string), the on-the-wire contract is
centralized at the gateway boundary, and business logic stays out of api-core.

## How it works in m9s-example

### Pattern: Gateway via `createApiService` + `autoAliases` + `whitelist`

- **What** — the HTTP gateway is a single Moleculer service built by
  `createApiService(options, packageJson)`. Routes use `autoAliases: true` so
  REST paths are derived from each action's `rest` string, gated by a
  `whitelist` of action-name globs (`v1.**`).
- **Why** — keeps routing declarative and decoupled from action code: adding an
  action with a `rest` string automatically exposes it under the route prefix,
  no manual alias table. The `whitelist` is the **security boundary** deciding
  which broker actions are reachable over HTTP.
- **How** — in `mol-services/api.service.ts`,
  `createApiService({ name:'api', settings:{ port, cors, rateLimit:null, use: rlrUseChain, routes:[{ path:'/api/v1', autoAliases:true, whitelist:['v1.**'], authentication:false, authorization:false, bodyParsers:{...} }] } }, pkg)`.
  `**` matches nested action names; `*` matches a single segment only.

### Pattern: One `ApiController` per service, resolved + typed

- **What** — each domain service has exactly one `ApiController` instance,
  obtained by `ApiController.resolveController<V, N, S>(version, name)` (here
  wrapped as `resolveExampleController`). The `S extends ServiceContextBase`
  generic types `ctx.service.*` for every handler.
- **Why** — `resolveController` is idempotent (memoised in
  `_controllers["${version}.${name}"]`), so the action file, the lifecycle file,
  and the worker file all reach the **same** controller instance. The `S`
  generic gives end-to-end typing of dependencies stashed by the lifecycle
  handler.
- **How** — define
  `interface XServiceContext extends ServiceContextBase { useCase: ...; gate: ... }`
  in `types.ts`, then
  `const controller = resolveExampleController<'v1','ingest',IngestServiceContext>('v1','ingest')`
  at the top of each file that touches the service.

### Pattern: Action = `defineAction(controller.register(...))` pure-transport handler

- **What** — an action export is
  `export const x = defineAction(controller.register('name', { auth, rest, params: typia.createValidate<Req>(), response: typia.createValidate<Res>(), responseCode, responseMessage, async handler({params,ctx,service,logger,respond,addJob}){...} }))`.
- **Why** — `defineAction` brands the result so typia transformer-only types
  don't leak into emitted `.d.ts` without resorting to `: any`. The handler stays
  pure transport (validate → call use case → `respond` or map error to
  `APIError`), keeping business logic in the application layer and independent of
  api-core.
- **How** — import `defineAction` from `@gertsai/api-core/moleculer`, `APIError`
  + `ResponseCode` from `@gertsai/api-core/contracts`, `typia` for validators.
  The handler destructures `{ params, ctx, service, logger, respond, addJob }`;
  return `respond(data, message?, code?)`. Map known domain errors to
  `throw new APIError(ResponseCode.X, data, message)` and re-throw the rest.

### Pattern: configure-once then side-effect-import registration

- **What** — `ApiController.configure({ sessionFactory, queue, strictResponseValidation })`
  is called **once** in `services/index.ts` before the side-effect imports of
  each domain service; those imports register controllers, lifecycle handlers,
  and workers as a module-load side effect.
- **Why** — `configure` seeds the static registry (sessionFactory, BullMQ
  connection) that `registerWorker` and the synthesized schema read.
  Side-effect import order matters: `lifecycle.ts` must run first so the
  controller and its started/stopped handlers exist before `ApiController.Start`
  iterates controllers.
- **How** — `services/index.ts`: build `queueConfig` from `REDIS_URL`,
  `ApiController.configure({ sessionFactory: ..., ...(queueConfig && {queue: queueConfig}), strictResponseValidation: NODE_ENV==='development' })`,
  then `import './ingest'; import './search'; import './auth';`. Each service's
  `index.ts` does `import './lifecycle'` first, then re-exports `./src` + `./types`.

### Pattern: Broker bootstrap via `ApiController.Start` (no manual `ServiceBroker`)

- **What** — `src/index.ts` side-effect-imports `./services`, then calls
  `ApiController.Start({ brokerConfig, services:[ApiService, ...openApiService], repl, workersEnabled, enabledServices, enabledWorkers })`.
  There is **no** direct `new ServiceBroker(...)`.
- **Why** — `Start` owns broker construction so it can synthesize a Moleculer
  `ServiceSchema` for every registered controller (`controller.generateServiceSchema()`)
  and start the broker after lifecycle handlers are wired — and so workflow
  middleware sees `schema.workflows` at service-creation time.
  `workersEnabled:false` gives API-gateway/producer-only mode (jobs added but not
  processed).
- **How** — pass the gateway service (`createDocumentsApiService()` default
  export) and any plain Moleculer services (channels, openapi) in the `services`
  array. Env-parse `SERVICES`→`enabledServices`, `WORKERS`→`enabledWorkers`,
  `--repl`→`repl`.

### Pattern: Response envelope + error mapping at the gateway boundary

- **What** — the gateway's `onAfterCall` wraps every action result in
  `OrchestraApiResponse(code, data, {success, raw})`; `onError` routes thrown
  errors through `sendError`, recognising `APIError` (structurally via
  `isAPIErrorLike`), Moleculer errors, and external auth errors and mapping them
  to a `ResponseCode` + HTTP status. RFC 9457 `ProblemDetails` is the outbound
  error shape when the Gerts envelope is enabled.
- **Why** — centralises the on-the-wire contract so action handlers only need to
  throw the right `APIError`; HTTP status, retryable flag, and client-safe JSON
  all derive from `ResponseCode`. Structural recognition survives the Moleculer
  transport boundary and pnpm dual-package hazards.
- **How** — handlers
  `throw new APIError(ResponseCode.FORBIDDEN__INSUFFICIENT_RIGHTS, scrubbedDetails as never, 'message')`.
  Opt into the RFC-030 envelope with `USE_GERTS_ENVELOPE=true` or
  `createApiService({ useGertsEnvelope:true })`; default output is
  `OrchestraApiResponse`.

### Pattern: Express-style middleware chain (CORS + api-rlr + SSE)

- **What** — cross-cutting HTTP concerns mount in `moleculer-web` `settings.use`
  (before Moleculer routes). m9s puts an env-driven CORS allow-list on
  `settings.cors`, a `@gertsai/api-rlr` `RLRMiddleware(...)` token-bucket in
  `use`, and disables `moleculer-web`'s built-in limiter with `rateLimit: null`.
- **Why** — Wave 16.A removed the legacy OAuth mixin — auth and rate limiting are
  now consumer-mounted middleware, not built-in. Keeping RLR as the only
  throttling pass avoids double-limiting; CORS must be an explicit allow-list
  (not `*`) once credentials/cookies are in play.
- **How** —
  `const rlrUseChain = config.RLR_ENABLED && config.REDIS_URL ? [RLRMiddleware({ timeFrame, limit, burst, strategy, prefix, store, bucketKeyResolver })] : []`.
  SSE routes use `use: []` to bypass RLR and do per-handler rate limiting; raw
  `(req,res)` handlers go in `aliases` (not Moleculer actions) with
  `bodyParsers:false`.

## Template

```ts
// SPDX-License-Identifier: Apache-2.0
// =============================================================================
// 1) GATEWAY SERVICE — src/mol-services/api.service.ts
// =============================================================================
import { createApiService } from '@gertsai/api-core/moleculer';
// import RLRMiddleware from '@gertsai/api-rlr';   // TODO: enable rate limiting
// import IORedis from 'ioredis';
import config from '../../project.config';

// package.json is embedded into the response envelope; resolve relative to cwd
// so it works from both src/ (dev) and dist/ (compiled).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pkg = require(`${process.cwd()}/package.json`) as Record<string, unknown>;

// TODO: parse CORS_ALLOWED_ORIGINS into an allow-list; fail-fast in production,
// fall back to '*' (+warn) in non-prod. NEVER ship '*' with credentials:true.
const corsOrigin: readonly string[] | '*' = '*';

// TODO: build your middleware chain. RLR sits BEFORE Moleculer routes.
const useChain: unknown[] = [];

export function createMyApiService() {
  return createApiService(
    {
      name: 'api',
      disableAuth: true, // no-op since Wave 16.A — mount auth in settings.use
      settings: {
        port: Number(process.env.WEB_SERVER_PORT ?? 3000),
        cors: {
          origin: corsOrigin === '*' ? '*' : [...corsOrigin],
          methods: ['GET', 'POST', 'OPTIONS'],
          allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-ID', 'X-Request-ID'],
          credentials: true, // only valid with an explicit origin list, not '*'
        },
        rateLimit: null, // disable moleculer-web's built-in limiter
        use: useChain,
        routes: [
          {
            path: '/api/v1',
            autoAliases: true,            // derive REST paths from action `rest` strings
            whitelist: ['v1.**'],         // ** matches nested action names; security boundary
            authentication: false,
            authorization: false,
            bodyParsers: {
              json: { strict: false, limit: '1MB' },
              urlencoded: { extended: true, limit: '1MB' },
            },
          },
          // TODO: add an /openapi route (whitelist ['v2.openapi.**']) and any
          // raw SSE routes (aliases:{ 'GET stream': handler }, bodyParsers:false).
        ],
      },
    },
    pkg,
  );
}
export default createMyApiService();

// =============================================================================
// 2) TYPED CONTROLLER FACADE — src/lib/example-controller.ts
// =============================================================================
import { ApiController } from '@gertsai/api-core/moleculer';
import type { ServiceContextBase } from '@gertsai/api-core/moleculer';

export function resolveExampleController<
  V extends string,
  N extends string,
  S extends ServiceContextBase = ServiceContextBase,
>(version: V, name: N) {
  return ApiController.resolveController<V, N, S>(version, name);
}

// =============================================================================
// 3) SERVICE CONTEXT + TRANSPORT TYPES — src/services/<svc>/types.ts
// =============================================================================
// import type { ServiceContextBase } from '@gertsai/api-core/moleculer';
export interface MyServiceContext extends ServiceContextBase {
  useCase: unknown; // TODO: your application use case, wired by the lifecycle
  // NOTE: do NOT declare addJob/getQueue here — api-core injects them when
  // ApiController.configure({ queue }) is set.
}
export interface MyRequest { /* TODO: typia-validated request shape */ id: string; }
export interface MyResponse { /* TODO: typia-validated response shape */ ok: boolean; }

// =============================================================================
// 4) LIFECYCLE — src/services/<svc>/lifecycle.ts  (import FIRST in index.ts)
// =============================================================================
// import { resolveExampleController } from '../../lib/example-controller';
const lifecycleController = resolveExampleController<'v1', 'mysvc', MyServiceContext>('v1', 'mysvc');
// REST already prefixed by the gateway route (/api/v1); '/' avoids v1/mysvc/v1/mysvc/...
lifecycleController.setRestBasePath('/');
lifecycleController.addStartedHandler(async (ctx) => {
  ctx.logger?.info('[v1.mysvc] starting...');
  ctx.service.useCase = /* TODO: construct from composition root */ {} as unknown;
});
lifecycleController.addStoppedHandler(async (ctx) => {
  ctx.logger?.info('[v1.mysvc] stopped.');
});
export { lifecycleController };

// =============================================================================
// 5) ACTION — src/services/<svc>/src/actions/my.action.ts
// =============================================================================
import { APIError, ResponseCode } from '@gertsai/api-core/contracts';
import { defineAction } from '@gertsai/api-core/moleculer';
import typia from 'typia';
// import { resolveExampleController } from '../../../../lib/example-controller';

const actionController = resolveExampleController<'v1', 'mysvc', MyServiceContext>('v1', 'mysvc');

export const myAction = defineAction(actionController.register('do', {
  auth: 'none', // TODO: 'required' once a real auth middleware is mounted
  rest: 'POST /mysvc/do', // method + path; auto-prefixed and exposed by autoAliases
  params: typia.createValidate<MyRequest>(),
  response: typia.createValidate<MyResponse>(),
  responseCode: ResponseCode.SUCCESS,
  responseMessage: 'Done',
  async handler({ params, ctx, service, logger, respond /*, addJob */ }) {
    logger.info('[v1.mysvc.do] received', { id: params.id });
    try {
      // TODO: call your application use case — keep this handler pure transport.
      const result = await (service.useCase as { execute(p: MyRequest): Promise<MyResponse> }).execute(params);
      return respond(result, 'Done');
    } catch (err) {
      // TODO: map known domain errors to APIError; re-throw the rest so the
      // gateway's onError maps them to ResponseCode.INTERNAL_ERROR.
      if (err instanceof Error && err.message.startsWith('Validation.')) {
        throw new APIError(ResponseCode.BAD_REQUEST__INVALID_PARAMS, undefined, err.message);
      }
      throw err;
    }
  },
}));

// =============================================================================
// 6) COMPOSITION ROOT — src/services/index.ts  (configure ONCE, then import)
// =============================================================================
// import { ApiController } from '@gertsai/api-core/moleculer';
ApiController.configure({
  // TODO: sessionFactory: (uid, type) => defaultSession(uid, type, 'api', version)
  // ...(queueConfig && { queue: queueConfig }),
  strictResponseValidation: process.env.NODE_ENV === 'development',
});
// Side-effect imports register controllers + lifecycle + workers (lifecycle first):
// import './mysvc';

// =============================================================================
// 7) BOOTSTRAP — src/index.ts
// =============================================================================
// import './services';                                   // register everything
// import { ApiController } from '@gertsai/api-core/moleculer';
// import brokerConfig from '../moleculer.config';
// import ApiService from './mol-services/api.service';
async function main(): Promise<void> {
  await ApiController.Start({
    brokerConfig: {} as never, // TODO: import from ../moleculer.config
    services: [/* ApiService, openApiService, ...plain moleculer services */],
    repl: process.argv.includes('--repl'),
    workersEnabled: true, // false => API-gateway/producer-only mode
    // ...(enabledServices && { enabledServices }),
  });
}
if (require.main === module) {
  main().catch((err: unknown) => { console.error(err); process.exit(1); });
}
export { main };
```

## Best practices

- Resolve one controller per service with `resolveController<V,N,S>` and give it
  a `ServiceContextBase`-extending generic `S` — every action/lifecycle/worker
  file that uses the same (version,name) gets the **same** memoised instance and
  fully typed `ctx.service.*`.
- Wrap every `controller.register(...)` in `defineAction(...)` so typia
  transformer-only types don't leak into emitted `.d.ts` and you avoid per-file
  `: any` + eslint suppressions.
- Keep action handlers pure transport: typia-validate input, call an application
  use case, and `respond(data, message?, code?)`. Map known domain errors to
  `throw new APIError(ResponseCode.X, data, message)` and re-throw unknown ones
  so the gateway's `onError` collapses them to a 500.
- Import order is load-bearing: in each service's `index.ts` do
  `import './lifecycle'` **first** (it registers the controller + started/stopped
  handlers), then re-export `./src` and `./types`. Controllers must exist before
  `ApiController.Start` iterates them.
- Call `ApiController.configure({ sessionFactory, queue, strictResponseValidation })`
  **exactly once** in `services/index.ts` BEFORE the side-effect imports — it
  seeds the static registry that `registerWorker` and the synthesized schema
  read.
- Use `controller.setRestBasePath('/')` in `lifecycle.ts` because the gateway
  route already prefixes `/api/v1`; add the service segment explicitly in each
  action's `rest` string (e.g. `POST /ingest/document`) to avoid
  `v1/ingest/v1/ingest/...` duplication.
- Let `ApiController.Start({ brokerConfig, services, workersEnabled, enabledServices, enabledWorkers })`
  own broker construction — never `new ServiceBroker(...)` directly. Use
  `workersEnabled:false` for API-gateway/producer-only nodes (jobs added via
  `service.addJob` but no BullMQ Worker spawned).
- Route REST exposure through gateway `routes[].autoAliases:true` + a `whitelist`
  of action globs (`v1.**`); the whitelist is the boundary deciding which broker
  actions are reachable over HTTP. Use `**` for nested action names, `*` only
  matches one segment.
- Mount cross-cutting concerns (CORS, rate limiting via `@gertsai/api-rlr`, auth)
  in `moleculer-web` `settings.use`; set `rateLimit: null` to disable the
  built-in limiter when RLR is the single throttling pass. The legacy OAuth
  `MX()` mixin was removed in Wave 16.A — auth is consumer-mounted middleware now.
- For long-lived raw responses (SSE), register a bare `(req,res)` function under
  `routes[].aliases` (NOT a Moleculer action), set `bodyParsers:false`, and
  bypass token-bucket RLR with `use:[]` while enforcing a per-handler rate
  limit/timeout.
- Keep the OpenAPI document in lock-step with the typia handler types
  (request/response shapes) and include the RFC 9457 `ProblemDetails` component;
  expose it via `createOpenApiService(schema)` and a `/openapi` gateway route
  whitelisting `v2.openapi.**`.
- Set CORS `origin` to an explicit env-driven allow-list (never `*`) once
  `credentials:true`/cookies are in play; fail-fast at boot in production rather
  than silently widening to wildcard.

## Pitfalls

- `disableAuth: true` on the gateway options is a **NO-OP** since Wave 16.A (the
  `MX()` OAuth mixin was deleted). It is kept only for type-shape back-compat —
  it does NOT add or remove auth. Mount real auth via `settings.use`.
- Forgetting that `lifecycle.ts` must be imported **before** action/worker files
  — if the controller isn't registered when `ApiController.Start` iterates
  `_controllers`, the service silently never gets a synthesized schema. The
  service `index.ts` enforces this with `import './lifecycle'` first.
- Calling `ApiController.configure(...)` after a service import, or more than
  once, means `registerWorker` and `sessionFactory` see stale/empty config. It
  must run exactly once, before any service module loads.
- Using a single `*` in the route `whitelist` only matches one action-name
  segment — nested actions like `v1.ingest.document` need `v1.**` (double
  asterisk) or they won't be routed.
- Not calling `setRestBasePath('/')` while the gateway route also prefixes
  `/api/v1` produces duplicated path segments
  (`/api/v1/ingest/v1/ingest/...`) because `autoAliases` re-prefixes the service
  name.
- Declaring `addJob`/`getQueue` on your `ServiceContext` interface — they are
  injected by api-core only when `ApiController.configure({ queue })` is set
  (i.e. `REDIS_URL` present). Gate producer code on `!!config.REDIS_URL` and fall
  back to inline use-case execution otherwise.
- Throwing raw domain errors expecting a specific HTTP status: only `APIError`
  (recognised structurally via `isAPIErrorLike`, surviving the Moleculer
  transport boundary), Moleculer errors, and duck-typed auth errors get mapped —
  everything else collapses to `ResponseCode.INTERNAL_ERROR` (500).
- Setting CORS `origin: '*'` together with `credentials: true` is rejected by
  browsers per the fetch spec and is a CSRF-amplifier (CWE-942) — the gateway
  template throws at boot in production if it detects this.
- Trusting raw `X-Forwarded-For`/`X-Tenant-ID` header values for rate-limit
  bucket keys enables Redis-injection / limit-bypass. Use `extractClientIp` and
  `validateTenantIdFormat` from `@gertsai/api-core` instead of hand-rolled
  parsing (the m9s example's inline IP/tenant parser is explicitly flagged as
  example-only).
- The OpenAPI schema is hand-curated in m9s-example and can drift from the typia
  handler types — every request/response shape change must be mirrored in
  `src/openapi/schema.ts` until the typia auto-emission pipeline lands. Keys
  scrubbed at the HTTP boundary (`userId`/`url`/`originalKind`) must NOT be
  documented.
- Importing `@gertsai/api-core` types/values from inconsistent subpaths: actions
  import `APIError`/`ResponseCode` from `@gertsai/api-core/contracts` but
  `defineAction`/`ApiController`/`createApiService`/`ServiceContextBase` from
  `@gertsai/api-core/moleculer` — mixing them up causes resolution/type errors.
- The `as never` cast on `APIError` `data`: api-core's `ResponseDataType`
  resolves to `never` for error `ResponseCode`s, so surfacing scrubbed
  `ProblemDetails.details` onto the wire requires a deliberate `data as never`
  cast — don't remove it expecting type safety there.

## Canonical files

- [`examples/m9s-example/src/mol-services/api.service.ts:124`](../../../../examples/m9s-example/src/mol-services/api.service.ts) —
  the API gateway service. `createDocumentsApiService()` calls
  `createApiService({ name, disableAuth, settings: { port, cors, rateLimit:null, use: rlrUseChain, routes:[...] } }, pkg)`.
  Defines `/api/v1` (autoAliases, whitelist `v1.**`), `/openapi`
  (whitelist `v2.openapi.**`), and `/api/stream` (raw SSE alias) routes,
  env-driven CORS allow-list, and the `@gertsai/api-rlr` middleware chain.
- [`examples/m9s-example/src/lib/example-controller.ts:31`](../../../../examples/m9s-example/src/lib/example-controller.ts) —
  thin generic facade `resolveExampleController<V,N,S>(version,name)` over
  `ApiController.resolveController<V,N,S>` so each domain supplies its own
  `ServiceContextBase` extension and action handlers see `ctx.service.<thing>`
  typed without casts.
- [`examples/m9s-example/src/services/ingest/src/actions/ingest-document.action.ts:64`](../../../../examples/m9s-example/src/services/ingest/src/actions/ingest-document.action.ts) —
  canonical action:
  `defineAction(controller.register('document', { auth:'none', rest:'POST /ingest/document', params: typia.createValidate<Req>(), response: typia.createValidate<Res>(), responseCode, responseMessage, async handler({params,ctx,service,logger,respond,addJob}){...} }))`.
  Shows session-guard assertions, queue-vs-inline branch, and domain-error →
  `APIError` mapping.
- [`examples/m9s-example/src/services/ingest/types.ts:35`](../../../../examples/m9s-example/src/services/ingest/types.ts) —
  `IngestServiceContext extends ServiceContextBase`, the per-service context
  interface wired by the lifecycle handler; plus transport request/response
  interfaces used by typia validators.
- [`examples/m9s-example/src/services/ingest/lifecycle.ts:41`](../../../../examples/m9s-example/src/services/ingest/lifecycle.ts) —
  lifecycle wiring: resolves the controller, `controller.setRestBasePath('/')`,
  `setWorkflows(...)`, `controller.addStartedHandler(ctx => { ctx.service.useCase = ... })`,
  `addStoppedHandler`. Demonstrates that `lifecycle.ts` MUST import first to
  register the controller.
- [`examples/m9s-example/src/services/index.ts:81`](../../../../examples/m9s-example/src/services/index.ts) —
  composition root order: `ApiController.configure({ sessionFactory, queue, strictResponseValidation })`
  runs ONCE before the side-effect `import './ingest'` etc. that register
  controllers + workers.
- [`examples/m9s-example/src/index.ts:165`](../../../../examples/m9s-example/src/index.ts) —
  broker bootstrap: side-effect `import './services'`, then
  `ApiController.Start({ brokerConfig, services: [ApiService, ...], repl, workersEnabled, enabledServices, enabledWorkers })`.
  No direct `new ServiceBroker(...)` — `Start` owns broker construction.
- [`examples/m9s-example/src/openapi/schema.ts:56`](../../../../examples/m9s-example/src/openapi/schema.ts) —
  hand-curated OpenAPI 3.1 document `buildOpenApiSchema()` (paths mirror typia
  handler types, plus RFC 9457 `ProblemDetails` component) fed to
  `createOpenApiService(schema)` in `index.ts`.
- [`examples/m9s-example/src/services/ingest/src/queues/ingest-chunk.worker.ts:1`](../../../../examples/m9s-example/src/services/ingest/src/queues/ingest-chunk.worker.ts) —
  queue worker registered via
  `controller.registerWorker(queueName, [{name,concurrency,handler}])`; handler
  gets `QueueHandlerCtx` with `{job,call,addJob,getQueue,logger,service}`.
  Producer side is `service.addJob(...)` inside the action.
- [`packages/api-core/src/moleculer/apiGateService.template.ts:113`](../../../../packages/api-core/src/moleculer/apiGateService.template.ts) —
  source of `createApiService` — shows `onAfterCall` wrapping results in
  `OrchestraApiResponse`, `onError`→`sendError` mapping
  `APIError`/Moleculer/auth errors to `ResponseCode`+HTTP, default rate-limit,
  helmet, and the `settings.use` merge of consumer middleware.
- [`packages/api-core/src/lib/controller/ApiController.class.ts:879`](../../../../packages/api-core/src/lib/controller/ApiController.class.ts) —
  `register(actionName, actionOptions)` signature — `params`/`response` are typia
  validators, the `rest` string is auto-prefixed with `/${version}/${name}` (and
  trailing-slash trimmed), returns the registered-action shape consumed by
  `defineAction`.
- [`packages/api-core/src/lib/define-action.ts:89`](../../../../packages/api-core/src/lib/define-action.ts) —
  `defineAction<T extends Record<string,unknown>>(registration): T & RegisteredAction`
  — a type-only brand wrapper around `controller.register(...)` to keep typia
  transformer types out of emitted `.d.ts` without `: any`.

## @gertsai packages used

- **`@gertsai/api-core/moleculer`** — `createApiService`, `createOpenApiService`,
  `ApiController`, `resolveController`, `defineAction`, `setWorkflows`,
  `ServiceContextBase`, `BullMQConnectionOptions`, `QueueHandlerCtx`.
- **`@gertsai/api-core/contracts`** — `APIError`, `ResponseCode`.
- **`@gertsai/api-rlr`** — `RLRMiddleware` (Express-style rate-limit middleware
  mounted in `settings.use`).
- **`@gertsai/session-guard`** — `assertAuthenticated`, `assertSessionInTenant`,
  `AuthenticationRequiredError`, `TenantScopeViolationError`.
- **`@gertsai/errors`** — `isAppError` (catch-all `AppError` detection at the HTTP
  boundary).
- **`@gertsai/core`** — `defaultSession`, `UserType` (for the `sessionFactory`
  passed to `ApiController.configure`).
