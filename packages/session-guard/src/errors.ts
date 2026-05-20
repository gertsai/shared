// SPDX-License-Identifier: Apache-2.0
import { ConflictError, ForbiddenError, UnauthorizedError } from '@gertsai/errors';

/**
 * Re-exported from `@gertsai/errors` per ADR-010 Amendment 1 §A1.1
 * (Shared Kernel relocation). Single class identity is preserved across
 * both import paths so `instanceof` works regardless of which surface a
 * consumer imported from.
 */
export { SessionDestroyedError } from '@gertsai/errors';

/**
 * Thrown when a guarded operation requires an authenticated session but none
 * was provided (or the session was destroyed). Distinct from
 * {@link DataAccessUuidMissingError} — that error signals a *scoping* failure
 * on an otherwise-valid session.
 *
 * Per ADR-007 Amendment 1.1.2: identity-vs-scoping split. Thrown by
 * {@link assertAuthenticated} and {@link checkAuthenticated}.
 */
export class AuthenticationRequiredError extends UnauthorizedError<{
  reason: 'session-required';
}> {}

/**
 * Thrown when a session is present but its `dataAccessUuid` is unset / empty,
 * blocking any data-access path that requires explicit scoping.
 *
 * Per ADR-007 I-19 + Amendment 1.1.2 — separate semantic from
 * {@link AuthenticationRequiredError}. Thrown by {@link assertHasDataAccessUuid}
 * and by {@link isImpersonating} when invoked with malformed UUIDs.
 */
export class DataAccessUuidMissingError extends UnauthorizedError<{
  reason: 'data-access-uuid-missing';
}> {}

/**
 * Thrown when the session's `operatorType` is not in the caller-supplied
 * allow-list. Reuses {@link ForbiddenError} taxonomy (HTTP 403 / gRPC
 * PERMISSION_DENIED).
 */
export class OperatorTypeMismatchError extends ForbiddenError<{
  expected: readonly string[];
  actual: string;
}> {}

/**
 * Thrown when a session is scoped to a different tenant than the requested
 * one (or has no tenant at all — per ADR-007 I-18).
 */
export class TenantScopeViolationError extends ForbiddenError<{
  requested: string;
  sessionTenant: string;
}> {}

/**
 * Thrown by {@link assertImpersonating} when both UUIDs are present and
 * non-empty but equal — i.e. the session is *not* currently impersonating
 * another identity. Distinct from {@link DataAccessUuidMissingError}
 * (malformed / missing UUIDs) so callers can branch on the concrete kind.
 *
 * Wave 24 EVID-078 MED-6 closure: replaces the previous bare `Error` that
 * fell through the AppError taxonomy mappers
 * (`appErrorToHttpResponse` / `appErrorToGrpcStatus`) to a generic 500.
 * Reuses {@link ConflictError} so wire-format mapping lands on HTTP 409 /
 * gRPC `FAILED_PRECONDITION` — semantically "the session state is valid
 * but not in the configuration the caller required".
 */
export class NotImpersonatingError extends ConflictError<{
  operatorUuid: string;
}> {}
