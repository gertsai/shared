---
'@gertsai/errors': minor
'@gertsai/session': patch
'@gertsai/session-guard': patch
---

Sprint 3.10 — Shared-kernel relocation of `SessionDestroyedError` + Session $-mutator throw migration.

**`@gertsai/errors`** (MINOR — adds new export): `SessionDestroyedError` is now defined in `@gertsai/errors/session` (relocated from `@gertsai/session-guard` per ADR-010 Amendment 1 §A1.1). It is structurally `ConflictError<{ contextField: 'session' }>` — pure taxonomy with no logic. Rationale: `@gertsai/errors` is the declared Shared Kernel for the `@gertsai/*` ecosystem (ADR-006 §D §6); relocation preserves tier discipline (Tier 1 `@gertsai/session` no longer needs to peer-depend on Tier 2 `@gertsai/session-guard`).

**`@gertsai/session-guard`** (PATCH): local `SessionDestroyedError` class definition replaced with a re-export shim (`export { SessionDestroyedError } from '@gertsai/errors';`). **Existing import paths preserved** — published consumers see no breaking change. Single class identity guaranteed via single source (`expect(FromGuard).toBe(FromErrors)` test verifies). Other 4 errors in `session-guard/errors.ts` (AuthenticationRequiredError, DataAccessUuidMissingError, OperatorTypeMismatchError, TenantScopeViolationError) unchanged.

**`@gertsai/session`** (PATCH): `Session.$switchOperator` and `Session.$setDataAccessUuid` now throw `SessionDestroyedError` (imported directly from `@gertsai/errors`) instead of bare `Error`. Error message preserved verbatim. Consumers checking `instanceof Error` are unaffected (chain preserved: `SessionDestroyedError → ConflictError → AppError → Error`).

**Tier discipline preserved**: NO new peer-dependencies added on `@gertsai/session`. Existing `peerDependencies: { '@gertsai/errors': 'workspace:^' }` is the only path; `createRequire` complexity from original SPEC eliminated.

Refs ADR-010 §C (revised) + Amendment 1 §A1.1 (SessionDestroyedError relocation, tier discipline preservation).
