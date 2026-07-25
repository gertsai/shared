# Errors, tenant, runtime-context, session-guard, audit, rate-limit

## What & why

`m9s-example` wires the canonical **"Wave 5" cross-cutting stack** as a pipeline
that flows tenant identity and request context from the Moleculer broker
boundary down into use cases.

Two broker middlewares run in **fixed order**:

1. `tenantMiddleware` (`@gertsai/tenant-resolver/moleculer`) resolves the
   `X-Tenant-ID` header onto `ctx.meta.tenantId`.
2. `sessionMiddleware` (`@gertsai/runtime-context/moleculer`) composes a
   `RequestContext`, attaches it to `ctx.locals.requestContext`, and `$freeze()`s
   it **before** the handler runs.

Action handlers never touch the full `RequestContext`. They project the frozen
context to a tiny snapshot via `tryGetRequestContextFromCtx`, enforce
identity/tenant with `@gertsai/session-guard` assertions, throw the
`@gertsai/errors` taxonomy, and scrub PII at the HTTP boundary via a local
`appErrorToHttpResponse` wrapper.

Rate limiting is a **separate concern** — it is not a broker middleware but a
`moleculer-web` `settings.use` HTTP middleware from `@gertsai/api-rlr`, gated on
`REDIS_URL`, with a tenant-then-IP bucket key.

The payoff: a single typed-error surface (the `@gertsai/errors` taxonomy) lets
the transport layer pick the wire format and scrub topology/PII centrally;
tenant + session flow through one frozen context so every layer sees the same
identity; and the guards run at two layers (transport + use case) so the same
invariants hold whether a request arrives over HTTP or from a queue worker.

## How it works in m9s-example

### Pattern: Two-middleware Wave 5 pipeline in canonical order

- **What** — a composition-layer factory builds exactly two broker middlewares —
  `tenantMiddleware` then `sessionMiddleware` — from a single shared
  `ChainTenantResolver` instance, and the broker config spreads them into
  `BrokerOptions.middlewares` ahead of transport/workflow middlewares.
- **Why** — `tenantMiddleware` MUST run before `sessionMiddleware` so
  `ctx.meta.tenantId` is resolved before `RequestContext` is composed and
  `$freeze()`d (ADR-010 Decision B). `sessionMiddleware` freezes **before** the
  handler to close the TOCTOU window between init mutators and request use
  (ADR-007 I-16). Sharing the resolver keeps the resolution path uniform whether
  `tenantMiddleware` ran or `sessionMiddleware` falls back to resolving itself.
- **How** — `buildWave5Middlewares()` returns
  `[tenantMiddleware(resolver), sessionMiddleware({resolver})]`;
  `moleculer.config.ts` loops over the result and pushes each into a
  `BrokerMiddleware[]` array. `tenantMiddleware` / `sessionMiddleware` come from
  the `/moleculer` subpaths of `@gertsai/tenant-resolver` and
  `@gertsai/runtime-context` respectively.

### Pattern: RequestContext snapshot projection at the handler boundary

- **What** — action handlers never touch `RequestContext` directly. A single
  helper `tryGetRequestContextFromCtx(ctx)` reads it off
  `ctx.locals.requestContext` and projects to a tiny additive-optional snapshot
  `{session, expectedTenantId}`. It uses the `*Optional` accessors
  (`sessionOptional` / `tenantIdOptional`) so anonymous requests return
  `undefined` instead of throwing.
- **Why** — keeps action code decoupled from the full `RequestContext` surface
  and makes the Wave 5 fields additive-optional so pre-Wave-5 handlers keep
  working (ADR-010 I-2/I-3). Strict accessors (`session` / `tenantId`) would
  crash valid anonymous requests under `mode:'optional'`. Duck-typing (checking
  `sessionOptional` / `tenantIdOptional` presence) rather than `instanceof` is
  required because tsup bundles a separate `RequestContext` class copy into the
  root vs `/moleculer` subpath, so `instanceof` fails across import paths.
