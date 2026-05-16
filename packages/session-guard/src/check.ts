// SPDX-License-Identifier: Apache-2.0
import type { AppError } from '@gertsai/errors';
import type { Session } from '@gertsai/session';
import type { OperatorType } from '@gertsai/session';

import {
  AuthenticationRequiredError,
  DataAccessUuidMissingError,
  OperatorTypeMismatchError,
  TenantScopeViolationError,
} from './errors.js';
import { hasOperatorType, isAuthenticated, isInTenant } from './guards.js';

/**
 * Discriminated-union result shape for the `check*` family. Either succeeds
 * with the supplied `TOk` payload, or fails with an {@link AppError} subclass
 * matching the failure semantic.
 *
 * Use in functional code paths where throwing is awkward (validators,
 * map/filter pipelines, response builders). Pair with the assertion helpers
 * for imperative code paths.
 */
export type CheckResult<TOk> =
  | ({ readonly ok: true } & TOk)
  | { readonly ok: false; readonly error: AppError };

/**
 * Result-shape variant of {@link assertAuthenticated}. Returns a
 * {@link CheckResult} carrying the narrowed `Session` on success or an
 * {@link AuthenticationRequiredError} on failure.
 */
export function checkAuthenticated(
  session: Session | undefined | null,
): CheckResult<{ session: Session }> {
  if (!isAuthenticated(session)) {
    return {
      ok: false,
      error: new AuthenticationRequiredError({
        message: 'Session required for this operation',
        details: { reason: 'session-required' },
      }),
    };
  }
  return { ok: true, session };
}

/**
 * Result-shape variant of {@link assertOperatorType}. Returns a
 * {@link CheckResult} carrying an {@link OperatorTypeMismatchError} on
 * failure.
 */
export function checkOperatorType(
  session: Session,
  ...types: OperatorType[]
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
): CheckResult<{}> {
  if (!hasOperatorType(session, types)) {
    return {
      ok: false,
      error: new OperatorTypeMismatchError({
        message: `Operator type ${session.operatorType} not in allowed list ${types.join(', ')}`,
        details: { expected: types, actual: session.operatorType },
      }),
    };
  }
  return { ok: true };
}

/**
 * Result-shape variant of {@link assertSessionInTenant}. Returns a
 * {@link CheckResult} carrying a {@link TenantScopeViolationError} on
 * failure (including when `session.tenantId` is undefined per ADR-007 I-18).
 */
export function checkSessionInTenant(
  session: Session,
  tenantId: string,
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
): CheckResult<{}> {
  if (!isInTenant(session, tenantId)) {
    return {
      ok: false,
      error: new TenantScopeViolationError({
        message: `Session not in tenant ${tenantId}`,
        details: {
          requested: tenantId,
          sessionTenant: session.tenantId ?? '<undefined>',
        },
      }),
    };
  }
  return { ok: true };
}

/**
 * Result-shape variant of `assertImpersonating` (assertions.ts). Returns
 * a {@link CheckResult} carrying the boolean `impersonating` outcome on
 * success or a structured error on failure.
 *
 * Wave 12.D-fix per PRD-036 FR-018: structured variant of the
 * {@link isImpersonating} predicate. Distinguishes the three states the
 * predicate flattens to `false`:
 *
 *   - Session missing / destroyed → `AuthenticationRequiredError`
 *   - UUIDs missing / empty → `DataAccessUuidMissingError`
 *   - UUIDs equal → `ok: true, impersonating: false`
 *
 * Use this when the caller needs to discriminate between "not
 * impersonating" and "cannot tell" without try/catch noise.
 */
export function checkImpersonating(
  session: Session | undefined | null,
): CheckResult<{ impersonating: boolean }> {
  if (!isAuthenticated(session)) {
    return {
      ok: false,
      error: new AuthenticationRequiredError({
        message: 'Session required for this operation',
        details: { reason: 'session-required' },
      }),
    };
  }
  const operatorUuid = session.operatorUuid;
  const dataAccessUuid = session.dataAccessUuid;
  if (
    operatorUuid === undefined ||
    operatorUuid === '' ||
    dataAccessUuid === undefined ||
    dataAccessUuid === ''
  ) {
    return {
      ok: false,
      error: new DataAccessUuidMissingError({
        message:
          'Cannot determine impersonation: session operatorUuid or dataAccessUuid is empty / undefined',
        details: { reason: 'data-access-uuid-missing' },
      }),
    };
  }
  return { ok: true, impersonating: operatorUuid !== dataAccessUuid };
}
