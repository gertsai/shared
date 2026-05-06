# @gertsai/session-guard

External invariant guards for [`@gertsai/session`](../session/README.md):
predicates, TypeScript-narrowing assertions, result-shape variants, and a
small set of dedicated errors built on the
[`@gertsai/errors`](../errors/README.md) taxonomy. Implements ADR-007
Decision B (Wave 5 Phase 2) — including invariants I-5..I-7, I-13, I-18, I-19.

The package keeps the lifecycle / mutation surface of `@gertsai/session`
small (`Session` itself only has the `$switchOperator` / `$setDataAccessUuid`
/ `$destroy` mutators). All *external* invariants — "is this session
authenticated?", "is the operator allowed?", "is the tenant in scope?" —
live here, so consumers can choose between three styles per call site:
imperative assertion, type-predicate guard, or functional result shape.

## Install

```bash
pnpm add @gertsai/session-guard @gertsai/session @gertsai/errors
```

`@gertsai/session` and `@gertsai/errors` are declared as peer dependencies —
they MUST be the same workspace versions used elsewhere in your application.

## Quickstart

### Guard at an API boundary (imperative)

```ts
import { Session } from '@gertsai/session';
import { assertAuthenticated, assertSessionInTenant } from '@gertsai/session-guard';

function listInvoices(session: Session | undefined, tenantId: string) {
  assertAuthenticated(session);     // narrows to Session
  assertSessionInTenant(session, tenantId);
  return repo.listFor(session.dataAccessUuid, tenantId);
}
```

### Guard inside a repository (assertion + type-predicate)

```ts
import { Session } from '@gertsai/session';
import {
  assertHasDataAccessUuid,
  assertNotDestroyed,
  isImpersonating,
} from '@gertsai/session-guard';

class InvoiceRepository {
  load(id: string, session: Session) {
    assertNotDestroyed(session);
    assertHasDataAccessUuid(session);
    const auditNote = isImpersonating(session)
      ? `acting=${session.operatorUuid} on behalf of ${session.dataAccessUuid}`
      : `acting=${session.operatorUuid}`;
    return this.db.findInvoice(id, session.dataAccessUuid, auditNote);
  }
}
```

### Functional pipeline (result shape)

```ts
import { checkAuthenticated, checkSessionInTenant } from '@gertsai/session-guard';

function buildResponse(session, tenantId) {
  const auth = checkAuthenticated(session);
  if (!auth.ok) return { status: 401, body: auth.error.toJSON() };

  const tenant = checkSessionInTenant(auth.session, tenantId);
  if (!tenant.ok) return { status: 403, body: tenant.error.toJSON() };

  return { status: 200, body: render(auth.session) };
}
```

## API

### Predicates

| Export | Signature | Throws |
|---|---|---|
| `isAuthenticated` | `(session: Session \| undefined \| null) => session is Session` | — |
| `hasOperatorType` | `(session: Session, type: OperatorType \| OperatorType[]) => boolean` | — |
| `isInTenant` | `(session: Session, tenantId: string) => boolean` | — |
| `isImpersonating` | `(session: Session) => boolean` | `DataAccessUuidMissingError` (per ADR-007 I-19) |

### Assertions (TypeScript `asserts` signature where applicable)

| Export | Signature | Throws |
|---|---|---|
| `assertAuthenticated` | `(session: Session \| undefined \| null) => asserts session is Session` | `AuthenticationRequiredError` |
| `assertHasDataAccessUuid` | `(session: Session) => void` | `DataAccessUuidMissingError` |
| `assertOperatorType` | `(session: Session, ...types: OperatorType[]) => void` | `OperatorTypeMismatchError` |
| `assertSessionInTenant` | `(session: Session, tenantId: string) => void` | `TenantScopeViolationError` |
| `assertNotDestroyed` | `(session: Session) => void` | `SessionDestroyedError` |

### Result-shape variants

| Export | Signature | Failure error |
|---|---|---|
| `checkAuthenticated` | `(session: Session \| undefined \| null) => CheckResult<{ session: Session }>` | `AuthenticationRequiredError` |
| `checkOperatorType` | `(session: Session, ...types: OperatorType[]) => CheckResult<{}>` | `OperatorTypeMismatchError` |
| `checkSessionInTenant` | `(session: Session, tenantId: string) => CheckResult<{}>` | `TenantScopeViolationError` |