- **How** — `tryGetRequestContextFromCtx` reads
  `ctx.locals[REQUEST_CONTEXT_LOCALS_KEY]`, structurally checks for the
  `*Optional` getters, returns
  `{session: rc.sessionOptional, expectedTenantId: rc.tenantIdOptional}`. There
  is also a gated `meta.testSession` seam
  (`TEST_SESSION_ALLOWED = non-prod && GERTSAI_TEST_SESSION_ALLOW=1`) for e2e
  tests bypassing the HTTP path; production hard-crashes at module load if that
  flag is set in production.

### Pattern: session-guard assertions at two layers (defense in depth)

- **What** — both the transport action handler AND the application use case call
  `assertAuthenticated(session)` and, when `expectedTenantId` is present,
  `assertSessionInTenant(session, tenantId)`.
- **Why** — the action asserts early (before the queue-vs-inline branch) so
  401/403 surface synchronously on the triggering request rather than failing
  silently inside a worker. The use case re-asserts so business logic is safe
  even when invoked from a non-HTTP caller (queue worker, test).
  `assertSessionInTenant` blocks the "both undefined" cross-tenant bypass per
  ADR-007 I-18. Authentication is mandatory post Wave 12.E-fix-1 (the guard is no
  longer conditional on `session !== undefined` at the action layer).
- **How** — import
  `{assertAuthenticated, assertSessionInTenant, AuthenticationRequiredError, TenantScopeViolationError}`
  from `@gertsai/session-guard`. `assertAuthenticated` narrows
  `Session | undefined` to `Session` (TS `asserts` signature) and throws
  `AuthenticationRequiredError`; `assertSessionInTenant` throws
  `TenantScopeViolationError`.

### Pattern: AppError taxonomy thrown in domain/app, scrubbed + mapped at HTTP boundary

- **What** — domain factories and use cases throw `@gertsai/errors` subclasses
  (`ValidationError`, `InternalError`, `ForbiddenError` via `permissionDenied()`).
  The inbound action catch block routes every `AppError` through a project
  `appErrorToHttpResponse()` scrubber, then re-throws as api-core `APIError` with
  the right `ResponseCode`.
- **Why** — a single typed-error surface lets the transport layer pick the wire
  format. The local scrubber strips PII/topology hints (`userId`, `url`,
  `originalKind`) from outbound `ProblemDetails.details` before they cross the
  wire (CWE-209) while server logs keep the unredacted `AppError`. Server-kind
  errors (INTERNAL/UPSTREAM/BAD_GATEWAY) collapse to one URN bucket so infra
  topology never leaks. The scrubber lives in `shared/` (neutral kernel) so
  services can import it without crossing into `composition/` (Wave 8.3 dep rule).
- **How** — `shared/errors.ts` re-exports the taxonomy + `permissionDenied()`;
  `shared/error-scrubber.ts` wraps `@gertsai/errors/http` `appErrorToHttpResponse`
  with a frozen `HTTP_BOUNDARY_DETAILS_DENYLIST`. Action catch: branch on
  `err instanceof AuthenticationRequiredError` / `TenantScopeViolationError`,
  else `isAppError(err)` catch-all, calling `appErrorToHttpResponse(err)` and
  surfacing `body.details` on `APIError.data` (cast as `never` because api-core
  error `ResponseDataType` resolves to `never`).

### Pattern: api-rlr as a gated moleculer-web use-chain with tenant-scoped buckets

- **What** — rate limiting is a separate concern from the Wave 5 broker
  middlewares — it plugs into `moleculer-web`'s `settings.use` (an Express-style
  HTTP middleware chain that runs before Moleculer routes), gated on
  `RLR_ENABLED && REDIS_URL`.
