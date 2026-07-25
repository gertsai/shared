# Actions (defineAction) & request handling

## What & why

In `m9s-example`, every HTTP/RPC endpoint is a **Moleculer action** declared via
`controller.register(name, options)` wrapped in `defineAction(...)` from
`@gertsai/api-core/moleculer`. The controller is obtained once per service file
with `resolveExampleController<Version, Name, ServiceContext>(...)`; **importing
the action module is itself the registration side-effect** (the modules are
re-exported through a barrel `index.ts`, and that import triggers
`controller.register` at module-load).

Each action is a **thin transport layer**, nothing more:

- typia-validated `params` / `response` (compile-time-generated runtime validation),
- an `auth` mode (`'none' | 'optional' | 'required'`),
- a `rest:` route (omit it to keep the action broker-only / internal),
- a `responseCode` / `responseMessage`,
- a **destructuring** `handler({ params, ctx, service, logger, respond, addJob })`
  that delegates to a use case and maps domain errors to `APIError` instances.

**All business logic lives outside the action** — in the application / domain
layer — so that layer stays independent of `@gertsai/api-core`. The action's
only jobs are: validate the wire shape, (optionally) assert the session
fail-closed, delegate, and translate domain errors into deliberate HTTP status
codes.

## How it works in m9s-example

### Pattern: `defineAction` wrapping `controller.register`

- **What** — every action export is
  `export const x = defineAction(controller.register('name', { ...options }))`.
- **Why** — `controller.register` returns a Moleculer/typia shape that leaks
  transformer-only types into the emitted `.d.ts`. Annotating the export `: any`
  hid the leak but surrendered type-safety. `defineAction` adds an opaque
  `RegisteredAction` brand at the **outer** call, so the export is typed without
  `any` or an `eslint-disable`, while the handler body keeps full typia/Moleculer
  typing.
- **How** — import `{ defineAction }` from `@gertsai/api-core/moleculer`.
  `defineAction` is a pure type-level no-op cast at runtime; `controller.register`
  has **already run its side effect** (eager argument evaluation) before
  `defineAction` ever sees the value.

### Pattern: per-service typed controller via `resolveExampleController`

- **What** — each action file opens with
  `const controller = resolveExampleController<'v1', 'ingest', IngestServiceContext>('v1', 'ingest')`
  — a thin wrapper over `ApiController.resolveController<V, N, S>`.
- **Why** — it returns the **same singleton controller** for a given
  version+name across all action and lifecycle files, and threads the
  `ServiceContext` generic so `ctx.service.useCase`, `ctx.service.docStore`, etc.
  are strongly typed without per-call casts.
- **How** — define an interface `XServiceContext extends ServiceContextBase`
  listing what the lifecycle handler wires onto `ctx.service`. Call
  `resolveExampleController` with matching `<V, N, S>`. **Do NOT** declare
  `addJob` / `getQueue` there — api-core injects those when `ApiController.configure`
  provides a queue.

### Pattern: typia validators for `params` and `response`

- **What** — `params: typia.createValidate<RequestType>()` and
  `response: typia.createValidate<ResponseType>()`. Request/response interfaces
  live in the service `types.ts` (transport contracts), using `tags.Pattern`
  etc. for field constraints.
- **Why** — compile-time-generated runtime validation + OpenAPI generation from
  the TypeScript types: a single source of truth, no hand-written JSON schema.
  typia is a transformer (needs `tspc` / ts-patch, which `m9s-example` uses).
- **How** — declare the interface, pass `typia.createValidate<T>()`. For request
  shapes that bypass JSON parsing (multipart), keep the validator **permissive**
  (an empty envelope interface) and validate the real payload inline.

### Pattern: destructured handler with `respond()`

- **What** — `async handler({ params, ctx, service, logger, respond, addJob }) { ... return respond(data, message?, code?); }`.
  The handler argument is `ActionHandlerCtx` — destructure only what you use.
- **Why** — `respond()` builds the success envelope (`OrchestraApiResponse` /
  `GertsResponse`) with the right `ResponseCode` and message, so handlers never
  hand-assemble the wire shape. `service` is the typed `ServiceContext`; `logger`
  is the per-context logger; `addJob` / `getQueue` exist **only** when a queue is
  configured.
- **How** — delegate business logic to `service.useCase.execute(...)` (or call a
  repo/store on `service`), then `return respond(responseData)`. Pass an explicit
  `ResponseCode` (e.g. `SUCCESS_CREATED`) as the 3rd argument when overriding the
  default `responseCode`.

