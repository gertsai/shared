---
'@gertsai/runtime-context': minor
---

Initial release. Per-request composition root with lazy getters and freeze invariant.

- `RequestContext` class with lazy private getters for session/tenantId/correlationId/locale/features/providers; `$setSession`/`$setTenantId`/`$setCorrelationId` mutators; `$freeze()` finalization with eager-init of lazy fields per ADR-007 I-22.
- `AuthContext` (security projection) + `requireAuthContext(ctx)` / `requireAuthContextWithDataAccess(ctx)` factories.
- `FeatureContext` (flag-aware, default-deny on flagProvider exception) + `ProviderContext` (DI-aware) sub-aggregates.
- 5 dedicated errors extending parametric `@gertsai/errors` taxonomy: `SessionMissingError`, `TenantContextMissingError`, `ProviderNotFoundError`, `ContextFrozenError`, `FeatureNotEnabledError`.
- `/moleculer` subpath: `sessionMiddleware(opts)` factory composing RequestContext per-request, attached to `ctx.locals.requestContext`, **auto-`$freeze()`-ed before downstream handler** (per ADR-007 I-16 TOCTOU protection).
- ProviderContext.get<T>(token) requires `symbol` tokens (rejects strings — type-confusion protection per ADR-007 I-17).
- Lazy `correlationId` uses `crypto.randomUUID()` (per ADR-007 I-20).
- `requestContextIdentifier = Symbol.for('@gertsai/runtime-context:RequestContext')` exported for DI integration.
