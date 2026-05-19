---
depth: tactical
id: EVID-067
kind: evidence
links:
- target: PRD-049
  relation: informs
status: active
title: Wave 15 — @gertsai/api-core architectural audit + decomposition strategy
---

## Summary

`@gertsai/api-core` totals **9,772 LOC across 55 source files** (excluding tests). The package is dominated by two god-modules: `lib/controller/ApiController.class.ts` (1,511 LOC) and its sibling `lib/controller/types.ts` (1,037 LOC). Together they account for **26 percent of the package** and entangle eight separate responsibilities into one class: service-schema synthesis, lifecycle handlers, BullMQ queue+worker lifecycle, Pub/Sub topic subscription, action validator/coercion/auth/error pipeline, distributed-trace propagation, fallback-logger composition, and workflow-symbol hook. Cross-cutting concerns (logging, error scrubbing, env config, diagnostics, response envelope) live inline in this single class rather than in injected collaborators.

The second tier of bulk is the **envelope subsystem** (1,901 LOC across `lib/envelope/*` + `lib/apiResponse/types.ts`), which mixes three logically separate concerns: the legacy Orchestra `ResponseCode` enum (130-plus values), the RFC-030 GertsResponse envelope (success/error/list), and a typia-heavy validator-and-coercion layer. Around 80 percent of api-core consumers (29 of 35 import lines) pull from `/moleculer` or `/contracts` subpaths — proving the existing contract boundary already works; the next-tier split is **inside** `/moleculer` (separate the controller from BullMQ/Pub-Sub) and **inside** `/contracts` (separate envelope types from error helpers).

The five strongest decomposition candidates are: (1) Extract BullMQ queue/worker plumbing from `ApiController` into `@gertsai/api-queue` (Tier 2 new), reuses `@gertsai/queue` Sprint 3.2; (2) Extract Pub/Sub subscription plumbing into `@gertsai/api-pubsub` (Tier 2 new, optional peer); (3) Extract the RFC-030 GertsResponse envelope into `@gertsai/api-envelope` (Tier 1 new, browser-safe); (4) Migrate the OAuth2 mixin and `oauth.class.ts` to a deprecation shim that delegates to a future `@gertsai/auth-oauth2` (Tier 4 successor); (5) Replace inline `console.error` fallback-logger + diagnostics ASCII-box with `@gertsai/logger-factory` consumption. The recommended Wave 15 sequence is **15.A** (envelope extract — type-only, lowest risk), **15.B** (BullMQ extract — additive, breaks zero callers), **15.C** (Pub/Sub extract — same shape as B), with OAuth and remaining god-class internals deferred to Wave 16.

## Structured Fields

- verdict: supports
- congruence_level: CL3
- evidence_type: architectural_audit
- linked_artifact: PRD-049
- summary: api-core is 9.8k LOC with two god-modules (controller 1.5k + types 1k) and a 1.9k LOC envelope subsystem; 3 surgical Wave 15 extractions (envelope, BullMQ, Pub/Sub) recover ~3k LOC into Tier-1/Tier-2 packages with zero breaking changes.

## Inventory