### Pattern: thin transport + domain-error → `APIError` mapping in `catch`

- **What** — the handler keeps zero business logic; a `try/catch` maps known
  domain error classes to `APIError(ResponseCode.X, data, message)` and
  re-throws everything else (`throw err`) for the framework default handler.
- **Why** — keeps the application/domain layer independent of
  `@gertsai/api-core`. Each domain error gets a deliberate HTTP status; unknown
  errors stay 500. `AppError` subclasses are routed through
  `appErrorToHttpResponse` so PII / topology hints (`userId` / `url` /
  `originalKind`) are scrubbed from `details` before crossing the wire.
- **How** —
  `if (err instanceof AuthenticationRequiredError) throw new APIError(ResponseCode.UNAUTHORIZED_REQUEST, ...)`,
  `TenantScopeViolationError → FORBIDDEN__INSUFFICIENT_RIGHTS`, a catch-all
  `if (isAppError(err))` → scrubbed `INTERNAL_ERROR`, then a final `throw err`.
  Prefer `instanceof` discriminators over message-string matching.

### Pattern: `auth` mode + session-guard assertions

- **What** — `auth: 'none' | 'optional' | 'required'` sets how the pipeline
  establishes a session (and types `ctx.session`). `m9s-example` ships
  `auth: 'none'` so `curl` works without an OAuth provider, then asserts
  authentication explicitly inside the handler.
- **Why** — production wiring switches to `auth: 'required'`; for the demo,
  authentication is enforced **fail-closed** inside the handler via session-guard,
  so unauthenticated / wrong-tenant requests get a synchronous 401/403 on the
  triggering request rather than a silently-accepted queued job.
- **How** — read
  `const { session, expectedTenantId } = tryGetRequestContextFromCtx(ctx)`, then
  `assertAuthenticated(session)` and (if `expectedTenantId` is set)
  `assertSessionInTenant(session, expectedTenantId)` **BEFORE** any side effect
  or enqueue.

### Pattern: queue-vs-inline via injected `addJob`

- **What** — when `ApiController` has a queue config, the handler receives
  `addJob` and enqueues a BullMQ job; otherwise it runs the use case inline as a
  fallback. Gated by a single source of truth (`config.REDIS_URL`).
- **Why** — lets the same action work with or without Redis. The produce side
  (`addJob`) and the consumer (`registerWorker`) are wired by api-core; the action
  stays transport-only.
- **How** —
  `const QUEUE_ENABLED = !!config.REDIS_URL; if (QUEUE_ENABLED) { const job = await addJob(QUEUE_NAME, JOB_NAME, payload); return respond({ ..., jobId: String(job?.id), mode: 'queued' }); } else { await service.useCase.execute(...); return respond({ ..., mode: 'inline' }); }`

### Pattern: internal broker-only action (no `rest:`)

- **What** — omit the `rest:` field to keep an action off HTTP — it is only
  reachable via `broker.call('v1.ingest._embed', ...)`. Convention: prefix the
  action name with `_`.
- **Why** — some actions are sub-steps invoked by other actions/workflows on the
  same broker; exposing them over REST would bypass tenant isolation enforced
  upstream.
- **How** — register with `auth: 'none'`, params/response validators, a handler,
  and **NO** `rest:` key. Cross-action invocation uses
  `ctx.broker.call<Res, Req>('v1.svc.action', payload, { meta: ctx.meta })`, which
  propagates `user_uuid` / tenant / trace headers.

### Pattern: action-to-action delegation via `broker.call`

- **What** — `upload-document` parses multipart, then calls
  `ctx.broker.call('v1.ingest.document', { docId, text }, { meta: ctx.meta })`
  rather than re-implementing the pipeline.
- **Why** — reuses already-tested queue gating + session-guard + use-case wiring.
  The downstream action runs the auth assertions, so you do **NOT** re-assert
  (avoids double-logging and a split 401/403 boundary). `{ meta: ctx.meta }`
  forwards the session so the downstream guard sees the same caller.
- **How** —
  `try { await ctx.broker.call(target, payload, { meta: ctx.meta }); } catch (err) { if (err instanceof APIError) throw err; /* wrap unknown as 500 */ throw err; }`
  — let downstream `APIError`s propagate untouched.

## Template