`CheckResult<TOk>` is a discriminated union:

```ts
type CheckResult<TOk> =
  | ({ readonly ok: true } & TOk)
  | { readonly ok: false; readonly error: AppError };
```

### Errors

All five extend `@gertsai/errors` taxonomy parents (parametric per Sprint 3.7
errors patch). Each preserves its parent's `kind` so wire-format mappers
(`appErrorToHttpResponse`, `appErrorToGrpcStatus`) work without registration.

| Error | Parent | `kind` |
|---|---|---|
| `AuthenticationRequiredError` | `UnauthorizedError<{ reason: 'session-required' }>` | `UNAUTHORIZED` |
| `DataAccessUuidMissingError` | `UnauthorizedError<{ reason: 'data-access-uuid-missing' }>` | `UNAUTHORIZED` |
| `OperatorTypeMismatchError` | `ForbiddenError<{ expected: readonly string[]; actual: string }>` | `FORBIDDEN` |
| `TenantScopeViolationError` | `ForbiddenError<{ requested: string; sessionTenant: string }>` | `FORBIDDEN` |
| `SessionDestroyedError` | `ConflictError<{ contextField: 'session' }>` | `CONFLICT` |

## Security

- **Assertion vs. check semantics.** `assert*` helpers throw an `AppError`
  subclass on failure; `check*` helpers return a discriminated `CheckResult`
  carrying the same `AppError` via `result.error`. Both paths use the
  same taxonomy, so HTTP / gRPC mapping is uniform regardless of which
  style a particular call site picks. Pick whichever fits the surrounding
  control flow — never invent a third local convention.

- **`AuthenticationRequiredError` ≠ `DataAccessUuidMissingError`** (per
  ADR-007 Amendment 1.1.2). The former signals a *missing identity*
  (no session at all, or destroyed). The latter signals a *missing scope*
  on an otherwise-valid session. Mixing the two — for example, having
  `assertAuthenticated` throw the scoping error — would let callers grant
  data access to unauthenticated requests when a generic catch handler
  treats both as "user must log in". Keep them distinct.

- **Tenant scope (ADR-007 I-18).** `isInTenant` / `assertSessionInTenant` /
  `checkSessionInTenant` always return `false` (or throw) when
  `session.tenantId === undefined`, regardless of the requested tenant id.
  This blocks the silent cross-tenant bypass where both arguments happen
  to be undefined under naive `===` equality.

- **Impersonation post-condition (ADR-007 I-13 + I-19).** `isImpersonating`
  throws `DataAccessUuidMissingError` if either `operatorUuid` or
  `dataAccessUuid` is empty / undefined. Audit logs that gate on a `false`
  return from a naive equality check would otherwise miss the case where
  both UUIDs are blank — the worst possible defaulting behaviour for an
  audit trail.

- **Wire redaction.** All five errors inherit `@gertsai/errors` HTTP / gRPC
  mappers. `details` keys matching the central `REDACTION_KEYS` list are
  stripped on the wire. The fields used by this package
  (`reason`, `expected`, `actual`, `requested`, `sessionTenant`,
  `contextField`) are intentionally non-secret — they describe access
  decisions, not credentials.

## Divergence note

Internal `Session` mutators (`$switchOperator`, `$setDataAccessUuid`) throw
bare `new Error('Session destroyed')` rather than `SessionDestroyedError`.
This divergence is documented in ADR-007 Amendment 1.2.8 (architect P1-3)
and intentionally deferred to Sprint 3.7.x — touching Session internals is
outside this sprint's scope. Callers who need consistent error taxonomy
should call `assertNotDestroyed(session)` before invoking the mutator.

## Cross-references

- [ADR-007 — RuntimeContext design + Wave 5 Phase 2 placement (session-guard, audit-primitives)](../../.forgeplan/adrs/ADR-007-runtimecontext-design-wave-5-phase-2-extraction-policy-session-guard-audit-primitives-placement.md)
- [PRD-003 — Wave 5 errors / runtime-context / framework adapters](../../.forgeplan/prds/PRD-003-wave-5-errors-runtime-context-framework-adapters-developer-experience-foundation.md)

## License

Apache-2.0. The `LICENSE` file is a symlink to the repository root.