- **Why** — the only shipped api-rlr store is Redis-shaped, so without
  `REDIS_URL` the chain is empty (no throttling) and dev keeps working. The
  bucket key is tenant-scoped (`X-Tenant-ID`) with IP fallback so per-tenant
  fairness is enforced; raw header values are format-validated to prevent
  Redis-injection. `moleculer-web`'s built-in `rateLimit` is set to `null` so
  api-rlr is the single throttling pass.
- **How** —
  `const rlrUseChain = config.RLR_ENABLED && config.REDIS_URL ? [RLRMiddleware({timeFrame, limit, burst, strategy, prefix, store: () => new IORedis(...), bucketKeyResolver})] : [];`
  then `settings.use = rlrUseChain; settings.rateLimit = null`.
  `bucketKeyResolver` validates the tenant against `/^[a-zA-Z0-9_-]{1,64}$/`
  before keying `tenant:<id>`, else falls back to `ip:<first-xff>`.

## Template

```ts
// SPDX-License-Identifier: Apache-2.0
// =============================================================================
// Wave 5 cross-cutting reference (errors / tenant / runtime-context /
// session-guard / rate-limit). Genericized from m9s-example. Split across the
// files indicated by the // FILE: markers when you adopt it.
// =============================================================================

// -----------------------------------------------------------------------------
// FILE: src/shared/errors.ts  — neutral error kernel (importable by ALL layers)
// -----------------------------------------------------------------------------
export {
  AppError,
  ErrorKind,
  ForbiddenError,
  UnauthorizedError,
  ValidationError,
  InternalError,
  isAppError,
  wrapUnknownError,
} from '@gertsai/errors';
import { ForbiddenError } from '@gertsai/errors';

/** Domain AuthZ rejection factory — keeps a stable message + details shape. */
export function permissionDenied(
  userId: string,
  action: string,
  resource: string,
): ForbiddenError<{ userId: string; action: string; resource: string }> {
  return new ForbiddenError({
    message: `User '${userId}' is not allowed to '${action}' on '${resource}'`,
    details: { userId, action, resource },
  });
}

// -----------------------------------------------------------------------------
// FILE: src/shared/error-scrubber.ts — HTTP-boundary PII/topology scrubber
// -----------------------------------------------------------------------------
import type { AppError } from '@gertsai/errors';
import {
  appErrorToHttpResponse as _appErrorToHttpResponse,
  type ProblemDetails,
} from '@gertsai/errors/http';
export type { ProblemDetails };

// TODO: list project-specific keys that must NEVER cross the wire.
const HTTP_BOUNDARY_DETAILS_DENYLIST: readonly string[] = Object.freeze([
  'userId',
  'url',
  'originalKind',
] as const);

function scrubDetails(
  details: Readonly<Record<string, unknown>> | undefined,
): Readonly<Record<string, unknown>> | undefined {
  if (details === undefined) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(details)) {
    if (HTTP_BOUNDARY_DETAILS_DENYLIST.includes(k)) continue;
    out[k] = v;
  }
  return out;
}

/** @gertsai/errors/http already redacts REDACTION_KEYS; this adds app keys. */
export function appErrorToHttpResponse(
  err: AppError,
): { readonly status: number; readonly body: ProblemDetails } {
  const { status, body } = _appErrorToHttpResponse(err);
  const scrubbed = scrubDetails(body.details);
  if (scrubbed === body.details) return { status, body };
  return {
    status,
    body: { ...body, ...(scrubbed !== undefined && { details: scrubbed }) },
  };
}

// -----------------------------------------------------------------------------
// FILE: src/composition/wave5-middlewares.ts — tenant + session pipeline
// -----------------------------------------------------------------------------
import type { Context } from 'moleculer';
import {
  ChainTenantResolver,
  HeaderStrategy,
  type TenantResolverStrategy,
} from '@gertsai/tenant-resolver';
import { tenantMiddleware } from '@gertsai/tenant-resolver/moleculer';
import {
  REQUEST_CONTEXT_LOCALS_KEY,
  sessionMiddleware,
} from '@gertsai/runtime-context/moleculer';
import type { RequestContext } from '@gertsai/runtime-context';
import type { Session } from '@gertsai/session';

export function buildTenantResolver(): TenantResolverStrategy<Context> {
  // SECURITY (CWE-639): trustProxy:true REQUIRES a reverse proxy that strips
  // client-supplied X-Tenant-ID and re-sets it from authenticated context.
  const headerStrategy = new HeaderStrategy({
    headerName: 'X-Tenant-ID',
    trustProxy: true, // TODO: verify your edge proxy strips inbound header.
  });
  const adapted: TenantResolverStrategy<Context> = {
    name: headerStrategy.name,
    async resolve(ctx) {
      const meta = (ctx.meta ?? {}) as Record<string, unknown>;
      const headersRaw = meta['headers'];
      if (typeof headersRaw !== 'object' || headersRaw === null || Array.isArray(headersRaw)) {
        return null;
      }
      return headerStrategy.resolve({
        headers: headersRaw as Record<string, string | string[] | undefined>,
      });
    },
  };
  // TODO: production should use mode:'strict' (the library default) to
  // fail-closed on missing tenant. 'optional' only for mixed public routes.
  return new ChainTenantResolver<Context>([adapted], { mode: 'optional' });
}

export function buildWave5Middlewares(): readonly unknown[] {
  const resolver = buildTenantResolver();
  // ORDER MATTERS: tenantMiddleware MUST precede sessionMiddleware.
  return [tenantMiddleware(resolver), sessionMiddleware({ resolver })];
}

export interface Wave5ContextSnapshot {
  readonly session: Session | undefined;
  readonly expectedTenantId: string | undefined;
}

/** Project the frozen RequestContext to the additive-optional snapshot. */
export function tryGetRequestContextFromCtx(ctx: Context): Wave5ContextSnapshot {
  const locals = (ctx as unknown as { locals?: Record<string, unknown> }).locals;
  const value = locals?.[REQUEST_CONTEXT_LOCALS_KEY];
  // Duck-type, NOT instanceof — tsup ships a separate class per subpath.
  if (
    value === null ||
    typeof value !== 'object' ||
    !('sessionOptional' in value) ||
    !('tenantIdOptional' in value)
  ) {
    return { session: undefined, expectedTenantId: undefined };
  }
  const rc = value as RequestContext;
  const raw = rc.tenantIdOptional;
  return {
    session: rc.sessionOptional,
    // Empty string collapses to undefined so strict guards fail closed.
    expectedTenantId: raw !== undefined && raw.length > 0 ? raw : undefined,
  };
}

// -----------------------------------------------------------------------------
// FILE: moleculer.config.ts — spread the Wave 5 stack into the broker
// -----------------------------------------------------------------------------
// import { buildWave5Middlewares } from './src/composition/wave5-middlewares';
// type BrokerMiddleware = NonNullable<BrokerOptions['middlewares']>[number];
// const middlewares: BrokerMiddleware[] = [];
// for (const m of buildWave5Middlewares()) middlewares.push(m as BrokerMiddleware);
// // ... push transport / workflow middlewares AFTER the Wave 5 stack.

// -----------------------------------------------------------------------------
// FILE: src/services/<svc>/actions/<name>.action.ts — boundary enforcement
// -----------------------------------------------------------------------------
import { APIError, ResponseCode } from '@gertsai/api-core/contracts';
import { defineAction } from '@gertsai/api-core/moleculer';
import {
  AuthenticationRequiredError,
  TenantScopeViolationError,
  assertAuthenticated,
  assertSessionInTenant,
} from '@gertsai/session-guard';
import { isAppError } from '@gertsai/errors';
// import { appErrorToHttpResponse } from '../shared/error-scrubber';
// import { tryGetRequestContextFromCtx } from '../composition/wave5-middlewares';

export const exampleAction = defineAction(
  /* controller.register('name', */ {
    auth: 'none', // TODO: switch to 'required' once a real auth middleware lands.
    rest: 'POST /resource',
    async handler({ params, ctx, service, respond }: any) {
      try {
        // 1) Enforce identity + tenant at the boundary, BEFORE any branching.
        const { session, expectedTenantId } = tryGetRequestContextFromCtx(ctx);
        assertAuthenticated(session); // mandatory — never make this conditional
        if (expectedTenantId !== undefined) {
          assertSessionInTenant(session, expectedTenantId);
        }

        // 2) Delegate to the use case (which re-asserts — defense in depth).
        const result = await service.useCase.execute({
          ...params,
          session,
          ...(expectedTenantId !== undefined && { expectedTenantId }),
        });
        return respond(result, 'OK', ResponseCode.SUCCESS_CREATED);
      } catch (err) {
        // 3) Map domain AppError -> transport APIError; scrub PII at the wire.
        if (err instanceof AuthenticationRequiredError) {
          const { body } = appErrorToHttpResponse(err);
          throw new APIError(ResponseCode.UNAUTHORIZED_REQUEST, body.details as never, 'Authentication required');
        }
        if (err instanceof TenantScopeViolationError) {
          const { body } = appErrorToHttpResponse(err);
          throw new APIError(ResponseCode.FORBIDDEN__INSUFFICIENT_RIGHTS, body.details as never, 'Tenant scope violation');
        }
        if (isAppError(err)) {
          const { body } = appErrorToHttpResponse(err); // catch-all: future AppErrors auto-scrubbed
          throw new APIError(ResponseCode.INTERNAL_ERROR, body.details as never, body.title);
        }
        throw err; // non-AppError -> framework default handler
      }
    },
  },
);

// -----------------------------------------------------------------------------
// FILE: src/application/<Name>UseCase.ts — additive-optional re-assertion
// -----------------------------------------------------------------------------
// import { assertAuthenticated, assertSessionInTenant } from '@gertsai/session-guard';
// async execute(input: { session?: Session; expectedTenantId?: string; /* ... */ }) {
//   if (input.session !== undefined) {
//     assertAuthenticated(input.session);
//     if (input.expectedTenantId !== undefined) {
//       assertSessionInTenant(input.session, input.expectedTenantId);
//     }
//   }
//   // ... AuthZ gate (throw permissionDenied(...)) then domain work ...
// }

// -----------------------------------------------------------------------------
// FILE: src/mol-services/api.service.ts — rate limiting (separate concern)
// -----------------------------------------------------------------------------
import RLRMiddleware from '@gertsai/api-rlr';
import IORedis from 'ioredis';
// declare const config: any;

const rlrUseChain =
  config.RLR_ENABLED && config.REDIS_URL
    ? [
        RLRMiddleware({
          timeFrame: config.RLR_TIMEFRAME, // ms window, e.g. 60_000
          limit: config.RLR_LIMIT,         // e.g. 100
          burst: config.RLR_BURST,         // e.g. 5 (GCRA token bucket)
          strategy: config.RLR_STRATEGY as any, // 'gcra' | 'sliding_window' | ...
          prefix: config.RLR_PREFIX,       // e.g. 'myapp:rlr:'
          store: () => new IORedis(config.REDIS_URL, { maxRetriesPerRequest: 1, lazyConnect: true }) as any,
          bucketKeyResolver: (req: { headers: Record<string, string | string[] | undefined> }) => {
            const raw = req.headers['x-tenant-id'] ?? req.headers['x-tenant'];
            const tenantId = Array.isArray(raw) ? raw[0] : raw;
            // Format-validate to prevent Redis-key injection / per-id explosion.
            if (tenantId && /^[a-zA-Z0-9_-]{1,64}$/.test(tenantId)) return `tenant:${tenantId}`;
            const xff = req.headers['x-forwarded-for'];
            const ip = Array.isArray(xff) ? xff[0] : xff;
            return `ip:${((ip ?? 'unknown').split(',')[0] ?? 'unknown').trim()}`;
          },
        }),
      ]
    : []; // gated on REDIS_URL — empty chain = no throttling in dev.

// settings: { rateLimit: null /* disable built-in so api-rlr is the only pass */, use: rlrUseChain, ... }
```

