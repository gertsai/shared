<div align="center">

# @gertsai/api-core

### API primitives for Gerts Moleculer services

Unified errors, response envelope, controller class, Moleculer mixins, OpenAPI merge,
and diagnostics — the layer everything HTTP-shaped sits on.

[![Tier](https://img.shields.io/badge/tier-4-orange?style=flat-square)](#status)
[![Build](https://img.shields.io/badge/build-tspc-blue?style=flat-square)](#status)
[![Status](https://img.shields.io/badge/status-internal-lightgrey?style=flat-square)](#status)

</div>

---

`@gertsai/api-core` is the shared API toolkit for every Gerts service. It owns the
on-the-wire contract: how errors look, how responses are wrapped, how controllers
register actions/queues/subscriptions, how Moleculer is configured, and how OpenAPI
schemas are stitched together across nodes.

If a Gerts service speaks HTTP, it speaks through this package.

## Why @gertsai/api-core

- **`APIError` + `ResponseCode`** — RFC-053 unified error class extending
  `GertsError` from `@gertsai/core`, paired with a hierarchical `ResponseCode` enum
  (`200/ok`, `401/02/token_expired`, `409/conflict`, ...) so HTTP status, semantic
  `ErrorKind`, and retryable flag all derive from one source.
- **`OIDCError`** — OAuth2/OIDC-flavored `APIError` subclass with RFC 6749 codes
  (`invalid_grant`, `interaction_required`, `mfa_required`, ...) and proper
  `WWW-Authenticate` formatting for `/oauth2/*` endpoints.
- **`ApiController`** — typed registration surface for actions, BullMQ queues,
  and Pub/Sub subscriptions; auto-generates Moleculer `ServiceSchema`, wires Typia
  validators, coerces query params, and exposes a typed `ServiceContext`.
- **Moleculer mixins & templates** — drop-in `createApiService`,
  `createOpenApiService`, `createMoleculerConfig`, plus an auth-error →
  `ResponseCode` mapper for the API gateway. (The legacy `MX()` OAuth mixin
  was removed in Wave 16.A — mount your own auth via `settings.use`.)
- **OpenAPI merge** — aggregates per-service OpenAPI v3.1 documents across the
  cluster via `openapi-merge`, exposed at `/schema.json` and `/schema.local.json`.
- **Envelope + type guards** — RFC-030 `GertsResponse` / `GertsListResponse`
  types, response/error wrappers, cursor pagination, and tenant-context guards
  (`SEC-002` validation included). Outbound errors use canonical RFC 9457
  `ProblemDetails` from `@gertsai/errors/http` per ADR-006 §A1.5 (Wave 14.6 /
  PRD-054 retired the legacy `GertsErrorResponse` envelope).
- **Diagnostics** — pluggable startup-check registry with a pretty-box renderer,
  so services fail loudly with actionable output instead of cryptic stack traces.

## Install

`@gertsai/api-core` is a workspace package — depend on it via pnpm workspace
protocol.

```jsonc
// package.json
{
  "dependencies": {
    "@gertsai/api-core": "workspace:*"
  },
  "peerDependencies": {
    "moleculer": "^0.14.35",
    "moleculer-web": "^0.10.6",
    "moleculer-repl": "^0.7.3",
    "ioredis": "^5.8.0",
    "nats": "^2.13.1"
  }
}
```

```bash
pnpm install
pnpm --filter @gertsai/api-core build
```

The package builds with `tspc` (`ts-patch` + `typescript-transform-paths`) and
runs `ts-patch install` on `postinstall` — see [Status](#status).

## Quickstart

Throw a typed error, get the right HTTP status, semantic `ErrorKind`, and a
client-safe JSON shape — all from one constructor.

```ts
import {
  APIError,
  ResponseCode,
  notFoundError,
  validationError,
  rateLimitError,
} from '@gertsai/api-core';

// 1. Direct construction — full control
throw new APIError(
  ResponseCode.NOT_AUTHORIZED__TOKEN_EXPIRED,
  undefined,
  'Refresh required',
);

// 2. Helpers — concise and consistent
throw notFoundError('User', userId);          // 404, "User 'abc123' not found"
throw validationError('Email is required', {  // 400/01/invalid_params
  fields: { email: ['required'] },
});
throw rateLimitError(60);                     // 429, retryAfter: 60

// 3. Inspect on the gateway side
try {
  await action();
} catch (e) {
  if (e instanceof APIError) {
    console.log(e.code);          // '404/not_found'
    console.log(e.httpCode);      // 404
    console.log(e.kind);          // 'NotFound' (ErrorKind from @gertsai/core)
    console.log(e.isClientError); // true
    console.log(e.toClientJSON()); // safe-to-expose payload
  }
}
```

`APIError.fromError(e)` auto-detects `ResponseCode` from a numeric `statusCode`
field on the source error — handy for wrapping domain errors (e.g.
`FileStorageError`) without losing the HTTP mapping.

## What you get

| Surface                          | What it does                                                                                  |
| -------------------------------- | --------------------------------------------------------------------------------------------- |
| `APIError` + helpers             | RFC-053 unified error; factories for 400/401/403/404/409/412/413/429/500/503/504/507          |
| `OIDCError` + `OAuth2ErrorCode`  | OAuth2/OIDC errors with RFC 6749 codes and `WWW-Authenticate` headers                         |
| `ResponseCode` + `responseMetadata` | Hierarchical enum (`401/02/token_expired`); HTTP code + retryable flag from one source     |
| `OrchestraApiResponse`           | Typed response envelope class consumed by the API gateway                                     |
| `ApiController`                  | Typed actions / BullMQ queues / Pub/Sub subscriptions → Moleculer `ServiceSchema`             |
| Envelope (RFC-030)               | `GertsResponse`, `GertsListResponse` + validators, type guards (errors → RFC 9457 `ProblemDetails`) |
| Response wrapper                 | `wrapSuccessResponse`, `wrapErrorResponse`, `buildResponsePayload`, `wantsLegacyFormat`       |
| Type guards                      | `isOrchestraInfo`, `extractTenantId`, `extractTraceId`, `validateTenantIdFormat` (SEC-002)    |
| `createApiService`               | Moleculer Web gateway template with auth-error → `ResponseCode` mapping                       |
| `createOpenApiService`           | Aggregates OpenAPI v3.1 across the cluster via `openapi-merge`                                |
| `createMoleculerConfig`          | Broker config with NATS/Redis transports, Bunyan + Google Cloud logging, healthcheck         |
| `IP utils`                       | `parseForwarded`, `extractClientIp`, IPv4/IPv6 helpers used by the gateway                    |
| Typia params                     | `getValidator`, `isTypiaParamsWithSchema`, `TypiaValidator` for typed action parameters       |
| Coercion                         | `smartCoerce`, `coerceQueryParams` — string → typed primitive for query strings               |
| `DiagnosticRegistry`             | Pluggable startup checks + `renderDiagnosticBox` ASCII output                                 |
| `loadConfig`                     | `process.env` overlay over typed defaults (`project-config`)                                  |

## API surface

### Errors

```ts
import {
  APIError, OIDCError, ResponseCode, responseMetadata,
  // helpers
  notFoundError, conflictError, forbiddenError, unauthorizedError,
  tokenInvalidError, tokenExpiredError, validationError, badRequestError,
  internalError, serviceUnavailableError, rateLimitError,
  preconditionFailedError, payloadTooLargeError, insufficientStorageError,
  notImplementedError, requestTimeoutError, gatewayTimeoutError,
  // domain code dictionaries
  AuthErrorCodes, OIDCErrorCodes, FilesErrorCodes,
  DatabaseErrorCodes, ValidationErrorCodes, PRISMA_ERROR_MAP,
} from '@gertsai/api-core';
```

### Response & envelope

```ts
import {
  OrchestraApiResponse,
  type GertsResponse, type GertsListResponse,
  type GertsAnyResponse, type UsageInfo, type PaginationInfo,
  createGertsResponse, createGertsListResponse,
  validateGertsResponse, isGertsResponse, isSuccessResponse,
  isListResponse,
  wrapSuccessResponse, wrapErrorResponse, buildResponsePayload, wantsLegacyFormat,
  extractTenantId, extractTraceId, extractUsageInfo, extractPackageInfo,
  validateTenantIdFormat, TENANT_ID_REGEX,
} from '@gertsai/api-core';
```

### Controller & Moleculer

```ts
import {
  ApiController, type ServiceContextBase, type ActionHandler,
  createApiService, createOpenApiService, createMoleculerConfig,
  mapAuthErrorToResponseCode,
} from '@gertsai/api-core';
```

### Common utilities

```ts
import {
  parseForwarded, extractClientIp,                        // IP
  smartCoerce, coerceQueryParams,                         // query coercion
  getValidator, isTypiaParamsWithSchema,                  // typia params
  type TypiaValidator, type TypiaParamsWithSchema,
  DiagnosticRegistry, renderDiagnosticBox,                // diagnostics
  type DiagnosticEntry, type DiagnosticResult,
  loadConfig,                                             // project-config
} from '@gertsai/api-core';
```

## Moleculer integration

`createApiService` produces a Moleculer Web gateway `ServiceSchema` that wraps
every action response in `OrchestraApiResponse`, maps thrown `APIError`
instances to the right HTTP status, and (when `USE_GERTS_ENVELOPE=1`
or `options.useGertsEnvelope`) emits the RFC-030 `GertsResponse` envelope. Auth
middleware errors flow through `mapAuthErrorToResponseCode` so `401/KEY_EXPIRED`,
`401/UNAUTHORIZED`, and `403/INSUFFICIENT_SCOPES` land on the correct
`ResponseCode`. `createOpenApiService` exposes per-node and aggregated OpenAPI
schemas at `/schema.local.json` and `/schema.json`.

```ts
// service.ts
import { ServiceBroker } from 'moleculer';
import {
  createApiService,
  createOpenApiService,
  createMoleculerConfig,
} from '@gertsai/api-core';
import packageJson from '../package.json';
import openapi from './openapi.json';

const broker = new ServiceBroker(createMoleculerConfig());

broker.createService(createApiService({ port: 3000 }, packageJson));
broker.createService(createOpenApiService(openapi));

await broker.start();
```

## Action pipeline (Wave 27)

The action-handling pipeline is composed of 11 named stages (plus `translateError` +
`cleanup` hard-wired into the runner). Each stage is a typed `Stage<TIn, TOut>`
function exported from `@gertsai/api-core/pipeline`.

### Default stages (in order)

1. `extractParams` — resolve params/file/fileMeta from `ctx.meta.$params` vs `ctx.params`
2. `mergeMultipart` — merge `$multipart` into params
3. `coerceQueryString` — typia smartCoerce or legacy coerceQueryParams for GET/DELETE endpoints
4. `injectTenantId` — auto-pop `tenantId` from meta into params
5. `validateRequest` — typia validator + throw `APIError(BAD_REQUEST__INVALID_PARAMS)` on failure
6. `establishAuthSession` — auth-required check + `sessionFactory` call
7. `buildTraceContext` — W3C traceparent for downstream job injection
8. `invokeHandler` — central `action.options.handler.call(...)` invocation
9. `rawResponseShortcut` — early-return for streaming/raw responses
10. `validateResponse` — strict/loose response validation per `RESPONSE_VALIDATION` config
11. `wrapResponse` — wrap result in `{success, code, message, data}` envelope

`translateError` (catches all stage errors, maps to `APIError`) and `cleanup`
(logs + `session.$destroy()`) are hard-wired into `PipelineRunner.run()` per
SPEC-021 I-1/I-2.

### Custom pipeline composition — `setStageOverride`

Use `setStageOverride` to inject custom logic into a single named stage without
forking the controller class. Overrides are per-controller-instance and are
captured at action schema-build time (snapshot isolation: already-registered
actions retain their original pipeline).

```ts
import { ApiController } from '@gertsai/api-core';
import type { Stage } from '@gertsai/api-core/pipeline';

const myAuthStage: Stage = async (ctx, deps) => {
  // custom logic — call the next stage or return ctx directly
  return ctx;
};

const controller = ApiController.resolveController('v1', 'graph');
controller.setStageOverride('establishAuthSession', myAuthStage);

// Actions registered AFTER this call use myAuthStage for stage 6:
controller.register('query', { ... });
```

NOTE: Call `setStageOverride` **before** `register()` for actions you want
the override to apply to. Actions registered before `setStageOverride` retain
the default stage.

### Security boundary — sensitive stages

Four stages are load-bearing security boundaries:

- `establishAuthSession` — authentication enforcement
- `validateRequest`      — input validation
- `validateResponse`     — output validation
- `injectTenantId`       — tenant-scoping invariant

Overriding any of these via `setStageOverride` silently removes the corresponding
check unless your override preserves the security semantics. Each call to
`setStageOverride` for a sensitive stage emits `logger.warn` at startup so the
override is visible in logs.

If you need custom behaviour BEFORE or AFTER the default check, the cleanest
pattern is to import the default stage and compose:

```ts
import { ApiController } from '@gertsai/api-core';
import { establishAuthSession, type Stage } from '@gertsai/api-core/pipeline';

const myAuthStage: Stage = async (ctx, deps) => {
  // ... pre-auth logic (e.g., extract custom auth header)
  const result = await establishAuthSession(ctx, deps);  // default check
  // ... post-auth logic (e.g., custom telemetry)
  return result;
};

controller.setStageOverride('establishAuthSession', myAuthStage);
```

For more invasive patterns (e.g., `addStageBefore`, `wrapStage('around')`), file
a Forgeplan RFC — the current API intentionally limits to single-stage replace.

### Building custom runners

Compose your own pipeline from the exported stages:

```ts
import {
  PipelineRunner,
  extractParams,
  validateRequest,
  invokeHandler,
} from '@gertsai/api-core/pipeline';

const minimalRunner = new PipelineRunner([
  extractParams,
  validateRequest,
  invokeHandler,
]);
```

See `SPEC-021` for the frozen per-stage behaviour contract.

---

## Status

- **Tier 4** in the Gerts shared graph — depends on `@gertsai/core` and
  `@gertsai/auth-openfga`.
- **Build**: `tspc` (TypeScript with `ts-patch` + `typescript-transform-paths`).
  Consumers must keep `ts-patch` available; the package runs
  `ts-patch install -s` on `postinstall`. Use `pnpm build` (one-shot) or
  `pnpm dev` / `pnpm build:watch` (watch).
- **Peer deps**: `moleculer ^0.14.35`, `moleculer-web ^0.10.6`,
  `moleculer-repl ^0.7.3`, `ioredis ^5.8.0`, `nats ^2.13.1`.
- **Private** workspace package — not published to npm.
- **Wave 16.A**: the legacy `MX()` OAuth mixin and the entire
  `./lib/oauth` module were removed. `apiGateService.template.ts` no
  longer mounts any auth mixin by default — consumers wanting auth must
  mount their own Express-style middleware via `settings.use`. The
  `OrchestraApiGateOptions.disableAuth` field is preserved as a no-op
  for type-shape back-compat (will be removed at v1.0.0).
- RFC-030 envelope output is opt-in via `USE_GERTS_ENVELOPE=true` or
  `createApiService({ useGertsEnvelope: true })`; legacy
  `OrchestraApiResponse` is the default.

## License

MIT — see [LICENSE](../../LICENSE).
