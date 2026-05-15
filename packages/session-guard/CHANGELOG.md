# @gertsai/session-guard

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