The full standalone skeleton lives at
[`templates/wave5-cross-cutting.reference.ts`](../templates/wave5-cross-cutting.reference.ts).

## Best practices

- Compose `tenantMiddleware` BEFORE `sessionMiddleware` (ADR-010 §B) — tenant
  must be on `ctx.meta.tenantId` before `RequestContext` is composed and frozen.
  Spread `buildWave5Middlewares()` ahead of transport/workflow middlewares in
  `BrokerOptions.middlewares`.
- Read `RequestContext` only from `ctx.locals.requestContext`, never `ctx.meta` —
  `locals` is per-request/per-process scope; `meta` is reserved for cross-broker
  serialisation and would leak the context across the wire.
- Project `RequestContext` through the `*Optional` accessors (`sessionOptional` /
  `tenantIdOptional`) when serving mixed public+private routes under
  `mode:'optional'` — the strict `session` / `tenantId` getters throw and would
  crash valid anonymous requests.
- Recognise `RequestContext` by structural duck-typing (presence of
  `sessionOptional` / `tenantIdOptional`), not `instanceof` — tsup bundles a
  separate class copy into the root vs `/moleculer` subpath, so an instance from
  `sessionMiddleware` is not `instanceof` the root-exported class.
- Assert session-guard invariants at the very top of the handler try-block,
  before any queue-vs-inline branch, so 401/403 surface synchronously on the
  triggering request instead of failing silently inside a worker.
