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
  `createOpenApiService`, `createMoleculerConfig`, plus `MX()` OAuth mixin and an
  auth-error → `ResponseCode` mapper for the API gateway.
- **OpenAPI merge** — aggregates per-service OpenAPI v3.1 documents across the
  cluster via `openapi-merge`, exposed at `/schema.json` and `/schema.local.json`.
- **Envelope + type guards** — RFC-030 `GertsResponse` / `GertsErrorResponse` /
  `GertsListResponse` types, response/error wrappers, cursor pagination,
  and tenant-context guards (`SEC-002` validation included).
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
| Envelope (RFC-030)               | `GertsResponse`, `GertsErrorResponse`, `GertsListResponse` + validators, type guards          |
| Response wrapper                 | `wrapSuccessResponse`, `wrapErrorResponse`, `buildResponsePayload`, `wantsLegacyFormat`       |
| Type guards                      | `isOrchestraInfo`, `extractTenantId`, `extractTraceId`, `validateTenantIdFormat` (SEC-002)    |
| `createApiService`               | Moleculer Web gateway template with auth-error → `ResponseCode` mapping                       |
| `createOpenApiService`           | Aggregates OpenAPI v3.1 across the cluster via `openapi-merge`                                |
| `createMoleculerConfig`          | Broker config with NATS/Redis transports, Bunyan + Google Cloud logging, healthcheck         |
| `MX()` OAuth mixin               | Legacy OAuth2 server mixin (deprecated — prefer a dedicated auth package)                     |
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
  type GertsResponse, type GertsErrorResponse, type GertsListResponse,
  type GertsAnyResponse, type UsageInfo, type PaginationInfo,
  createGertsResponse, createGertsError, createGertsListResponse,
  validateGertsResponse, isGertsResponse, isSuccessResponse,
  isErrorResponse, isListResponse,
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
  mapAuthErrorToResponseCode, MX,
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
every action response in `OrchestraApiResponse`, maps thrown `APIError` /
`OAuthError` instances to the right HTTP status, and (when `USE_GERTS_ENVELOPE=1`
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
- The `MX()` OAuth mixin (`./lib/oauth`) is **deprecated**; new services should
  use a dedicated auth package.
- RFC-030 envelope output is opt-in via `USE_GERTS_ENVELOPE=true` or
  `createApiService({ useGertsEnvelope: true })`; legacy
  `OrchestraApiResponse` is the default.

## License

MIT — see [LICENSE](../../LICENSE).