```ts
// SPDX-License-Identifier: Apache-2.0
/**
 * <Service> <Action> Action — `v1.<service>.<action>` -> `POST /<service>/<path>`.
 *
 * Thin transport wrapper: validate -> (assert session) -> delegate to use case
 * -> respond. All business logic lives in the application/domain layer; this
 * file only maps domain errors to transport (HTTP) errors.
 */
import { APIError, ResponseCode } from '@gertsai/api-core/contracts';
import { defineAction } from '@gertsai/api-core/moleculer';
import { isAppError } from '@gertsai/errors';
import {
  AuthenticationRequiredError,
  TenantScopeViolationError,
  assertAuthenticated,
  assertSessionInTenant,
} from '@gertsai/session-guard';
import typia from 'typia';

import { resolveExampleController } from '../../../../lib/example-controller';
import { tryGetRequestContextFromCtx } from '../../../../composition/wave5-middlewares';
import { appErrorToHttpResponse } from '../../../../shared/error-scrubber';
import type {
  // TODO: define these in the service's types.ts (transport contracts, typia-shaped)
  MyServiceContext,
  MyActionRequest,
  MyActionResponse,
} from '../../types';

// One controller per (version, service) — SAME singleton across action +
// lifecycle files. The ServiceContext generic types `ctx.service.<thing>`.
const controller = resolveExampleController<'v1', 'myservice', MyServiceContext>(
  'v1',
  'myservice',
);

export const myAction = defineAction(
  controller.register('myaction', {
    // 'none' so curl works without an OAuth provider in dev; switch to
    // 'required' once a real auth middleware is wired. Omit `rest:` entirely
    // to make the action broker-only (internal); prefix name with `_`.
    auth: 'none',

    // setRestBasePath('/') strips the service-name prefix, so add it here.
    // Object form (with `as any`) only when you need passReqResToParams.
    rest: 'POST /myservice/myaction',

    params: typia.createValidate<MyActionRequest>(),
    response: typia.createValidate<MyActionResponse>(),

    responseCode: ResponseCode.SUCCESS, // or SUCCESS_CREATED for POST-create
    responseMessage: 'Operation succeeded', // MUST be server-controlled (no user input)

    async handler({ params, ctx, service, logger, respond /* , addJob */ }) {
      try {
        // 1. Enforce auth fail-closed BEFORE any side effect.
        const { session, expectedTenantId } = tryGetRequestContextFromCtx(ctx);
        assertAuthenticated(session);
        if (expectedTenantId !== undefined) {
          assertSessionInTenant(session, expectedTenantId);
        }

        // 2. Delegate to the use case — NO business logic here.
        const result = await service.useCase.execute({
          ...params,
          session,
          ...(expectedTenantId !== undefined && { expectedTenantId }),
        });

        // TODO: optional queue branch:
        //   const QUEUE_ENABLED = !!config.REDIS_URL;
        //   if (QUEUE_ENABLED) {
        //     const job = await addJob(QUEUE_NAME, JOB_NAME, payload);
        //     return respond({ ...job.id..., mode: 'queued' }, responseMessage, ResponseCode.SUCCESS_CREATED);
        //   }

        logger.info('[v1.myservice.myaction] done', { /* ids only, no PII */ });
        return respond(result as MyActionResponse);
      } catch (err) {
        // 3. Map domain errors to transport. AppError details are scrubbed
        // (userId/url/originalKind) before crossing the wire; `as never`
        // bridges api-core's error-code ResponseDataType (resolves to never).
        if (err instanceof AuthenticationRequiredError) {
          const { body } = appErrorToHttpResponse(err);
          throw new APIError(ResponseCode.UNAUTHORIZED_REQUEST, body.details as never, 'Authentication required');
        }
        if (err instanceof TenantScopeViolationError) {
          const { body } = appErrorToHttpResponse(err);
          throw new APIError(ResponseCode.FORBIDDEN__INSUFFICIENT_RIGHTS, body.details as never, 'Tenant scope violation');
        }
        if (isAppError(err)) {
          const { body } = appErrorToHttpResponse(err);
          throw new APIError(ResponseCode.INTERNAL_ERROR, body.details as never, body.title);
        }
        // Everything else bubbles up to the framework default handler.
        throw err;
      }
    },
  }),
);
```

## Best practices

- Always wrap the export in `defineAction(...)` — never annotate the action
  export as `: any`. The brand removes the typia `.d.ts` leak without
  surrendering type-safety or needing a per-file `eslint-disable`.