- Re-assert the same guards inside the use case (defense in depth) so business
  logic stays safe when invoked from non-HTTP callers (queue workers, tests).
- Throw the `@gertsai/errors` taxonomy (`ValidationError` / `InternalError` /
  `ForbiddenError` via `permissionDenied`) from domain/application code; map to
  transport `APIError` only at the inbound action catch block — keeps the
  application layer free of `@gertsai/api-core`.
- Always route `AppError` through the project `appErrorToHttpResponse` scrubber
  before putting `details` on the wire — `@gertsai/errors/http` only redacts the
  central `REDACTION_KEYS` list; add app-specific PII/topology keys (`userId`,
  `url`, `originalKind`) to the local denylist.
- Keep the error kernel (taxonomy re-exports + `permissionDenied`) and the
  scrubber in `shared/` (neutral kernel), not `composition/`, so the services
  layer can import them without violating the hex dependency-cruiser rule
  (`no-services-to-composition-errors`).
- Add an `isAppError` catch-all branch after the specific `instanceof` branches
  so future `AppError` subclasses are auto-scrubbed and mapped without per-error
  edits.
- Construct `HeaderStrategy` with `trustProxy:true` ONLY when a reverse proxy
  strips client-supplied `X-Tenant-ID` and re-sets it from authenticated context;
  carry an inline `// SECURITY:` comment at the construction site (ADR-010 I-14)
  to surface the deployment contract at review time.
