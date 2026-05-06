---
'@gertsai/session-guard': minor
---

Initial release. External invariant guards / predicates / dedicated errors for `@gertsai/session`.

- 4 predicates: `isAuthenticated`, `hasOperatorType`, `isInTenant`, `isImpersonating`.
- 5 assertion helpers (using TS `asserts` signature for narrowing): `assertAuthenticated`, `assertHasDataAccessUuid` (NEW per ADR-007 Amendment 1.1.2 — separate semantic for scoping fail), `assertOperatorType`, `assertSessionInTenant`, `assertNotDestroyed`.
- 3 result-shape variants: `checkAuthenticated`, `checkOperatorType`, `checkSessionInTenant`.
- 5 dedicated errors extending parametric `@gertsai/errors` taxonomy:
  - `AuthenticationRequiredError extends UnauthorizedError<{ reason: 'session-required' }>` — thrown by `assertAuthenticated` (per Amendment 1.1.2 — replaces incorrect throw of DataAccessUuidMissingError).
  - `DataAccessUuidMissingError extends UnauthorizedError<{ reason: 'data-access-uuid-missing' }>` — thrown by `assertHasDataAccessUuid` and `isImpersonating` per ADR-007 I-19.
  - `OperatorTypeMismatchError`, `TenantScopeViolationError`, `SessionDestroyedError`.
- `isInTenant` returns `false` if `session.tenantId === undefined` (per ADR-007 I-18 — eliminates silent multi-tenancy bypass).
- `isImpersonating` throws `DataAccessUuidMissingError` if either UUID empty/undefined (per ADR-007 I-19 — eliminates audit miss).
