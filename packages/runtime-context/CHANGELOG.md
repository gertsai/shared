# @gertsai/runtime-context

## 1.0.0

### Minor Changes

- 782a3e0: Sprint 3.10 — `TypedToken<T>` wrapper for `ProviderContext.get<T>(token)`.

  NEW additive API in `@gertsai/runtime-context`:

  - `defineToken<T>(name: string): TypedToken<T>` — type-narrowing wrapper around module-private `Symbol(...)` (NOT `Symbol.for` per CWE-1321 prevention). Returned object is `Object.freeze`-wrapped.
  - `isTypedToken(value): value is TypedToken<unknown>` — brand-check predicate using `Object.prototype.hasOwnProperty.call` (NOT prototype-walking — Object.prototype pollution-resistant).
  - `TypedToken<T>` interface — `{ symbol, name, [TYPED_TOKEN_BRAND]: true }`. Required brand is sole runtime discriminator (no phantom field per ADR-010 Amendment 1 §I-12 — optional readonly fields are covariant under TS `strict`, do not anchor invariance).

  `ProviderContext.get<T>` and `getOptional<T>` gain `TypedToken<T>` overloads (existing `symbol` overloads preserved). `DefaultProviderContext` extracts `.symbol` from TypedToken BEFORE existing `assertSymbolToken(sym)` guard per Amendment 1 §I-13:

  ```typescript
  const sym = isTypedToken(token) ? token.symbol : token;
  assertSymbolToken(sym);
  ```

  Without this branch, `assertSymbolToken` would throw `TypeError` for any TypedToken caller.

  Quickstart:

  ```typescript
  import { defineToken } from "@gertsai/runtime-context";

  interface UserService {
    findById(id: string): Promise<User>;
  }
  const USER_TOKEN = defineToken<UserService>("UserService");

  ctx.providers.register(USER_TOKEN.symbol, userServiceImpl);
  const userSvc = ctx.providers.get(USER_TOKEN); // typed: UserService (not unknown)
  ```

  Mitigates Sprint 3.7 R-2 token type-erasure risk. Backward compat: existing `symbol`-keyed callers continue to work unchanged.

  Refs ADR-010 §D (revised) + Amendment 1 §A1.4 + §I-12 (brand-only discrimination) + §I-13 (assertSymbolToken extraction).

- 121cb7b: Initial release. Per-request composition root with lazy getters and freeze invariant.

  - `RequestContext` class with lazy private getters for session/tenantId/correlationId/locale/features/providers; `$setSession`/`$setTenantId`/`$setCorrelationId` mutators; `$freeze()` finalization with eager-init of lazy fields per ADR-007 I-22.
  - `AuthContext` (security projection) + `requireAuthContext(ctx)` / `requireAuthContextWithDataAccess(ctx)` factories.
  - `FeatureContext` (flag-aware, default-deny on flagProvider exception) + `ProviderContext` (DI-aware) sub-aggregates.
  - 5 dedicated errors extending parametric `@gertsai/errors` taxonomy: `SessionMissingError`, `TenantContextMissingError`, `ProviderNotFoundError`, `ContextFrozenError`, `FeatureNotEnabledError`.
  - `/moleculer` subpath: `sessionMiddleware(opts)` factory composing RequestContext per-request, attached to `ctx.locals.requestContext`, **auto-`$freeze()`-ed before downstream handler** (per ADR-007 I-16 TOCTOU protection).
  - ProviderContext.get<T>(token) requires `symbol` tokens (rejects strings — type-confusion protection per ADR-007 I-17).
  - Lazy `correlationId` uses `crypto.randomUUID()` (per ADR-007 I-20).
  - `requestContextIdentifier = Symbol.for('@gertsai/runtime-context:RequestContext')` exported for DI integration.

### Patch Changes

- 782a3e0: Sprint 3.10 — Wave 5 P2 polish batch (additive non-breaking).

  `@gertsai/errors` (MINOR — observable behavior change for nested redaction):

  - `wrapUnknownError(x, kind?, correlationId?)` — `kind?` now applied via closed allow-list `'INTERNAL' | 'EXTERNAL'` (TS 2-arity union). `isAppError(x)` early-return preserved (no kind override on already-typed errors). Mitigates CWE-285 (error coercion for auth bypass).
  - `AppError` constructor JSDoc note re shallow `Object.freeze` (deep-freeze deferred).
  - `redactDetails()` now deep-scans recursively (max depth 5, breadth cap 1000, WeakSet anti-cycle, non-plain objects passthrough — Date/RegExp/Buffer left as-is). Mitigates CWE-209 nested info exposure + CWE-400/674 DoS via crafted payloads.
  - `errors/internal.ts` JSDoc clarification (catch-all `D` intentional; subclassing path documented).
  - README cross-references switched to absolute repo URLs (post-publish friendliness; scope expanded to all 13 Wave 5 package READMEs).

  Other Wave 5 packages (PATCH — JSDoc/comment polish, no behavior change):

  - `@gertsai/tenant-resolver`: `MOLECULER_*_HINT` message split (`NON_MOLECULER_CTX_ERROR` vs `MOLECULER_PEER_DEP_ERROR`), `PathStrategy` `...` wildcard JSDoc (trailing-only), `lookupHeader()` precedence note (exact-case-first short-circuit).
  - `@gertsai/runtime-context`: `requireAuthContextWithDataAccess` JSDoc clarified Session.dataAccessUuid getter fallback semantic.
  - `@gertsai/entity-storage`: `BaseEntityStorageService.upsert` 2-RTT cost JSDoc (cross-link KNOWN-ISSUES §10).
  - `@gertsai/entity-react`: `markRaw` `configurable: false` JSDoc (escape-hatch intentionally irreversible).
  - `@gertsai/rest-request-manager`: log `error.cause` chain on transport failure (5-level WeakSet bounded).
  - `@gertsai/async-utils`: `retry` JSDoc cross-ref to thundering herd Sprint 3.9 Amendment 1.2.7 default `'full'` jitter rationale.

  Refs ADR-010 §A + Amendment 1 §A1.2 (wrapUnknownError allow-list) + §A1.3 (redactDetails deep-scan).

- Updated dependencies [0755c6d]
- Updated dependencies [782a3e0]
- Updated dependencies [782a3e0]
- Updated dependencies [c19e12a]
- Updated dependencies [c19e12a]
- Updated dependencies [6debc97]
- Updated dependencies [6debc97]
- Updated dependencies [6debc97]
- Updated dependencies [121cb7b]
- Updated dependencies [121cb7b]
  - @gertsai/di@0.2.0
  - @gertsai/errors@0.2.0
  - @gertsai/tenant-resolver@1.0.0
  - @gertsai/session@1.0.0
  - @gertsai/session-guard@1.0.0

## 0.1.0

Initial release. Per-request composition root with lazy getters and freeze invariant.