- Keep the action transport-only: validate → (assert session) → delegate to
  `service.useCase.execute(...)` → `respond(...)`. Put all business logic in the
  application/domain layer so it stays independent of `@gertsai/api-core`.
- Resolve the controller once at module top with
  `resolveExampleController<V, N, ServiceContext>(...)`; reuse the same `<V, N>`
  across the action and lifecycle files so they share one controller singleton.
- Define request/response interfaces in the service `types.ts` (transport
  contracts) and validate with `typia.createValidate<T>()` for both `params` and
  `response` — single source of truth for runtime validation + OpenAPI.
- Return through `respond(data, message?, code?)`; pass an explicit `ResponseCode`
  (e.g. `SUCCESS_CREATED`) when it differs from the registered `responseCode`.
  Never hand-build the response envelope.
- Enforce auth fail-closed: call `tryGetRequestContextFromCtx(ctx)`, then
  `assertAuthenticated` / `assertSessionInTenant` **BEFORE** any side effect
  (enqueue, write, SSE) so rejected requests get a synchronous 401/403 instead of
  silent acceptance.
- Map domain errors with `instanceof` discriminators (not message-string
  matching) to deliberate `ResponseCode`s; route `AppError` subclasses through
  `appErrorToHttpResponse` to scrub PII/topology from `details`; end the catch
  with `throw err` so unknowns become 500.
- Register the action surface by re-exporting each `*.action.ts` from an
  `index.ts` barrel — importing it is the registration side-effect
  (`controller.register` runs at module-load).
- Declare only your own wiring (`useCase`, stores, embedder) on the
  `ServiceContext` interface; do **NOT** declare `addJob` / `getQueue` — api-core
  injects those when a queue is configured.
- Log ids/tenant only — never email, body content, or `err.stack` (CWE-532).
  `responseMessage` must be a server-controlled literal, never user input (XSS via
  the message field is not sanitized by design).

## Pitfalls

- Forgetting `defineAction` and falling back to
  `export const x: any = controller.register(...)` reintroduces the typia `.d.ts`
  type leak and forces an `eslint-disable`. `defineAction(undefined/null/primitive)`
  is a compile error by design (generic constraint `extends Record<string, unknown>`).
- Registering the same action name twice on a controller throws at module-load
  (`Action 'x' is already registered`). Each action name must be unique per
  (version, service).
- Setting `rest:` on an action you intend to be internal exposes it over HTTP and
  can bypass upstream tenant isolation — omit `rest:` (and prefix the name with
  `_`) for broker-only actions.
- The multipart `passReqResToParams` flag is not in the public `RestSchema` type,
  so the object-form `rest` must be cast `as any`; without it `params.$req` is
  `undefined` and multipart parsing fails.
- Asserting the session twice across delegating actions (e.g. upload →
  `broker.call` → ingest) double-logs and splits the 401/403 boundary; assert
  once at the pipeline boundary and forward `{ meta: ctx.meta }` so the downstream
  guard sees the same session.
- Enqueuing before asserting auth lets an unauthenticated/wrong-tenant request
  return `mode: 'queued'` success while the job fails invisibly downstream —
  always assert before the queue-vs-inline branch.
- Surfacing raw `AppError` `details` to the wire leaks `userId` / `url` /
  `originalKind`; route through `appErrorToHttpResponse` and put scrubbed details
  on `APIError.data` via the `as never` cast (api-core's error-code
  `ResponseDataType` resolves to `never`).
- typia is a compile-time transformer — `m9s-example` builds with `tspc` /
  ts-patch; a plain `tsc` build will not transform `typia.createValidate<T>()` and
  validation will be a no-op/throw.
- `addJob` / `getQueue` are only present on the handler `ctx` when
  `ApiController.configure` was given a queue connection; gate their use on a
  config flag (e.g. `!!config.REDIS_URL`) or they are `undefined`.
- `ctx.session` is typed `undefined` when `auth: 'none'`,
  `OrchestraSession | undefined` when `'optional'`, and `OrchestraSession` only
  when `'required'` — don't assume a session exists; resolve it via
  `tryGetRequestContextFromCtx` and assert.

## Canonical files

Real references in `examples/m9s-example` (path:line where given):

