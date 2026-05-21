# @gertsai/session

## 2.0.1

### Patch Changes

- f219b2c: Wave 26 — close 5 HIGH + 3 MED EVID-080 findings across 4 packages (+ tenant-resolver test+doc).

  Solo teammate (typescript-pro). +14 tests, 0 workspace typecheck errors.

  **FR-1 (H1) session** — `Session.token` getter throws `SessionDestroyedError` (was bare `Error`). Test asserts `instanceof SessionDestroyedError` (was string-match).

  **FR-2 (H2) runtime-context** — `provider-context._lookup` refactored to `{ present, value }` discriminator. `provide(token, undefined)` now distinguishable from "not bound" — `get(token)` returns `undefined` instead of throwing `ProviderNotFoundError`. +4 tests.

  **FR-3 (H3) rpc-proxy-builder** — proxyCache nested `WeakMap<actions, WeakMap<transport, proxy>>`. Different transports sharing same actions now get distinct proxies (fixes multi-instance singleton bug per ADR-012 Wave 6.3). +2 tests.

  **FR-4 (H4) entity** — `Entity.$patch` + `EntityWithMetadata.$setMetadata` swap `for...in` → `Object.keys(input)` (skip prototype chain, prototype-pollution defense).

  **FR-5 (H5) entity** — `EntityJSON.data: Readonly<Data>` type widening (compile-time mutation rejection). `@ts-expect-error` test pins.

  **FR-6 (M1+M2) entity deep-equal** — `Object.is` for primitives (NaN equality + +0/-0 distinction) + symmetric `Object.keys` length guard. +6 tests for edge cases.

  **FR-7 (M6) tenant-resolver** — `path.strategy.ts` wildcard sentinel changed `___WILDCARD___` → `\x1FWILDCARD\x1F` (Unit-Separator control char). `split`/`join` replace instead of regex (avoids special-char interpretation). +1 test confirms literal `___WILDCARD___` segment doesn't collide.

  **FR-8 (M7) tenant-resolver** — NON_PRINTABLE JSDoc note about ASCII-only limitation (no Cyrillic/CJK/emoji/non-Latin-1).

  **Tests**: +14 new (4 runtime-context + 2 rpc-proxy-builder + 1 entity Entity + 6 entity deep-equal + 1 tenant-resolver path).

  **Behaviour clarification**:

  - FR-1: `SessionDestroyedError extends AppError extends Error` — `instanceof Error` still passes; substring matchers `'destroyed'` still pass.
  - FR-2: `get`/`getOptional` signatures unchanged. Behaviour change only for previously-broken bound-to-undefined case.
  - FR-3: Public surface unchanged. Cache identity for `(sameActions, sameTransport)` still holds.
  - FR-4/5/6/7/8: Pure correctness improvements; no API breaks.

  All bumps: patch.

  EVID-080 H closure: **5/5 HIGH closed**. 3/10 MED closed. Remaining 7 MED + 8 LOW deferred (cosmetic / out-of-scope per PRD-063).

  After Wave 25+26 all 41 packages deep-audited, 100% HIGH closure rate maintained.

  Refs: PRD-063, EVID-080 (Wave 25 audit), ADR-006/007/009/010 + ADR-012 Wave 6.3.

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