| File | LOC | Public? | Top imports | Top consumers |
|---|---|---|---|---|
| `lib/controller/ApiController.class.ts` | 1511 | Yes via `/moleculer` | `@gertsai/core`, `bullmq`, `moleculer`, `@google-cloud/pubsub`, `colorts`, `lodash.forin`, internal `../config`, `../apiResponse`, `../error`, `../common`, `../../moleculer/workflow/setWorkflows` | m9s-example `lib/example-controller.ts` + 9 action files |
| `lib/controller/types.ts` | 1037 | Yes via `/moleculer` | `@google-cloud/pubsub`, `bullmq`, `moleculer`, `@gertsai/core`, `@gertsai/auth-openfga` | `ApiController.class.ts`, `apiGateService.template.ts` |
| `lib/envelope/types/error.ts` | 620 | Yes via `/contracts` | `typia` | `envelope/index.ts`, `response-wrapper.ts` |
| `lib/envelope/type-guards.ts` | 450 | Yes via `/contracts` | `./types`, `../apiResponse/OrchestraApiResponse.class`, `../apiResponse/types` | `response-wrapper.ts`, `apiGateService.template.ts` |
| `moleculer/apiGateService.template.ts` | 439 | Yes via `/moleculer` | `helmet`, `express-fingerprint`, `lodash.merge`, `moleculer-web`, `../lib`, `../lib/common/ip-utils`, `../lib/oauth`, `./oauth.mixin` | examples + apps using `createApiService` |
| `lib/apiResponse/types.ts` | 424 | Yes via `/contracts` | `typia`, `../common` | every error/envelope module |
| `lib/envelope/response-wrapper.ts` | 422 | Yes via `/contracts` | `./types`, `../apiResponse/*`, `./type-guards` | `apiGateService.template.ts` |
| `lib/envelope/types/list.ts` | 409 | Yes via `/contracts` | `typia`, `./response` | `envelope/index.ts` |
| `lib/oauth/oauth.class.ts` | 373 | Yes via `/moleculer` | `moleculer`, `oauth2-server`, `moleculer-web`, `./auth-provider`, `../../config`, `../apiResponse`, `../error` | `apiGateService.template.ts`, `oauth.mixin.ts` |
| `lib/envelope/types/response.ts` | 361 | Yes via `/contracts` | `typia` | `envelope/index.ts`, `list.ts`, `error.ts` |
| `lib/error/OIDCError.class.ts` | 316 | Yes via `/contracts` | `@gertsai/core`, `./APIError.class`, `../apiResponse` | external OIDC apps |
| `lib/error/helpers.ts` | 313 | Yes via `/contracts` | `./APIError.class`, `../apiResponse` | broad consumer surface |
| `lib/common/typia-params.ts` | 313 | Yes via `/contracts` | `./types` | `ApiController.class.ts`, action sites |
| `lib/error/APIError.class.ts` | 265 | Yes via `/contracts` | `@gertsai/core`, `../apiResponse` | core errors |
| `lib/common/coercion.ts` | 214 | Yes via `/contracts` | (none internal) | `ApiController.class.ts` |
| `moleculer/moleculerConfig.template.ts` | 182 | Yes via `/moleculer` + `/runtime/node` | `@google-cloud/logging-bunyan`, `@r2d2bzh/moleculer-healthcheck-middleware`, `lodash.merge`, `../config`, `./logLevel` | broker bootstrap |
| `lib/common/ip-utils.ts` | 168 | Yes via `/contracts` | (none) | `apiGateService.template.ts` |
| `lib/diagnostics/builtins.ts` | 150 | Yes via `/contracts` | `./types` | `diagnostics/index.ts` |
| `lib/envelope/index.ts` | 120 | Yes (barrel) | `./types/*`, `./response-wrapper`, `./type-guards` | `lib/index.ts` |
| `lib/oauth/auth-provider.ts` | 107 | Yes via `/moleculer` | (none) | `oauth.class.ts` |
| `lib/diagnostics/registry.ts` | 100 | Yes via `/contracts` | `./types`, `./renderer` | `ApiController.class.ts` started-handler |
| `lib/define-action.ts` | 97 | Yes via `/moleculer` | (none) | every action file in m9s-example |
| `moleculer/openapiService.template.ts` | 95 | Yes via `/moleculer` | `@samchon/openapi`, `moleculer`, `openapi-merge` | (low — feature-flagged) |
| `lib/diagnostics/renderer.ts` | 94 | Yes via `/contracts` | `./types` | `registry.ts` |
| `lib/error/codes/*.ts` (5 files) | 430 sum | Yes via `/contracts` | `./apiResponse` | `error/codes/index.ts` |
| `moleculer/workflow/adapter.ts` | 88 | Yes via `/moleculer/workflow` | `@gertsai/core`, `moleculer` | `setWorkflows.ts`, controller |
| `lib/apiResponse/OrchestraApiResponse.class.ts` | 79 | Yes via `/contracts` | `./types` | envelope, gateway |
| `moleculer/workflow/setWorkflows.ts` | 75 | Yes via `/moleculer/workflow` | `@gertsai/core`, `./adapter` | broker-startup site |
| `config.ts` | 60 | Internal (consumed via root + runtime/node) | `./project-config`, `moleculer` | broker, gateway, oauth |
| `moleculer/logLevel.ts` | 55 | Yes via `/moleculer` | `moleculer`, `../config` | `moleculerConfig.template.ts` |
| `moleculer/types.ts` | 50 | Yes via `/moleculer` | `moleculer`, `moleculer-web`, `../lib` | gateway template |
| `lib/diagnostics/types.ts` | 41 | Yes via `/contracts` | (none) | registry/builtins |
| `lib/envelope/types/index.ts` | 40 | Yes (barrel) | `./response`, `./list`, `./error` | `envelope/index.ts` |
| `contracts/action-definition.ts` | 28 | Yes via `/contracts` (type-only) | `./controller/types` | `rpc-proxy-builder` |
| `contracts/index.ts` | 23 | Public entry | barrel of `lib/{error,apiResponse,envelope,common,diagnostics}` | downstream |
| `moleculer/index.ts` | 22 | Public entry | barrel `lib/{controller,oauth,define-action}` + 6 moleculer files | downstream |
| `lib/common/types.ts` | 21 | Yes via `/contracts` | `@gertsai/core`, `typia` | common/index |
| `lib/index.ts` | (barrel) | Internal | re-exports lib/* | `apiGateService.template.ts` |
| `index.ts` (root) | 16 | Public (deprecated) | `./contracts`, `./moleculer` | legacy v0.1.x |
| `runtime/node/index.ts` | 16 | Public entry | `../../project-config`, `../../moleculer/moleculerConfig.template` | runtime opt-in |
| `moleculer/workflow/index.ts` | 14 | Yes via `/moleculer/workflow` | `./setWorkflows`, `./adapter` | controller |
| `lib/oauth/index.ts` | 14 | Yes via `/moleculer` | `oauth2-server`, `./oauth.class`, `./auth-provider` | gateway |
| `moleculer/workflow/types.ts` | 11 | Yes via `/moleculer/workflow` | (none) | adapter |
| `lib/error/codes/index.ts` | 38 | Yes via `/contracts` | `./{auth,database,files,oidc,validation}` | error/index |
| `lib/diagnostics/index.ts` | 24 | Yes via `/contracts` | `./types`, `./registry`, `./renderer`, `./builtins` | controller |
| `project-config/index.ts` | 23 | Internal (consumed via root + runtime/node) | (none) | `config.ts`, `runtime/node/index.ts` |
| `moleculer/oauth.mixin.ts` | 7 (re-export) | Yes via `/moleculer` | `../lib/oauth` | gateway |

Total: 55 source files, 9772 LOC.

## Dependency Graph (intra-package)

Top-down clusters (consumer to producer):

```
runtime/node/index.ts
  --> project-config/index.ts
  --> moleculer/moleculerConfig.template.ts
        --> config.ts --> project-config/index.ts
        --> moleculer/logLevel.ts --> config.ts

moleculer/index.ts (barrel)
  --> lib/controller (ApiController.class + types)
        --> config.ts
        --> moleculer/workflow/setWorkflows.ts --> moleculer/workflow/adapter.ts
        --> lib/apiResponse (ResponseCode + OrchestraApiResponse)
        --> lib/common (typia-params + coercion + ip-utils + types)
        --> lib/error (APIError + helpers + OIDCError + codes/*)
        --> lib/diagnostics (lazy dynamic-import — registered on startup-error path)
  --> lib/oauth (oauth.class --> auth-provider, ../config, ../apiResponse, ../error)
  --> lib/define-action
  --> moleculer/apiGateService.template.ts
        --> moleculer/oauth.mixin --> lib/oauth
        --> moleculer/types --> lib/common
        --> lib/envelope (wrapSuccessResponse + wrapErrorResponse + extractPackageInfo + toBaseResponse)
        --> lib/common/ip-utils
        --> lib/oauth (OAuthError import)
  --> moleculer/openapiService.template.ts (no internal deps — uses @samchon/openapi + openapi-merge)
  --> moleculer/moleculerConfig.template.ts
  --> moleculer/workflow (adapter + setWorkflows)

contracts/index.ts (barrel)
  --> lib/error  --> lib/apiResponse  (cycle resolved by direction: error consumes apiResponse only)
  --> lib/apiResponse --> lib/common (typia)
  --> lib/envelope  --> lib/apiResponse + lib/envelope/types/* (typia-tagged interfaces)
  --> lib/common
  --> lib/diagnostics (pure)
  --> contracts/action-definition --> lib/controller/types (type-only)

Cluster A (controller): controller, common, apiResponse, error, diagnostics  — 4.5k LOC
Cluster B (envelope): envelope/{types,response-wrapper,type-guards}          — 1.9k LOC
Cluster C (moleculer side-effects): apiGateService, moleculerConfig, oauth   — 1.1k LOC
Cluster D (workflow): workflow/{adapter, setWorkflows, types}                — 0.2k LOC
Cluster E (config glue): config + project-config + runtime/node              — 0.1k LOC
```

No circular dependencies detected at the file level. `contracts/action-definition.ts` is a deliberate type-only contract for `@gertsai/rpc-proxy-builder` (per ADR-009 Amendment 1.1) — keeps that consumer free of moleculer/bullmq peer-deps.

## God-class candidates (modules >500 LOC)

### Module 1: `lib/controller/ApiController.class.ts`

**File**: `packages/api-core/src/lib/controller/ApiController.class.ts` (1511 LOC, 1 class, 16 public/protected methods + 7 private + 2 internal-symbol-keyed)

**Single responsibility?**: **No**. Eight distinct responsibilities co-located in one class:

1. **Service registry** — static `_controllers` map, `resolveController`, `Start`, `configure`, `getSession`, `getSystemSession`.
2. **Service-schema synthesis** — `generateServiceSchema` (~440 LOC including started+stopped).
3. **Action pipeline** — `_createActionSchema` (~200 LOC: param coercion, typia validation, auth gate, tenantId injection, trace-context build, response validation, error scrub, `session.$destroy`).
4. **BullMQ worker lifecycle** — `started()` worker creation, lock-config defaults, handler-map routing, trace-context propagation, tenant-config preload, S2S meta build, `stopped()` worker close.
5. **Pub/Sub topic-subscription lifecycle** — `_createSubscriberSchema`, `started()` topic/subscription create-if-missing, `stopped()` subscription cleanup.
6. **Channel registration** — `setChannels` + schema emission for moleculer-channels middleware.
7. **Workflow registration** — `[REGISTER_WORKFLOW]` Symbol hook + `_attachWorkflowsToServices`.
8. **Fallback logger** — `createSimpleFallbackLogger`, three-tier `_getLogger()` resolution (service > broker > console-shim).

**Cohesion**: Low. Each responsibility carries its own state (`_registeredActions`, `_registeredQueues`, `_subscribedTopics`, `_channels`, `_pendingWorkflows`, `_startedHandlers`, `_stoppedHandlers`, `_logger`, static `_broker`, `_workersEnabled`, `_enabledWorkers`, `_config`) and its own lifecycle hook. The only invariant shared across them is "all live inside the synthesized Moleculer schema", which is structural coupling, not behavioural.

**Public surface**:
- Statics: `Start`, `configure`, `getSession`, `getSystemSession`, `resolveController`, `controllers`.
- Instance: `register`, `registerWorker`, `subscribeOnTopic`, `setDependencies`, `setRestBasePath`, `setChannels`, `addStartedHandler`, `addStoppedHandler`, `generateServiceSchema`, `logger` getter.
- Symbol-keyed `[REGISTER_WORKFLOW]` — internal, gated through `setWorkflows()` helper.

**Extraction candidates**:
- BullMQ worker lifecycle (state + `_createQueueSchema` + started/stopped fragments) → `@gertsai/api-queue`. ~340 LOC.
- Pub/Sub lifecycle (state + `_createSubscriberSchema` + started/stopped fragments) → `@gertsai/api-pubsub`. ~140 LOC.
- Trace-context build helpers (W3C traceparent assembly, sampled detection) → `@gertsai/otel` `/moleculer` subpath (already exists as adapter target). ~30 LOC.
- Diagnostics dynamic import + ASCII-box render → already in `lib/diagnostics` cluster; rewire to `@gertsai/logger-factory` peer.
- Fallback logger → consume `@gertsai/logger-factory` `consoleBackend` (Sprint 3.9) directly; remove inline `createSimpleFallbackLogger`.

**Impact of decomposition**:
- 30+ consumers (counted across packages + examples; 23 imports from `/moleculer`, only `m9s-example` exercises queues at depth currently).
- Breaking risk: **low** if extractions are additive (re-export from `@gertsai/api-core/moleculer` via barrel during deprecation window).
- LOC moved out: ~510 of 1511 (~34 percent). Remaining ~1000 LOC concentrates on the action pipeline + schema synthesis — still large but coherently scoped.

### Module 2: `lib/controller/types.ts`

**File**: `packages/api-core/src/lib/controller/types.ts` (1037 LOC, 47 type/interface/enum exports)

**Single responsibility?**: **No**. The file is the **type-mirror of `ApiController.class.ts`** plus four orthogonal concerns:

1. **Service context extension** — `ServiceContextBase`, `LifecycleHandlerContext`, `LifecycleHandler`.
2. **BullMQ types** — `BullMQConnectionOptions`, `BullMQWorkerLockOptions`, `JobStatus`, `QueueOptions`, `QueueHandler*`, `JobDataWithTraceContext`, `TracedJobData`, `QueueProcessingStatus` (32-event union), `ApiControllerRegisteredQueue`, `ApiControllerQueues`, `QueueJob`.
3. **Pub/Sub types** — `SubscribeOptions`, `SubscribeHandler`, `SubscriberHandlerCtx`, `SubscriptionProcessingEvents`, `ApiControllerSubscribedTopics`, `ApiControllerSubscriptions`, `ProcessingEvents`.
4. **Action pipeline types** — `ActionAuthType`, `ActionHandler`, `ActionHandlerCtx`, `ActionHandlerResponse`, `ActionOptions`, `ActionCallFunction`, `QueueActionCallFunction`, `ApiControllerRegisteredAction`, `RegisteredActions` (declaration-merge target).
5. **Auth + ABAC types** — `OpenFgaCheckConfig`, `OpenFgaCheckDiscriminatedUnion`, `ABACRequirements`, plus re-exports from `@gertsai/auth-openfga` (`TypedOpenFgaCheck`, `StaticOpenFgaCheck`, `CheckableResourceType`, `RelationFor`).
6. **Trace context** — `QueueTraceContext`.
7. **REST schema** — `RestMethod`, `RestConfig`, `RestSchema`, `ServiceNameToPath`, `ServiceDependency`, `KnownServices` (declaration-merge target).

**Cohesion**: Mixed. The action-pipeline types ARE the public type contract that every consumer's action file imports — they belong to the core "register actions" responsibility. The BullMQ + Pub/Sub blocks each form an internally cohesive sub-cluster that maps 1:1 to the corresponding extract candidates in Module 1.

**Public surface**: 47 exports — essentially all of them are public via the `/moleculer` subpath, confirmed by direct imports in m9s-example.

**Extraction candidates**:
- BullMQ types → move with queue extract → `@gertsai/api-queue/types`. ~190 LOC.
- Pub/Sub types → move with pubsub extract → `@gertsai/api-pubsub/types`. ~80 LOC.
- Auth + ABAC types → already partly re-exported from `@gertsai/auth-openfga`; consider collapsing remaining ~40 LOC into `auth-openfga` to remove the indirection.

**Impact of decomposition**:
- Type-only extraction is the **safest** kind — bundle-equivalent at runtime, only changes import paths.
- Consumers re-export from the original location during the deprecation window (one-line barrel additions in `lib/controller/types.ts`).
- After Wave 15.B + 15.C, expected remaining size: ~700 LOC (down from 1037), focused on the action-pipeline contract.

### Module 3: `lib/envelope/types/error.ts`

**File**: `packages/api-core/src/lib/envelope/types/error.ts` (620 LOC)

**Single responsibility?**: **Mixed** — three concerns:

1. **RFC-030 error response shape** — `GertsErrorResponse`, `GertsErrorDetail`, RFC 9457 ProblemDetails extension.
2. **Error taxonomy** — `GertsErrorType` (10-value), `GertsErrorCode` (~50-value), `GertsProcessingStage` (~14-value union).
3. **Helpers** — `generateRequestId`, `getStatusCode`, `isRetryable`, `createGertsError`, validators (`validateGertsError`, `assertGertsError`, `validateGertsErrorEquals`), convenience creators (`validationError`, `notFoundError`, `authError`, `rateLimitError`, `internalError` — *intentionally NOT exported from envelope/index.ts due to collision with `lib/error/helpers.ts`*).

**Cohesion**: Medium. The taxonomy unions and the response interface belong together; the validator suite is mechanical typia output. The unexported convenience creators are dead weight in the envelope namespace (they collide with first-class `lib/error/helpers.ts` and the comment in `envelope/index.ts` openly acknowledges this — see `index.ts` lines 12-17).

**Public surface**: ~20 exports via `/contracts`.

**Extraction candidates**: Combine the entire `lib/envelope` cluster (1901 LOC across `types/{error,list,response,index}.ts` + `response-wrapper.ts` + `type-guards.ts`) into a new browser-safe **`@gertsai/api-envelope`** (Tier 1, no Node deps). The envelope is consumed by:
- `apiGateService.template.ts` (via `wrapSuccessResponse`/`wrapErrorResponse`/`extractPackageInfo`),
- the GertsResponse envelope feature flag is feature-flagged (`USE_GERTS_ENVELOPE` env var) — already opt-in.

**Impact of decomposition**: 1.9k LOC moved out of `@gertsai/api-core`. Consumers re-import from `@gertsai/api-envelope`; api-core re-exports during deprecation. No runtime change; bundle savings for browser-only consumers of `/contracts` (e.g. potential FastAPI / Rust ts-types generators per `contracts/index.ts` JSDoc).

### Module 4: `lib/envelope/type-guards.ts`

**File**: `packages/api-core/src/lib/envelope/type-guards.ts` (450 LOC)

**Single responsibility?**: **Yes** — defensive runtime type-narrowing for unknown payloads (OrchestraInfo, TenantContextMeta, UsageInfo, PackageJson, headers, query strings) + tenant-ID regex (SEC-002).

**Cohesion**: High — all helpers serve the gateway's "we receive `unknown` from moleculer-web and need to safely route" need.

**Public surface**: 13 named exports.

**Extraction candidates**: Goes WITH the envelope extract (Module 3) — it is the runtime companion to the envelope types.

### Module 5: `moleculer/apiGateService.template.ts`

**File**: `packages/api-core/src/moleculer/apiGateService.template.ts` (439 LOC)

**Single responsibility?**: **No** — three concerns:

1. **CORS policy** — `parseCorsOrigins` (~36 LOC, EVID-043 C3 hardened) — fail-closed-in-production CWE-942 protection.
2. **Response wrapping** — `sendResponse` / `sendGertsResponse` / `sendLegacyResponse` (~130 LOC) — routes between legacy Orchestra and RFC-030 envelope.
3. **Error normalisation** — `sendError` (~90 LOC) — discriminates APIError, MoleculerError (instanceof + duck-type fallback for pnpm dual-instance issue), OAuthError, AuthenticationError (duck-type), generic Error.

**Cohesion**: Medium — all three serve the "API gateway response" surface, but each is a separable strategy.

**Public surface**: `createApiService` (factory), `mapAuthErrorToResponseCode` (exported for testability).

**Extraction candidates**:
- `mapAuthErrorToResponseCode` + `sendError` discriminator → already a pure function; could move into `@gertsai/api-envelope` as part of the error-translation layer.
- `parseCorsOrigins` is config-policy — keep with gateway template.

**Impact of decomposition**: Lower priority than Modules 1-3; defer to Wave 16.

## Cross-cutting concerns

| Concern | Where currently | Tier-1 candidate | Status |
|---|---|---|---|
| Logging | `ApiController.createSimpleFallbackLogger` + 3-tier `_getLogger` + diagnostics ASCII-box (`lib/diagnostics/{builtins,registry,renderer}`); `console.warn` in `apiGateService` for CORS | `@gertsai/logger-factory` (Sprint 3.9, in-monorepo) | **Migration opportunity**: replace inline fallback with `consoleBackend` from logger-factory; keep diagnostics as pluggable "error-pattern lookup" layer |
| Error handling + scrubbing | `APIError` extends `GertsError` from `@gertsai/core`; scrub repeated 4x in `ApiController` (`_createActionSchema`, `_createQueueSchema`, `_createSubscriberSchema`) and in `apiGateService.sendError`; `__ORCHESTRA_ERROR__` duck-type checked 4x | `@gertsai/errors` (Tier 1, fresh Sprint 3.6) | **Partial delegation**: `@gertsai/core.GertsError` already provides hierarchy; the 4x duplicated scrub block is a candidate for a shared `scrubAndRethrow` helper. `@gertsai/errors` could absorb `APIError`+`OIDCError` long-term |
| Request validation | typia validators consumed inline via `getValidator(action.options.params)` + `coerceQueryParams`/`smartCoerce`; `lib/common/typia-params.ts` (313 LOC) + `lib/common/coercion.ts` (214 LOC) | n/a — keep | Already well-scoped to `lib/common`; could be its own subpath `@gertsai/api-core/contracts/validation` |
| Auth / RequestContext composition | `ApiController._createActionSchema` performs `ctx.meta.user_uuid + user_type` → `_config.sessionFactory` → `session.$destroy` in finally; `lib/oauth/oauth.class.ts` writes `OAuthContextMeta`; `auth-provider.ts` defines `AuthProvider` registry; `setAuthenticatedMeta` is the single typed write boundary | `@gertsai/runtime-context` (Sprint 3.7, fresh) + `@gertsai/session` (Sprint 3.4) | **Tight-coupled**: session lifecycle is wired into the action handler. `runtime-context` could provide the RequestContext on top of which the action handler runs; this is a Wave 16+ refactor |
| Telemetry / OpenTelemetry | W3C traceparent built inline in `_createActionSchema` (~30 LOC); tracer spans created inline in `_createQueueSchema` (~25 LOC); zero usage of `@gertsai/otel` in api-core | `@gertsai/otel` (Sprint 3.2, in-monorepo) | **Migration opportunity**: replace inline traceparent assembly with `@gertsai/otel/moleculer` helper. Tier-4 → Tier-1 reverse-dep would be fine because `otel` is already published |
| Queue / workflow / channels | BullMQ Queue+Worker inline in `ApiController` (~340 LOC); workflow attached via Symbol hook (`setWorkflows`); channels passed through to moleculer-channels middleware (no logic) | `@gertsai/queue` (Sprint 3.2 — already wraps BullMQ) | **Strong extraction candidate**: replace inline `new Queue(...)`/`new Worker(...)` with `@gertsai/queue` consumption; turn the controller's queue surface into a thin adapter |
| Response envelope construction | `lib/envelope/*` (1901 LOC) + `OrchestraApiResponse` class + RFC-030 mapping; consumed only by `apiGateService.template.ts` and external apps that import `wrapSuccessResponse`/`wrapErrorResponse` | New `@gertsai/api-envelope` Tier 1 (proposed) | **Strong extraction candidate**: type-only + pure functions, no Node side-effects; browser-safe |

## Ranked decomposition proposal

### Tier 1 — Highest impact-over-effort

1. **Extract response envelope into `@gertsai/api-envelope`** — Target: NEW `@gertsai/api-envelope` (Tier 1). Files: `lib/envelope/*` + `lib/apiResponse/{types,OrchestraApiResponse.class}.ts` (or keep apiResponse in api-core as backward-compat shim). LOC moved: ~2400 of 9772 (~25 percent). Public-API impact: **non-breaking** — `@gertsai/api-core/contracts` re-exports from new package. Wave: 15.A.

   Rationale: Envelope code is **pure** (typia tagged types + serialization helpers), already feature-flagged behind `USE_GERTS_ENVELOPE`, only used in one Node side-effect site (`apiGateService.template.ts`). Browser-safe extraction enables FastAPI / Rust ts-types generators referenced in `contracts/index.ts` JSDoc to consume the envelope without dragging moleculer/bullmq peers. Single-file commits possible.

2. **Extract BullMQ queue/worker plumbing into `@gertsai/api-queue`** — Target: NEW `@gertsai/api-queue` (Tier 2). Files: BullMQ-specific types from `lib/controller/types.ts` (~190 LOC) + queue-related slices of `ApiController.class.ts` (`_createQueueSchema`, `registerWorker`, queue methods in `generateServiceSchema`, started/stopped BullMQ blocks; ~340 LOC). LOC moved: ~530. Public-API impact: **additive** — current `controller.registerWorker(...)` API preserved as a thin shim that delegates to the new package. Wave: 15.B.

   Rationale: BullMQ is already in monorepo as `@gertsai/queue` (Sprint 3.2 wrapped BullMQ); the controller's worker lifecycle should consume that package rather than re-implementing it. Eliminates duplicated `Queue`/`Worker` lifecycle, decouples LLM-tuned lock-duration defaults from the api surface. Enables future swap (e.g. Cloud Tasks adapter) without touching api-core.

3. **Extract Pub/Sub subscription into `@gertsai/api-pubsub`** — Target: NEW `@gertsai/api-pubsub` (Tier 2, optional peer for `@google-cloud/pubsub`). Files: Pub/Sub-specific types from `lib/controller/types.ts` (~80 LOC) + subscription slices of `ApiController.class.ts` (`_createSubscriberSchema`, `subscribeOnTopic`, `getSubscription` method, started/stopped Pub/Sub blocks; ~110 LOC). LOC moved: ~190. Public-API impact: **additive** — shim. Wave: 15.C.

   Rationale: Pub/Sub is feature-flagged behind `ApiController._config.pubSub`; many consumers (m9s-example, pipeline) do not use it. Making it a peer-optional package mirrors the existing pattern for `@moleculer/workflows` (already extracted to `workflow/` subdir as adapter). Lowers default install footprint of `@gertsai/api-core` consumers who never touch GCP.

### Tier 2 — Worthwhile but not urgent

4. **Consume `@gertsai/otel/moleculer` for trace propagation** — Target: existing `@gertsai/otel` (Tier 1, published). Files: action-pipeline trace-context assembly in `ApiController._createActionSchema` (~30 LOC) + queue span creation in `_createQueueSchema` (~25 LOC). LOC moved: ~55, replaced with thin imports. Public-API impact: **none**. Wave: 15.B or 15.C (bundle with queue extraction).

   Rationale: Today the controller hand-rolls W3C traceparent strings and calls `this.broker.tracer.startSpan(...)`. `@gertsai/otel` is the designed home for this; the controller should be a consumer, not the implementor.

5. **Consume `@gertsai/logger-factory` for fallback logger** — Target: existing `@gertsai/logger-factory` (Tier 1, published). Files: `createSimpleFallbackLogger` (8 LOC) and `_getLogger` 3-tier fallback (~12 LOC) in `ApiController.class.ts`. Public-API impact: **none**. Wave: 15.C or 16.

   Rationale: Eliminates duplicated console-shim; aligns with monorepo logger story.

6. **Migrate `APIError`/`OIDCError` to consume `@gertsai/errors`** — Target: existing `@gertsai/errors` (Tier 1, fresh Sprint 3.6, Shared Kernel). Files: `lib/error/APIError.class.ts` (265 LOC) + `lib/error/OIDCError.class.ts` (316 LOC) + `lib/error/helpers.ts` (313 LOC). Public-API impact: **major** — APIError surface is consumed by 113 internal usages + every example/app. Wave: 16.A (defer — needs careful migration).

   Rationale: `APIError` already extends `GertsError` from `@gertsai/core` and uses `ErrorKind`/`HTTP_TO_ERROR_KIND` from there; the `@gertsai/errors` Shared Kernel was designed precisely to replace `GertsError`. This is the natural next step, but the breakage radius (`@gertsai/core.GertsError` → `@gertsai/errors.AppError`) is too large for Wave 15.

### Tier 3 — Speculative

7. **OAuth2 mixin deprecation** — Files: `lib/oauth/{oauth.class,auth-provider,index}.ts` (494 LOC) + `moleculer/oauth.mixin.ts` (7 LOC). Status in source: explicitly marked `@deprecated This OAuth2 implementation is legacy and will be removed in a future version`. Wave: 16+ — extract to `@gertsai/auth-oauth2` if any consumer still needs OAuth2, or hard-delete with breaking-version bump if no internal consumers depend on it.

8. **`apiGateService.template.ts` decomposition** — Split CORS / response-routing / error-discrimination into named helpers under `moleculer/gateway/*`. LOC 439 → 4 files of ~110 LOC each. Wave: 16. Lower priority because the file already has good internal section commenting.

9. **OpenAPI service** — `moleculer/openapiService.template.ts` (95 LOC) is feature-flagged and unused in current m9s-example. Status: leave for Wave 16+ — decide whether to remove or extract into a dedicated `@gertsai/openapi-aggregator` adapter package.

## Suggested Wave 15 fix sequence

1. **Wave 15.A — Envelope extraction** (~1.5d). Create `@gertsai/api-envelope` Tier 1. Move `lib/envelope/*` (+ `lib/apiResponse/{types,OrchestraApiResponse}.ts` optionally). Re-export from `@gertsai/api-core/contracts` for backwards compat. Update `apiGateService.template.ts` imports.
2. **Wave 15.B — BullMQ queue/worker extraction** (~2.5d). Create `@gertsai/api-queue` Tier 2 consuming `@gertsai/queue`. Move BullMQ types from `lib/controller/types.ts`. Move queue lifecycle from `ApiController.class.ts`. Keep `controller.registerWorker(...)` as a shim. Adopt `@gertsai/otel/moleculer` for queue span construction.
3. **Wave 15.C — Pub/Sub extraction + logger consumption** (~1.5d). Create `@gertsai/api-pubsub` Tier 2 (optional peer for `@google-cloud/pubsub`). Move Pub/Sub types + lifecycle. Replace `createSimpleFallbackLogger` with `@gertsai/logger-factory.consoleBackend`. Adopt `@gertsai/otel/moleculer` for action-pipeline traceparent.

Total Wave 15: ~5.5d. Outcome: `@gertsai/api-core` shrinks from 9772 LOC to ~6500 LOC (~33 percent reduction), `ApiController.class.ts` from 1511 to ~1000 LOC, `types.ts` from 1037 to ~700 LOC. Zero breaking changes; all new packages additive.

## Out-of-scope observations

- **m9s-example imports from `@gertsai/api-core` only** (no subpath) in `services/{auth,ingest,search}/types.ts` — these would benefit from migrating to `/contracts` or `/moleculer` (2 lines of grep evidence; cosmetic, not blocking).
- **Dual error-helper namespace**: `lib/error/helpers.ts` provides `notFoundError`, `validationError`, `authError`, `rateLimitError`, `internalError`; `lib/envelope/types/error.ts` defines IDENTICALLY-NAMED creators (intentionally NOT re-exported because of the collision documented in `envelope/index.ts:12-17`). Confusing duplication; the envelope versions should be renamed (`createGertsValidationError`, etc.) or removed entirely.
- **`@ts-ignore` density**: `ApiController.class.ts` has 9 `@ts-ignore` / `@ts-expect-error` comments; `oauth.class.ts` has 6; `apiGateService.template.ts` has 3. None block extraction but should be revisited.
- **Static state in `ApiController`**: `_config`, `_broker`, `_workersEnabled`, `_enabledWorkers`, `_controllers` are static — they make the class a *de-facto* singleton. Wave 15 extractions can preserve this; Wave 16+ instance-per-tenant refactor would need DI-injection (depends on `@gertsai/di`).
- **`ApiController.Start({...repl: true})` defaults REPL on** — repl is a development convenience that ships in production builds. Could be made opt-in but is not in scope for Wave 15.
- **`config.ts` reads `process.env` at module-load time** via `loadConfig` — eager side effect on `import @gertsai/api-core/moleculer`. Per `runtime/node/index.ts` comment, root export deliberately doesn't re-export `runtime/node` to avoid `dotenv` eager load; **but** the `/moleculer` subpath still triggers `config.ts` evaluation because `apiGateService.template.ts` and `oauth.class.ts` import `from '../../config'`. Loosely related to Wave 15 but worth a follow-up audit.
- **`pendingWorkflows` Symbol pattern**: a clever workaround for `dts:true` exposing every `public` method. With the queue/pubsub extractions, the controller surface shrinks enough that this pattern may no longer be needed — but no urgency.

## Methodology

Read-only audit: 0 source files modified. Files audited: 55 (every `.ts` file in `packages/api-core/src/` excluding `__test*` / `*.test.ts` / `*.spec.ts`). Tools used: `Read` (large-file inspection), `Bash` (LOC counting via `wc -l`, import-edge extraction via grep), `forgeplan` CLI (artifact creation). Cross-package consumer search: `grep -r "@gertsai/api-core" packages/ examples/` (84 import sites in non-dist non-node_modules files). No graph MCP usage — fell back to grep because the `code-review-graph` tools were not surfaced in this session.

Confidence: **high** for inventory + LOC + dependency-graph claims (direct file evidence); **medium** for extraction-ease estimates (would need a Wave 15.A spike to confirm the envelope extract leaves zero typia-transformer issues).

## Refs

- PRD-049 (target — Wave 15 god-class architectural audit + decomposition strategy)
- EVID-058 (Wave 12.G aggregate — ranked api-core #1 by `severity_max * consumer_count`)
- EVID-051 / EVID-048 (Wave 12.D / 12.C aggregated tier-2 audit context)
- ADR-003 (Platform Runtime Boundaries — subpath strategy `/contracts`, `/moleculer`, `/runtime/node`)
- ADR-002 (Hex layer enforcement — applies to `examples/m9s-example` only; this package is flat-utility Tier 4)
- ADR-006 (`@gertsai/errors` Shared Kernel — long-term migration target for `APIError`)
- ADR-007 (`@gertsai/runtime-context` — Wave 16+ target for request-context composition)
- ADR-009 (Wave 5 Phase 4 — `@gertsai/logger-factory`, `@gertsai/async-utils`, `@gertsai/rpc-proxy-builder`)
- Hub ADR-011 (`@gertsai/pg-client` agnostic invariants — pattern precedent for `@gertsai/api-queue` adapter)