- [`ingest-document.action.ts:64`](../../../../examples/m9s-example/src/services/ingest/src/actions/ingest-document.action.ts) —
  canonical full action: auth gating, typia params/response, queue-vs-inline
  branch via injected `addJob`, session-guard assertions, SSE side-effects, and the
  full domain-error → `APIError` mapping (including scrubbed `AppError` details).
- [`login.action.ts:84`](../../../../examples/m9s-example/src/services/auth/src/actions/login.action.ts) —
  auth action: throws `APIError` directly (no use case), bcrypt verify,
  anti-enumeration, calls `service.rotationStore`, returns via `respond()`.
- [`search-query.action.ts:30`](../../../../examples/m9s-example/src/services/search/src/actions/search-query.action.ts) —
  minimal synchronous action: validate → resolve user →
  `service.useCase.execute` → respond; compact catch block mapping 3 domain
  error types.
- [`embed-batch.action.ts:50`](../../../../examples/m9s-example/src/services/ingest/src/actions/embed-batch.action.ts) —
  internal broker-only action: no `rest:` field => not exposed over HTTP;
  `_`-prefixed name convention; `auth: 'none'`.
- [`upload-document.action.ts:88`](../../../../examples/m9s-example/src/services/ingest/src/actions/upload-document.action.ts) —
  multipart action: `rest` object cast `as any` to add `passReqResToParams`,
  reads `params.$req`, parses busboy, then `ctx.broker.call` delegates to another
  action.
- [`delete-document.action.ts:56`](../../../../examples/m9s-example/src/services/ingest/src/actions/delete-document.action.ts) —
  soft-delete action: object-form auth assertions, `appErrorToHttpResponse`
  scrubber, `NOT_IMPLEMENTED` mapping for an unsupported adapter.
- [`define-action.ts:89`](../../../../packages/api-core/src/lib/define-action.ts) —
  `defineAction<T extends Record<string, unknown>>(registration): T & RegisteredAction`
  — opaque brand wrapper that removes the `: any` annotation on action exports;
  runtime no-op cast.
- [`controller/types.ts:524`](../../../../packages/api-core/src/lib/controller/types.ts) —
  `ActionOptions` type — the full `register()` options surface: `auth`, `rest`,
  `params`, `response`, `responseCode`, `responseMessage`, `scopes`,
  `openFgaCheck`, `abac`, `handler`.
- [`controller/types.ts:295`](../../../../packages/api-core/src/lib/controller/types.ts) —
  `ActionHandlerCtx` — the destructured handler argument shape: `session` (typed
  by `AuthType`), `files`, `params`, `logger`, `service`, `addJob`, `getQueue`,
  `respond`.
- [`ApiController.class.ts:879`](../../../../packages/api-core/src/lib/controller/ApiController.class.ts) —
  `register<...>()` implementation — infers action path
  `${version}.${name}.${action}`, builds the rest alias from `setRestBasePath`,
  throws on duplicate registration.
- [`example-controller.ts:30`](../../../../examples/m9s-example/src/lib/example-controller.ts) —
  `resolveExampleController<V, N, S>()` thin facade over
  `ApiController.resolveController` returning the per-service typed controller.
- [`ingest/src/actions/index.ts:1`](../../../../examples/m9s-example/src/services/ingest/src/actions/index.ts) —
  action barrel: re-exporting each `*.action.ts` triggers `controller.register`
  at module-load — order matters only for side-effect registration.
- [`ingest/types.ts:36`](../../../../examples/m9s-example/src/services/ingest/types.ts) —
  `IngestServiceContext extends ServiceContextBase` — defines `ctx.service.<thing>`
  typing (`useCase`, `docStore`, `embedder`); note `addJob` / `getQueue` are NOT
  declared here (injected by api-core).

## @gertsai packages used

- **`@gertsai/api-core/moleculer`** — `defineAction`, `resolveExampleController`
  (via `ApiController.resolveController`), `controller.register`,
  `ServiceContextBase`, `ActionHandlerCtx` / `respond` / `addJob`.
- **`@gertsai/api-core/contracts`** — `APIError`, `ResponseCode`.
- **`@gertsai/session-guard`** — `AuthenticationRequiredError`,
  `TenantScopeViolationError`, `assertAuthenticated`, `assertSessionInTenant`.
- **`@gertsai/errors`** — `isAppError`, `AppError` taxonomy used by the
  `appErrorToHttpResponse` scrubber.
- **`typia`** — `createValidate` for `params` / `response`, `tags.Pattern` for
  field constraints (compile-time transformer).
