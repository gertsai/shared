---
'@gertsai/session': minor
---

Additive multi-tenant scoping (tenantId / projectId / spaceId).

**Migration from previous version → this minor**: Strictly additive — existing constructor + getters + methods preserved verbatim. Existing tests pass without changes.

- New optional `SessionOpts` fields: `tenantId?`, `projectId?`, `spaceId?` (all `string | undefined`).
- New read-only getters: `tenantId`, `projectId`, `spaceId` (return `string | undefined`, NOT `string | null` for consistency with TS optional-field idiom).
- New strict helpers:
  - `getTenantStrict()` throws `UnauthorizedError` from `@gertsai/errors` (multi-tenancy = authentication boundary per ADR-006 I-16).
  - `getProjectStrict()` and `getSpaceStrict()` throw `ValidationError` (missing scope = invalid input, not unauthenticated).
- Scope fields are **flat tags** — no enforced `space ⊂ project ⊂ tenant` hierarchy per ADR-006 I-17. Hierarchy validation (if needed) lives in Sprint 3.7 RuntimeContext middleware (consumer opt-in).
- New peer-dep: `@gertsai/errors` (used only by `*Strict` helpers).
- 13 new tests in dedicated `__tests__/scoping.test.ts` (split from `Session.test.ts` per Amendment 1.5). Existing 16 tests in `src/Session.test.ts` untouched + green.