- Gate api-rlr on `REDIS_URL` and set `moleculer-web` `rateLimit:null` so api-rlr
  is the single throttling pass; format-validate tenant header values
  (`/^[a-zA-Z0-9_-]{1,64}$/`) inside `bucketKeyResolver` before keying, and fall
  back to client IP.
- Gate any test-only auth seam (`meta.testSession`) on BOTH
  `NODE_ENV !== 'production'` AND an explicit opt-in env var, and hard-crash at
  module load if the opt-in is set in production (better dead than insecure).

## Pitfalls

- Using `instanceof RequestContext` to detect the context off `ctx.locals`
  silently returns "not found" because tsup ships a distinct class identity per
  subpath — always duck-type on the `*Optional` getters.
- Calling the strict `rc.session` / `rc.tenantId` accessors for a
  `mode:'optional'` route throws `SessionMissingError` /
  `TenantContextMissingError` on legitimate anonymous traffic — use the
  `*Optional` variants in the snapshot projection.
- Forgetting that `assertSessionInTenant` returns false / throws when
  `session.tenantId` is undefined regardless of the requested id (ADR-007 I-18) —
  this is intentional to block the "both undefined" cross-tenant bypass; do not
  "fix" it by short-circuiting on undefined.
- Making the action-layer authentication guard conditional
  (`if (session !== undefined) {...}`) lets unauthenticated POSTs proceed with no
  tenant scoping (CWE-862, the pre-Wave-12.E-fix-1 bug) — `assertAuthenticated`
  must run unconditionally at the boundary.
