---
'@gertsai/errors': patch
---

Sprint 3.7 in-flight refactor: 10 error subclasses become parametric on `D` with default matching original shape (per ADR-007 Amendment 1.1.1).

**Strictly additive backward-compat**: existing call sites continue to compile unchanged because default `D` preserves Sprint 3.6 shapes:
- `class NotFoundError<D = { resourceType: string; resourceId: string }> extends AppError<D>`
- `class UnauthorizedError<D = { reason?: string }> extends AppError<D>`
- `class ForbiddenError<D = { resource?: string; action?: string }> extends AppError<D>`
- `class ConflictError<D = { resource?: string; conflictWith?: string }> extends AppError<D>`
- ... etc 6 more.

Sprint 3.7 dedicated errors (in `@gertsai/runtime-context` and `@gertsai/session-guard`) consume parametric form:

```typescript
class SessionMissingError extends NotFoundError<{ contextField: 'session' }> {}
class AuthenticationRequiredError extends UnauthorizedError<{ reason: 'session-required' }> {}
```

6 new tests added covering parametric default D + specialized D narrowing + instanceof chain + kind preservation through specialization.
