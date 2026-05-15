# @gertsai/errors

## 0.2.0

### Minor Changes

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

- 782a3e0: Sprint 3.10 — Shared-kernel relocation of `SessionDestroyedError` + Session $-mutator throw migration.

  **`@gertsai/errors`** (MINOR — adds new export): `SessionDestroyedError` is now defined in `@gertsai/errors/session` (relocated from `@gertsai/session-guard` per ADR-010 Amendment 1 §A1.1). It is structurally `ConflictError<{ contextField: 'session' }>` — pure taxonomy with no logic. Rationale: `@gertsai/errors` is the declared Shared Kernel for the `@gertsai/*` ecosystem (ADR-006 §D §6); relocation preserves tier discipline (Tier 1 `@gertsai/session` no longer needs to peer-depend on Tier 2 `@gertsai/session-guard`).

  **`@gertsai/session-guard`** (PATCH): local `SessionDestroyedError` class definition replaced with a re-export shim (`export { SessionDestroyedError } from '@gertsai/errors';`). **Existing import paths preserved** — published consumers see no breaking change. Single class identity guaranteed via single source (`expect(FromGuard).toBe(FromErrors)` test verifies). Other 4 errors in `session-guard/errors.ts` (AuthenticationRequiredError, DataAccessUuidMissingError, OperatorTypeMismatchError, TenantScopeViolationError) unchanged.

  **`@gertsai/session`** (PATCH): `Session.$switchOperator` and `Session.$setDataAccessUuid` now throw `SessionDestroyedError` (imported directly from `@gertsai/errors`) instead of bare `Error`. Error message preserved verbatim. Consumers checking `instanceof Error` are unaffected (chain preserved: `SessionDestroyedError → ConflictError → AppError → Error`).

  **Tier discipline preserved**: NO new peer-dependencies added on `@gertsai/session`. Existing `peerDependencies: { '@gertsai/errors': 'workspace:^' }` is the only path; `createRequire` complexity from original SPEC eliminated.

  Refs ADR-010 §C (revised) + Amendment 1 §A1.1 (SessionDestroyedError relocation, tier discipline preservation).

- 6debc97: Initial release. Universal error taxonomy for `@gertsai/*` ecosystem (Shared Kernel per ADR-006).

  - 10 ErrorKind values (`as const` object, NOT const enum — compatible with `isolatedModules: true`) covering RFC 9457 + canonical microservice taxonomy: VALIDATION, NOT_FOUND, UNAUTHORIZED, FORBIDDEN, CONFLICT, RATE_LIMITED, INTERNAL, UPSTREAM_FAILURE, TIMEOUT, BAD_GATEWAY.
  - `AppError<D>` generic base + 10 typed subclasses (each with narrowed `details` shape).
  - `/http` subpath: RFC 9457 ProblemDetails serialization with **bucket types** (`urn:gertsai:errors:server` collapses INTERNAL+UPSTREAM_FAILURE+BAD_GATEWAY to prevent topology leak per security review) + automatic `details` redaction (14-key list including `password`, `token`, `secret`, `apiKey`, `authorization`, `cookie`, `private_key`, `connection_string`).
  - `/grpc` subpath: gRPC status code mapping (canonical integer codes vendored as constants — NO grpc framework runtime import).
  - Helpers: `wrapUnknownError(x, kind?, correlationId?)`, `isAppError(x)`, `getUserMessage(error, locale?)`.
  - `registerErrorLocale(locale, catalog)` extension API (catalogs MUST be static / build-time only — format-string injection risk per security review).
  - `AppError.toJSON()` cause-chain cycle/depth guard (max depth 5, WeakSet cycle detection, `__truncated: { reason: 'cycle' | 'depth-exceeded' | 'non-app-error' }` markers).
  - 52 tests including adversarial fixtures (cause-cycle, cause-deep, details-redaction, bucket-type collapse).

### Patch Changes

- 121cb7b: Sprint 3.7 in-flight refactor: 10 error subclasses become parametric on `D` with default matching original shape (per ADR-007 Amendment 1.1.1).

  **Strictly additive backward-compat**: existing call sites continue to compile unchanged because default `D` preserves Sprint 3.6 shapes:

  - `class NotFoundError<D = { resourceType: string; resourceId: string }> extends AppError<D>`
  - `class UnauthorizedError<D = { reason?: string }> extends AppError<D>`
  - `class ForbiddenError<D = { resource?: string; action?: string }> extends AppError<D>`
  - `class ConflictError<D = { resource?: string; conflictWith?: string }> extends AppError<D>`
  - ... etc 6 more.

  Sprint 3.7 dedicated errors (in `@gertsai/runtime-context` and `@gertsai/session-guard`) consume parametric form:

  ```typescript
  class SessionMissingError extends NotFoundError<{
    contextField: "session";
  }> {}
  class AuthenticationRequiredError extends UnauthorizedError<{
    reason: "session-required";
  }> {}
  ```

  6 new tests added covering parametric default D + specialized D narrowing + instanceof chain + kind preservation through specialization.

## 0.1.0

Initial release. See `.changeset/sprint-3-6-errors.md` for details.