- Writing `AppError.toJSON()` or raw `details` directly to an HTTP response leaks
  the full details + cause chain — `toJSON` is for application logs only; cross
  the wire only via `appErrorToHttpResponse` (which redacts) plus the local
  denylist scrubber.
- Setting `HeaderStrategy` without `trustProxy` throws by design (fail-closed);
  but setting `trustProxy:true` without a proxy that strips inbound `X-Tenant-ID`
  lets any client spoof the tenant and cross boundaries (CWE-639).
- Mixing tenant sources — deriving `expectedTenantId` from the `X-Tenant-ID`
  header while the session carries a different `tenantId` — is a CWE-345 footgun;
  the `testSession` seam derives tenant from the session and throws loudly if the
  header disagrees.
- Keying the rate-limit bucket on the raw `X-Tenant-ID` header without format
  validation allows Redis-key injection and per-id key explosion; validate the
  format and normalise paths.
- Leaving `GERTSAI_TEST_SESSION_ALLOW=1` set in a production process would enable
  the auth-bypass `testSession` seam — the module-load sanity check throws to
  prevent this; do not remove it.
- Importing the scrubber or error kernel from `composition/` into a service
  triggers the Wave 8.3 `no-services-to-composition-errors` dep-cruiser rule —
  import from `shared/error-scrubber` and `shared/errors` instead
  (`composition/errors.ts` is only a backwards-compat re-export).
- Registering api-rlr while leaving `moleculer-web`'s built-in `rateLimit`
  enabled produces double throttling — set `rateLimit:null`.

## Canonical files

