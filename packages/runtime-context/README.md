# @gertsai/runtime-context

Per-request composition root for the `@gertsai/*` ecosystem — Tier 4 per
[ADR-007](https://github.com/gertsai/shared/blob/main/.forgeplan/adrs/ADR-007-runtimecontext-design-wave-5-phase-2-extraction-policy-session-guard-audit-primitives-placement.md).
A `RequestContext` combines `@gertsai/session` identity, `@gertsai/tenant-resolver`
output, correlation tracking, locale, feature-flag access and DI-aware
provider lookup behind a single value carried for the lifetime of a request.

## Install

```bash
pnpm add @gertsai/runtime-context
```

Peers: `@gertsai/errors`, `@gertsai/session`, `@gertsai/tenant-resolver`,
`@gertsai/di`. The `moleculer` peer is optional and only required when
importing the `/moleculer` subpath.

## Quickstart

```ts
import {
  RequestContext,
  requireAuthContext,
  requestContextIdentifier,
} from '@gertsai/runtime-context';

const ctx = new RequestContext({
  session,
  tenantId: 'acme',
  locale: 'en',
  features: { enabled: new Set(['beta-x']) },
  providers: {
    bindings: new Map([[mailerToken, mailer]]),
  },
});

ctx.$freeze(); // finalise — subsequent $set* mutators throw ContextFrozenError

const auth = requireAuthContext(ctx); // { session, tenantId, getOperatorStrict() }
console.log(auth.getOperatorStrict());

if (ctx.features.isEnabled('beta-x')) {
  // ...
}

const mailer = ctx.providers.get(mailerToken);
```

## Subpath imports

The root export covers the runtime-agnostic API. Transport-specific
helpers live behind subpaths so the core has no `moleculer` runtime
dependency (per ADR-007 I-1, I-2).

### `/moleculer`

```ts
import { ServiceBroker } from 'moleculer';
import { ChainTenantResolver, HeaderStrategy } from '@gertsai/tenant-resolver';
import {
  sessionMiddleware,
  getRequestContext,
  tenantMiddleware,
} from '@gertsai/runtime-context/moleculer';

const resolver = new ChainTenantResolver({
  strategies: [new HeaderStrategy({ headerName: 'x-tenant-id' })],
});

const broker = new ServiceBroker({
  middlewares: [
    tenantMiddleware(resolver),
    sessionMiddleware({
      resolver,
      sessionFactory: (ctx) => buildSessionFromMeta(ctx.meta),
    }),
  ],
});

// Inside any action handler:
//   const rc = getRequestContext(ctx);
//   rc.session, rc.tenantId, rc.correlationId, rc.providers.get(...)
```

`sessionMiddleware` attaches the composed `RequestContext` to
`ctx.locals.requestContext` (per ADR-007 I-15 — `locals` is per-request
scope; `meta` is reserved for cross-broker serialisation) and calls
`$freeze()` on it BEFORE invoking the downstream handler (per
ADR-007 I-16 — TOCTOU protection).

## API

| Export | Source | Purpose |
|---|---|---|
| `RequestContext` | root | Per-request mutable container with lazy private getters and freeze invariant |
| `RequestContextInit` | root | Constructor options shape |
| `AuthContext` | root | Security projection — non-optional `session` + `tenantId` + `getOperatorStrict()` |
| `requireAuthContext(ctx)` | root | Build `AuthContext`, throwing on missing session/tenant |
| `requireAuthContextWithDataAccess(ctx)` | root | Variant requiring non-empty `session.dataAccessUuid` |
| `FeatureContext` / `DefaultFeatureContext` | root | Flag-aware accessor (Set + optional dynamic provider) |
| `ProviderContext` / `DefaultProviderContext` | root | DI-aware lookup over symbol tokens |
| `requestContextIdentifier` | root | `Symbol.for('@gertsai/runtime-context:RequestContext')` for DI bindings |
| `SessionMissingError` | root | `extends NotFoundError<{ contextField: 'session' }>` |
| `TenantContextMissingError` | root | `extends UnauthorizedError<{ reason: 'tenant-context-not-resolved' }>` |
| `ProviderNotFoundError` | root | `extends NotFoundError<{ token: string }>` |
| `ContextFrozenError` | root | `extends ConflictError<{ frozen: true }>` |
| `FeatureNotEnabledError` | root | `extends ForbiddenError<{ flag: string }>` |
| `sessionMiddleware(opts)` | `/moleculer` | Composes RequestContext per call, attaches + freezes |
| `getRequestContext(ctx)` | `/moleculer` | Reads RequestContext from `ctx.locals` |
| `tenantMiddleware` | `/moleculer` | Re-export of `@gertsai/tenant-resolver/moleculer` |
| `REQUEST_CONTEXT_LOCALS_KEY` | `/moleculer` | Slot name (`'requestContext'`) on `ctx.locals` |

## Init contract

`RequestContext` is intentionally lazy — every getter has a defined
behaviour for the un-initialised path. When wiring a context manually:

1. Construct with whatever subset of fields is known up front via
   `RequestContextInit`.
2. Call `$setSession`, `$setTenantId`, `$setCorrelationId` from any
   middleware that resolves additional fields. Throw or short-circuit
   *before* mutating if the upstream lookup fails.
3. Call `$freeze()` as the final init step. The Moleculer middleware does
   this automatically (ADR-007 I-16); HTTP adapters MUST do the same.
4. After freeze: `$set*` mutators throw `ContextFrozenError`. Lazy getters
   continue to work (their values were eager-initialised during freeze
   per ADR-007 I-22).

`correlationId` is generated lazily via `crypto.randomUUID()` (Node ≥22
LTS) on first access; supply your own via `$setCorrelationId` when an
upstream system has already minted one.

## Security

- **Lazy throws.** The strict accessors (`session`, `tenantId`) throw
  `SessionMissingError` / `TenantContextMissingError` rather than
  returning `undefined`. Code paths that operate on a privileged subject
  cannot accidentally proceed without one. Use the `*Optional` variants
  when undefined is genuinely valid.
- **Freeze invariant** (I-4, I-16, I-22). After `$freeze()` no field can
  be mutated. The Moleculer middleware freezes BEFORE the request handler
  runs to close the TOCTOU window between init and use.
- **Symbol-only provider tokens** (I-17). `ProviderContext.get<T>(token)`
  rejects non-symbol values with `TypeError`. Wrap any string-keyed
  provider via `Symbol.for('<package>:<name>')` so token names are
  compile-time-known and the surface area for accidental collisions is
  contained.
- **`ctx.locals` not `ctx.meta`** (I-15). The Moleculer middleware
  attaches `RequestContext` to per-request scope; it never crosses the
  broker boundary in serialised form.
- **Default-deny feature flags.** `DefaultFeatureContext` traps any
  exception thrown by a dynamic `flagProvider` and reports the flag as
  `false` — a misbehaving provider can never silently *enable* a feature.
- **Crypto-strength correlation ids** (I-20). `correlationId` is generated
  with `crypto.randomUUID()`; `Math.random()` is never used.

## TypedToken<T>

Type-narrowing wrapper for DI tokens — eliminates `unknown` returns from
`ProviderContext.get<T>(token)` and lets the compiler enforce the value
type registered against a token. Added in Sprint 3.10 per
[ADR-010](https://github.com/gertsai/shared/blob/main/.forgeplan/adrs/ADR-010-sprint-3-10-wave-5-polish-closure-m9s-example-wave-5-integration.md)
§D + Amendment 1 §I-12, §I-13.

### Quickstart

```ts
import { defineToken, DefaultProviderContext } from '@gertsai/runtime-context';

interface UserService {
  findById(id: string): Promise<User>;
}

const USER_TOKEN = defineToken<UserService>('UserService');

// Registration uses `.symbol` — same key as the existing symbol-only API.
const providers = new DefaultProviderContext({
  bindings: new Map([[USER_TOKEN.symbol, userServiceImpl]]),
});

// Lookup is narrowed at compile time — no `unknown`, no cast.
const userSvc = providers.get(USER_TOKEN); // UserService
```

### API

| Export | Purpose |
|---|---|
| `defineToken<T>(name)` | Mints a `TypedToken<T>` carrying a module-private `Symbol(...)`. The returned object is `Object.freeze`-wrapped. |
| `isTypedToken(value)` | Brand-check predicate (`value is TypedToken<unknown>`). |
| `TypedToken<T>` | `{ readonly symbol; readonly name; readonly [BRAND]: true }` — `T` is phantom (inferred from declaration site). |
| `ProviderContext.get<T>(token: TypedToken<T>): T` | Typed getter overload. |
| `ProviderContext.getOptional<T>(token: TypedToken<T>): T \| undefined` | Typed optional getter overload. |

### Compatibility

The `TypedToken<T>` overloads are purely additive — existing callers that
pass a bare `symbol` continue to compile and run unchanged. Overload order
is: bare `symbol` FIRST, `TypedToken<T>` SECOND. TypeScript resolves
overloads by declaration order, and a `TypedToken` value is structurally
an `object` (not assignable to bare `symbol`), so the typed overload wins
for any `TypedToken` argument.

### Security

- Brand uses a **module-private** `Symbol(...)` (NOT `Symbol.for`) per
  Sprint 3.8 I-11 — external code cannot mint a value carrying the brand
  because the symbol is unreachable through the global registry
  (CWE-1321 prevention).
- `isTypedToken` uses `Object.prototype.hasOwnProperty.call` rather than
  prototype-walking property access — `Object.prototype` pollution cannot
  bypass the check.
- The runtime extracts `.symbol` from a `TypedToken` BEFORE delegating to
  `assertSymbolToken`, so the existing CWE-843 guard against non-symbol
  tokens stays effective for both call shapes.

### Cross-references

- [ADR-010 §D + Amendment 1 §I-12, §I-13](https://github.com/gertsai/shared/blob/main/.forgeplan/adrs/ADR-010-sprint-3-10-wave-5-polish-closure-m9s-example-wave-5-integration.md) — design + invariants.
- Sprint 3.8 I-11 — module-private `Symbol(...)` brand pattern.

## Cross-references

- [ADR-007 — Wave 5 Phase 2 placement](https://github.com/gertsai/shared/blob/main/.forgeplan/adrs/ADR-007-runtimecontext-design-wave-5-phase-2-extraction-policy-session-guard-audit-primitives-placement.md)
- [PRD-003 — Wave 5 foundation](https://github.com/gertsai/shared/blob/main/.forgeplan/prds/PRD-003-wave-5-errors-runtime-context-framework-adapters-developer-experience-foundation.md)

## License

Apache-2.0. The `LICENSE` file is a symlink to the repository root.
