# @gertsai/session-guard

## 2.0.0

### Minor Changes

- 05258e5: Wave 12.D-fix Teammate D — close 7 HIGH/MED logic findings per PRD-036:

  - **FR-017 (async-utils)** — `sleep(ms, signal?)` now accepts an
    `AbortSignal` and rejects with `signal.reason` (or `Error('Sleep aborted')`)
    when aborted. `retry()` propagates its signal into the back-off sleep
    AND re-checks the signal after `await sleep()` so a mid-back-off abort
    surfaces immediately instead of completing the full delay window.
  - **FR-018 (session-guard)** — `isImpersonating(session)` is now a
    pure predicate that returns `false` for `undefined` / `null` / empty
    UUIDs (CWE-1188 fail-closed). New companion helpers added:
    `assertImpersonating(session)` (throws `DataAccessUuidMissingError` on
    empty UUIDs, plain `Error` when UUIDs equal) and
    `checkImpersonating(session)` (returns `CheckResult<{ impersonating }>`
    discriminating the three failure modes).
  - **FR-019 (runtime-context)** — `RequestContext.$setSession` now throws
    with an explicit single-middleware-invariant message (EVID-051 L-3) so
    accidental "middleware ran twice" races surface as a hard error rather
    than a silent authorisation downgrade. JSDoc on `$freeze()` documents
    the invariant.
  - **FR-020 (runtime-context)** — `DefaultFeatureContext` accepts an
    optional `FeatureContextLogger` (structural `Pick<Logger, 'warn'>`
    shape, no hard import on `@gertsai/logger-factory`). When a logger is
    configured, flag-provider exceptions are logged at `warn` level before
    defaulting to `false`. Back-compat preserved (no logger = silent).
  - **FR-021 (entity-storage)** — `set` / `update` / `delete` / `destroy` /
    `restore` / `upsert` now re-check `_destroyed` after every
    `await provider.*` and suppress the emit if the service was destroyed
    mid-operation (EVID-051 L-5). Upsert JSDoc documents the 2-RTT TOCTOU
    race and recommended mitigations (native 1-RTT fast path or
    `runTransaction`). Full transactional upsert fallback tracked for
    Wave 14 / D2.
  - **FR-011 (arch)** — `engines.node ">=22"` added to `runtime-context`
    and `entity-storage` (both use `node:crypto` / `node:events`).
    `async-utils` and `session-guard` remain Node-builtin-free.

### Patch Changes

- Updated dependencies [05258e5]
  - @gertsai/errors@0.3.0
  - @gertsai/session@2.0.0

## 1.0.0

### Minor Changes

- 121cb7b: Initial release. External invariant guards / predicates / dedicated errors for `@gertsai/session`.

  - 4 predicates: `isAuthenticated`, `hasOperatorType`, `isInTenant`, `isImpersonating`.
  - 5 assertion helpers (using TS `asserts` signature for narrowing): `assertAuthenticated`, `assertHasDataAccessUuid` (NEW per ADR-007 Amendment 1.1.2 — separate semantic for scoping fail), `assertOperatorType`, `assertSessionInTenant`, `assertNotDestroyed`.
  - 3 result-shape variants: `checkAuthenticated`, `checkOperatorType`, `checkSessionInTenant`.
  - 5 dedicated errors extending parametric `@gertsai/errors` taxonomy:
    - `AuthenticationRequiredError extends UnauthorizedError<{ reason: 'session-required' }>` — thrown by `assertAuthenticated` (per Amendment 1.1.2 — replaces incorrect throw of DataAccessUuidMissingError).
    - `DataAccessUuidMissingError extends UnauthorizedError<{ reason: 'data-access-uuid-missing' }>` — thrown by `assertHasDataAccessUuid` and `isImpersonating` per ADR-007 I-19.
    - `OperatorTypeMismatchError`, `TenantScopeViolationError`, `SessionDestroyedError`.
  - `isInTenant` returns `false` if `session.tenantId === undefined` (per ADR-007 I-18 — eliminates silent multi-tenancy bypass).
  - `isImpersonating` throws `DataAccessUuidMissingError` if either UUID empty/undefined (per ADR-007 I-19 — eliminates audit miss).

### Patch Changes

- 782a3e0: Sprint 3.10 — Shared-kernel relocation of `SessionDestroyedError` + Session $-mutator throw migration.

  **`@gertsai/errors`** (MINOR — adds new export): `SessionDestroyedError` is now defined in `@gertsai/errors/session` (relocated from `@gertsai/session-guard` per ADR-010 Amendment 1 §A1.1). It is structurally `ConflictError<{ contextField: 'session' }>` — pure taxonomy with no logic. Rationale: `@gertsai/errors` is the declared Shared Kernel for the `@gertsai/*` ecosystem (ADR-006 §D §6); relocation preserves tier discipline (Tier 1 `@gertsai/session` no longer needs to peer-depend on Tier 2 `@gertsai/session-guard`).

  **`@gertsai/session-guard`** (PATCH): local `SessionDestroyedError` class definition replaced with a re-export shim (`export { SessionDestroyedError } from '@gertsai/errors';`). **Existing import paths preserved** — published consumers see no breaking change. Single class identity guaranteed via single source (`expect(FromGuard).toBe(FromErrors)` test verifies). Other 4 errors in `session-guard/errors.ts` (AuthenticationRequiredError, DataAccessUuidMissingError, OperatorTypeMismatchError, TenantScopeViolationError) unchanged.

  **`@gertsai/session`** (PATCH): `Session.$switchOperator` and `Session.$setDataAccessUuid` now throw `SessionDestroyedError` (imported directly from `@gertsai/errors`) instead of bare `Error`. Error message preserved verbatim. Consumers checking `instanceof Error` are unaffected (chain preserved: `SessionDestroyedError → ConflictError → AppError → Error`).

  **Tier discipline preserved**: NO new peer-dependencies added on `@gertsai/session`. Existing `peerDependencies: { '@gertsai/errors': 'workspace:^' }` is the only path; `createRequire` complexity from original SPEC eliminated.

  Refs ADR-010 §C (revised) + Amendment 1 §A1.1 (SessionDestroyedError relocation, tier discipline preservation).

- Updated dependencies [782a3e0]
- Updated dependencies [782a3e0]
- Updated dependencies [c19e12a]
- Updated dependencies [6debc97]
- Updated dependencies [6debc97]
- Updated dependencies [121cb7b]
  - @gertsai/errors@0.2.0
  - @gertsai/session@1.0.0

## 0.1.0

### Minor Changes

- Initial release. External invariant guards / predicates / dedicated errors for `@gertsai/session`.

  - 4 predicates: `isAuthenticated`, `hasOperatorType`, `isInTenant`, `isImpersonating`.
  - 5 assertion helpers (using TS `asserts` signature for narrowing): `assertAuthenticated`, `assertHasDataAccessUuid`, `assertOperatorType`, `assertSessionInTenant`, `assertNotDestroyed`.
  - 3 result-shape variants: `checkAuthenticated`, `checkOperatorType`, `checkSessionInTenant`.
  - 5 dedicated errors extending `@gertsai/errors` taxonomy: `AuthenticationRequiredError`, `DataAccessUuidMissingError`, `OperatorTypeMismatchError`, `TenantScopeViolationError`, `SessionDestroyedError`.
  - `isInTenant` returns `false` if `session.tenantId === undefined` (per ADR-007 I-18).
  - `isImpersonating` throws `DataAccessUuidMissingError` if either UUID empty/undefined (per ADR-007 I-19).
