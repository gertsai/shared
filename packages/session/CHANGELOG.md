# @gertsai/session

## 2.0.0

### Patch Changes

- Updated dependencies [05258e5]
  - @gertsai/errors@0.3.0

## 1.0.0

### Minor Changes

- c19e12a: Initial release of `@gertsai/session` — backend-agnostic Session class with operator + dataAccess identity scoping. AbstractDialog interface, OperatorType union (web/ios/android/electron/api/ai/bot/mcp/system), tokenGetter callback, $switchOperator for impersonation flows. Mirrors Orchestra OrchestraSession patterns 1:1 with Vue/Orchestra-DI dependencies stripped per ADR-005. Per PRD-002 FR-W4-004..006.
- 6debc97: Additive multi-tenant scoping (tenantId / projectId / spaceId).

  **Migration from previous version → this minor**: Strictly additive — existing constructor + getters + methods preserved verbatim. Existing tests pass without changes.

  - New optional `SessionOpts` fields: `tenantId?`, `projectId?`, `spaceId?` (all `string | undefined`).
  - New read-only getters: `tenantId`, `projectId`, `spaceId` (return `string | undefined`, NOT `string | null` for consistency with TS optional-field idiom).
  - New strict helpers:
    - `getTenantStrict()` throws `UnauthorizedError` from `@gertsai/errors` (multi-tenancy = authentication boundary per ADR-006 I-16).
    - `getProjectStrict()` and `getSpaceStrict()` throw `ValidationError` (missing scope = invalid input, not unauthenticated).
  - Scope fields are **flat tags** — no enforced `space ⊂ project ⊂ tenant` hierarchy per ADR-006 I-17. Hierarchy validation (if needed) lives in Sprint 3.7 RuntimeContext middleware (consumer opt-in).
  - New peer-dep: `@gertsai/errors` (used only by `*Strict` helpers).
  - 13 new tests in dedicated `__tests__/scoping.test.ts` (split from `Session.test.ts` per Amendment 1.5). Existing 16 tests in `src/Session.test.ts` untouched + green.

### Patch Changes

- 782a3e0: Sprint 3.10 — Shared-kernel relocation of `SessionDestroyedError` + Session $-mutator throw migration.

  **`@gertsai/errors`** (MINOR — adds new export): `SessionDestroyedError` is now defined in `@gertsai/errors/session` (relocated from `@gertsai/session-guard` per ADR-010 Amendment 1 §A1.1). It is structurally `ConflictError<{ contextField: 'session' }>` — pure taxonomy with no logic. Rationale: `@gertsai/errors` is the declared Shared Kernel for the `@gertsai/*` ecosystem (ADR-006 §D §6); relocation preserves tier discipline (Tier 1 `@gertsai/session` no longer needs to peer-depend on Tier 2 `@gertsai/session-guard`).

  **`@gertsai/session-guard`** (PATCH): local `SessionDestroyedError` class definition replaced with a re-export shim (`export { SessionDestroyedError } from '@gertsai/errors';`). **Existing import paths preserved** — published consumers see no breaking change. Single class identity guaranteed via single source (`expect(FromGuard).toBe(FromErrors)` test verifies). Other 4 errors in `session-guard/errors.ts` (AuthenticationRequiredError, DataAccessUuidMissingError, OperatorTypeMismatchError, TenantScopeViolationError) unchanged.

  **`@gertsai/session`** (PATCH): `Session.$switchOperator` and `Session.$setDataAccessUuid` now throw `SessionDestroyedError` (imported directly from `@gertsai/errors`) instead of bare `Error`. Error message preserved verbatim. Consumers checking `instanceof Error` are unaffected (chain preserved: `SessionDestroyedError → ConflictError → AppError → Error`).

  **Tier discipline preserved**: NO new peer-dependencies added on `@gertsai/session`. Existing `peerDependencies: { '@gertsai/errors': 'workspace:^' }` is the only path; `createRequire` complexity from original SPEC eliminated.

  Refs ADR-010 §C (revised) + Amendment 1 §A1.1 (SessionDestroyedError relocation, tier discipline preservation).

- Updated dependencies [782a3e0]
- Updated dependencies [782a3e0]
- Updated dependencies [6debc97]
- Updated dependencies [121cb7b]
  - @gertsai/errors@0.2.0
