---
name: building-gertsai-apps
description: >-
  Teaches building production apps on the @gertsai/* + Moleculer.js stack, modeled on
  examples/m9s-example: project setup & entrypoint, configuration & run modes, hexagonal
  domain/ports/use-cases, service modules & composition, API gateway & controllers, actions
  (defineAction), queues & workers, channels/SSE realtime, durable workflows, auth/authz
  (JWT + OpenFGA), errors/tenant/runtime-context/session-guard/audit/rate-limit, storage
  adapters, and testing/deploy. Use to scaffold or extend a @gertsai/Moleculer service.
  Triggers (EN): "build a gertsai app", "new moleculer service", "scaffold api gateway",
  "create an action", "add a queue", "new controller", "add SSE/channels", "durable workflow",
  "wire OpenFGA auth", "swap storage backend". Triggers (RU): "сделай сервис",
  "новый контроллер", "добавь очередь", "создай action", "добавь воркер".
---

# Building @gertsai apps (Moleculer + hexagonal)

Build production apps that consume the published `@gertsai/*` packages, wired exactly the way
`examples/m9s-example` does. This skill is the architecture playbook: follow the ordered
checklist, lift the matching template, and open the reference doc for full depth.

## When to use

- Scaffolding a new `@gertsai/*` Moleculer application (gateway + services + workers).
- Adding a concern to an existing one: a new service module, action, queue worker, SSE/channel,
  durable workflow, auth, a storage backend swap, or the Wave 5 cross-cutting stack.
- Wiring tenant resolution, request-context, session-guard, error scrubbing, or rate limiting.

## When NOT to use

- Authoring a `@gertsai/*` library package itself (that is library work in `packages/*`, not an
  app built on top of them) — follow the repo `CLAUDE.md` package conventions instead.
- Pure frontend work (the `m9s-example-web` SvelteKit client) — only the JWT claim contract is
  shared; UI is out of scope here.
- Installing/consuming the packages in a *non-Moleculer* project — see
  `guides/CONSUMING-PACKAGES.ru.md`.

## Architecture mental model (short)

Two orthogonal axes, both load-bearing:

1. **Hexagonal dependency rule.** Code flows one way:
   `domain/` → `application/` → `infrastructure/` → `services/`. `domain/` (entities + ports)
   imports only the Shared Kernel `@gertsai/errors`; `application/` (use-cases) imports only
   `domain/` ports; `infrastructure/` implements those ports and may import `@gertsai/*`;
   `services/` wires everything at the transport edge. One **composition root**
   (`src/composition/infrastructure.ts`) is the only file that knows concrete adapters, selected
   by env, exported as a module-load **singleton** shared across services.
2. **Moleculer lifecycle owned by `@gertsai/api-core/moleculer`.** Never `new ServiceBroker()`.
   Controllers self-register as **import side-effects**; `ApiController.configure(...)` runs
   **once** before service imports; `ApiController.Start({ brokerConfig, services, ... })` builds
   the broker, synthesizes one Moleculer schema per controller, and starts. Cross-cutting concerns
   live at the **broker-middleware seam** (`tenantMiddleware` → `sessionMiddleware`) and small
   composition facades — never scattered in business code.

Actions are pure transport: typia-validate → assert session-guard → delegate to a use-case →
map `@gertsai/errors` to `APIError` at the boundary. The same use-case is reachable inline (action),
queued (BullMQ worker), and durable (workflow).

## Ordered build checklist

Build in this order; each step links its reference doc (full depth) and primary template.

1. **Architecture & mental model** → `references/overview.md` · template `templates/m9s-app-architecture.skeleton.ts`
2. **Project bootstrap & entrypoint** (`index.ts`, `ApiController.Start`, OTel, shutdown) → `references/bootstrap.md` · `templates/app-bootstrap.ts`
3. **Configuration & run modes** (`project.config.ts`, `loadConfig`, env gates) → `references/configuration.md` · `templates/project.config.ts`
4. **Domain, ports & use-cases** (hexagonal core) → `references/domain-core.md` · `templates/DoSomethingUseCase.ts`
5. **Service modules & composition** (`resolveController`, lifecycle, singleton, Wave 5 stack) → `references/services.md` · `templates/service-module.lifecycle.ts`
6. **API gateway & controllers** (`createApiService`, autoAliases, whitelist) → `references/api-controllers.md` · `templates/api-gateway-and-controllers.template.ts`
7. **Actions & request handling** (`defineAction`, typia, error mapping) → `references/actions.md` · `templates/myaction.action.ts`
8. **Queues & workers** (BullMQ via api-core, `registerWorker`, queued-vs-inline) → `references/queues-workers.md` · `templates/queue-worker.worker.ts`
9. **Channels & SSE realtime** (in-process SSE + durable `@moleculer/channels`) → `references/channels-sse.md` · `templates/realtime-sse-and-channels.template.ts`
10. **Durable workflows** (`WorkflowDefinition`, `setWorkflows`, replay) → `references/workflows.md` · `templates/durable-workflow.workflow.ts`
11. **Auth & authorization** (JWT rotation + `IPermissionGate`/OpenFGA, fail-closed) → `references/auth-authz.md` · `templates/auth-jwt-and-permission-gate.skeleton.ts`
12. **Cross-cutting** (errors, tenant, runtime-context, session-guard, audit, rate-limit) → `references/cross-cutting.md` · `templates/wave5-cross-cutting.reference.ts`
13. **Storage adapters & ports** (swap memory↔Postgres, `PgClient`, two strategies) → `references/storage-adapters.md` · `templates/storage-port-and-adapters.ts`
14. **Testing, Docker & deployment** (two-tier tests, `dist/`+`createRequire`, compose, migrations) → `references/testing-deploy.md` · `templates/app-e2e.test.ts`

## Templates index

All under `templates/` — copy-paste skeletons with `TODO` markers, genericized from m9s-example:

- `m9s-app-architecture.skeleton.ts` — whole-app wiring overview (entry → services → composition → action).
- `app-bootstrap.ts` — `project.config.ts` + `moleculer.config.ts` + `services/index.ts` + `index.ts` boot chain.
- `project.config.ts` — single typed config parsed once, `loadConfig` overlay, run-mode enum casts.
- `DoSomethingUseCase.ts` — pure domain entity + outbound port + constructor-injected use-case.
- `service-module.lifecycle.ts` — full service layout: typed controller facade, composition root, Wave 5 middlewares, lifecycle handlers.
- `api-gateway-and-controllers.template.ts` — `createApiService` gateway + controller + action + configure/boot.
- `myaction.action.ts` — `defineAction(controller.register(...))` pure-transport handler with error mapping.
- `queue-worker.worker.ts` — `controller.registerWorker` side-effect + producer `addJob` + connection config.
- `realtime-sse-and-channels.template.ts` — in-process SSE pub/sub + handler + durable channel consumer.
- `durable-workflow.workflow.ts` — `WorkflowDefinition` factory + `setWorkflows` + sync/async trigger action.
- `auth-jwt-and-permission-gate.skeleton.ts` — JWT sign/verify + login action + OpenFGA gate adapter.
- `wave5-cross-cutting.reference.ts` — error kernel + scrubber + tenant/session middleware + rate-limit chain.
- `storage-port-and-adapters.ts` — port + two adapter strategies (IStorageProvider vs raw PgClient) + composition root.
- `app-e2e.test.ts` — e2e/real-infra test skeleton (`dist/` + `createRequire`, `meta.testSession`, infra probe).

## Hard rules (the ones that bite)

- Never `new ServiceBroker()` — `ApiController.Start` owns the broker.
- `ApiController.configure(...)` runs **once, before** any service import; each service barrel does
  `import './lifecycle'` **first**.
- Build adapters in **one** composition root; export a module-load singleton (per-service `new`
  desyncs in-memory stores → search returns 0).
- `setWorkflows(...)` and `controller.registerWorker(...)` are **module-load** calls — the schema is
  synthesized before any `started()` handler runs.
- `tenantMiddleware` **before** `sessionMiddleware` (frozen RequestContext / TOCTOU).
- Actions are pure transport; map `@gertsai/errors` → `APIError` only in the catch block; scrub PII
  via `appErrorToHttpResponse`.
- Build with `tspc` (typia transformer); e2e tests import runtime from `dist/` via `createRequire`.

## Pointers

- Full standalone prose guide: `guides/BUILDING-APPS.md`.
- Reference application (read the real code): `examples/m9s-example/`.
- Installing `@gertsai/*` in a consuming project: `guides/CONSUMING-PACKAGES.ru.md`.
