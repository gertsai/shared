# @gertsai/session-guard

## 0.1.0

### Minor Changes

- Initial release. External invariant guards / predicates / dedicated errors for `@gertsai/session`.

  - 4 predicates: `isAuthenticated`, `hasOperatorType`, `isInTenant`, `isImpersonating`.
  - 5 assertion helpers (using TS `asserts` signature for narrowing): `assertAuthenticated`, `assertHasDataAccessUuid`, `assertOperatorType`, `assertSessionInTenant`, `assertNotDestroyed`.
  - 3 result-shape variants: `checkAuthenticated`, `checkOperatorType`, `checkSessionInTenant`.
  - 5 dedicated errors extending `@gertsai/errors` taxonomy: `AuthenticationRequiredError`, `DataAccessUuidMissingError`, `OperatorTypeMismatchError`, `TenantScopeViolationError`, `SessionDestroyedError`.
  - `isInTenant` returns `false` if `session.tenantId === undefined` (per ADR-007 I-18).
  - `isImpersonating` throws `DataAccessUuidMissingError` if either UUID empty/undefined (per ADR-007 I-19).