- [`examples/m9s-example/src/composition/wave5-middlewares.ts:115`](../../../../examples/m9s-example/src/composition/wave5-middlewares.ts#L115)
  — `buildWave5Middlewares()` (lines 115-125) composes
  `tenantMiddleware → sessionMiddleware` in canonical order from a shared
  `ChainTenantResolver(HeaderStrategy trustProxy:true, mode:'optional')`.
- [`examples/m9s-example/src/composition/wave5-middlewares.ts:208`](../../../../examples/m9s-example/src/composition/wave5-middlewares.ts#L208)
  — `tryGetRequestContextFromCtx(ctx)` (lines 208-347) reads the frozen
  `RequestContext` off `ctx.locals` (duck-typed), projects to
  `{session, expectedTenantId}`; handles the gated `meta.testSession` test seam.
- [`examples/m9s-example/src/composition/wave5-middlewares.ts:64`](../../../../examples/m9s-example/src/composition/wave5-middlewares.ts#L64)
  — `buildTenantResolver()` (lines 64-105):
  `HeaderStrategy({headerName:'X-Tenant-ID', trustProxy:true})` adapted from
  `Context → HttpRequestLike`, wrapped in `ChainTenantResolver({mode:'optional'})`.
- [`examples/m9s-example/moleculer.config.ts:167`](../../../../examples/m9s-example/moleculer.config.ts#L167)
  — broker wiring (lines 167-187): spreads `buildWave5Middlewares()` into
  `BrokerOptions.middlewares` before transport/workflow middlewares.
- [`examples/m9s-example/src/shared/errors.ts:17`](../../../../examples/m9s-example/src/shared/errors.ts#L17)
  — neutral error kernel (lines 17-49): re-exports `@gertsai/errors` taxonomy +
  `permissionDenied()` `ForbiddenError` factory; importable by all hex layers.
- [`examples/m9s-example/src/shared/error-scrubber.ts:26`](../../../../examples/m9s-example/src/shared/error-scrubber.ts#L26)
  — `appErrorToHttpResponse()` (lines 26-61): wraps `@gertsai/errors/http`
  serializer + project denylist (`userId` / `url` / `originalKind`) stripped from
  outbound `ProblemDetails.details` (CWE-209).
- [`examples/m9s-example/src/composition/errors.ts:12`](../../../../examples/m9s-example/src/composition/errors.ts#L12)
  — thin backwards-compat re-export (lines 12-15) of the shared scrubber for
  composition-layer consumers.
- [`examples/m9s-example/src/services/ingest/src/actions/ingest-document.action.ts:100`](../../../../examples/m9s-example/src/services/ingest/src/actions/ingest-document.action.ts#L100)
  — canonical action try/catch (lines 100-258): `assertAuthenticated` +
  `assertSessionInTenant` up front, then maps `AppError` subclasses through the
  scrubber to `APIError` `ResponseCode`s.
- [`examples/m9s-example/src/application/IngestDocumentUseCase.ts:96`](../../../../examples/m9s-example/src/application/IngestDocumentUseCase.ts#L96)
  — use-case-layer defense-in-depth (lines 96-113): additive-optional
  `session` / `expectedTenantId` re-asserted before the AuthZ gate + domain work.
- [`examples/m9s-example/src/mol-services/api.service.ts:71`](../../../../examples/m9s-example/src/mol-services/api.service.ts#L71)
  — rate-limit wiring (lines 71-106): `RLRMiddleware` in `moleculer-web`
  `settings.use`, gated on `RLR_ENABLED && REDIS_URL`, tenant-then-IP
  `bucketKeyResolver` with format validation.
- [`examples/m9s-example/src/mol-services/api.service.ts:167`](../../../../examples/m9s-example/src/mol-services/api.service.ts#L167)
  — `rateLimit:null` (lines 167-168) disables moleculer-web's built-in limiter so
  api-rlr is the only throttling pass.
- [`examples/m9s-example/project.config.ts:101`](../../../../examples/m9s-example/project.config.ts#L101)
  — RLR env defaults (lines 101-111):
  `RLR_ENABLED` / `TIMEFRAME` / `LIMIT` / `BURST` / `STRATEGY` / `PREFIX`.

## @gertsai packages used

- `@gertsai/errors` — `AppError`, `ErrorKind`, `ForbiddenError`,
  `UnauthorizedError`, `ValidationError`, `InternalError`, `isAppError`,
  `wrapUnknownError`.
- `@gertsai/errors/http` — `appErrorToHttpResponse`, `ProblemDetails`,
  `REDACTION_KEYS`.
- `@gertsai/tenant-resolver` — `ChainTenantResolver`, `HeaderStrategy`,
  `TenantResolverStrategy`.
- `@gertsai/tenant-resolver/moleculer` — `tenantMiddleware`.
- `@gertsai/runtime-context` — `RequestContext`.
- `@gertsai/runtime-context/moleculer` — `sessionMiddleware`,
  `REQUEST_CONTEXT_LOCALS_KEY`.
- `@gertsai/session` — `Session`.
- `@gertsai/session-guard` — `assertAuthenticated`, `assertSessionInTenant`,
  `AuthenticationRequiredError`, `TenantScopeViolationError`.
- `@gertsai/api-rlr` — `RLRMiddleware` (default export).
- `@gertsai/api-core/contracts` — `APIError`, `ResponseCode`.
- `@gertsai/api-core/moleculer` — `defineAction`.
- `@gertsai/tenant` — `TenantId` (tenant brand consumed downstream).
