// SPDX-License-Identifier: Apache-2.0
import type { Session } from '@gertsai/session';
import type { OperatorType } from '@gertsai/session';

import {
  AuthenticationRequiredError,
  DataAccessUuidMissingError,
  OperatorTypeMismatchError,
  SessionDestroyedError,
  TenantScopeViolationError,
} from './errors.js';
import { hasOperatorType, isAuthenticated, isInTenant } from './guards.js';

/**
 * Asserts that `session` is a defined, non-destroyed Session instance.
 *
 * Per ADR-007 Amendment 1.1.2: throws {@link AuthenticationRequiredError}
 * (NOT `DataAccessUuidMissingError` — that error is reserved for scoping
 * failures on an otherwise-valid session).
 *
 * Uses TS `asserts` signature so callers can rely on TypeScript control-flow
 * narrowing after the call.
 *
 * @throws AuthenticationRequiredError when `session` is undefined / null /
 *   destroyed.
 */
export function assertAuthenticated(
  session: Session | undefined | null,
): asserts session is Session {
  if (!isAuthenticated(session)) {
    throw new AuthenticationRequiredError({
      message: 'Session required for this operation',
      details: { reason: 'session-required' },
    });
  }
}

/**
 * Asserts that the session has a non-empty `dataAccessUuid` scope set.
 *
 * Per ADR-007 Amendment 1.1.2: separate semantic from
 * {@link assertAuthenticated} — this check fires on a *scoping* gap, not an
 * identity gap.
 *
 * @throws DataAccessUuidMissingError when `dataAccessUuid` is empty / undefined.
 */
export function assertHasDataAccessUuid(session: Session): void {
  if (!session.dataAccessUuid || session.dataAccessUuid === '') {
    throw new DataAccessUuidMissingError({
      message: 'Session has no dataAccessUuid scope',
      details: { reason: 'data-access-uuid-missing' },
    });
  }
}

/**
 * Asserts that the session's `operatorType` matches one of the supplied
 * allowed types.
 *
 * @throws OperatorTypeMismatchError when the actual type is not in the
 *   allowed list. Error `details.expected` carries the allow-list and
 *   `details.actual` the offending type.
 */
export function assertOperatorType(
  session: Session,
  ...types: OperatorType[]
): void {
  if (!hasOperatorType(session, types)) {
    throw new OperatorTypeMismatchError({
      message: `Operator type ${session.operatorType} not in allowed list ${types.join(', ')}`,
      details: { expected: types, actual: session.operatorType },
    });
  }
}

/**
 * Asserts that the session's `tenantId` matches the requested tenant.
 *
 * Per ADR-007 I-18: a session whose `tenantId` is undefined is rejected
 * regardless of the requested value (no implicit-undefined cross-tenant
 * bypass).
 *
 * @throws TenantScopeViolationError when `session.tenantId !== tenantId` or
 *   when `session.tenantId` is undefined.
 */
export function assertSessionInTenant(
  session: Session,
  tenantId: string,
): void {
  if (!isInTenant(session, tenantId)) {
    throw new TenantScopeViolationError({
      message: `Session not in tenant ${tenantId}`,
      details: {
        requested: tenantId,
        sessionTenant: session.tenantId ?? '<undefined>',
      },
    });
  }
}

/**
 * Asserts that the session has not been destroyed.
 *
 * @throws SessionDestroyedError when `session.destroyed === true`.
 */
export function assertNotDestroyed(session: Session): void {
  if (session.destroyed) {
    throw new SessionDestroyedError({
      message: 'Session is destroyed',
      details: { contextField: 'session' },
    });
  }
}

/**
 * Asserts that the session represents an impersonation (i.e.
 * `dataAccessUuid` is set and differs from `operatorUuid`).
 *
 * Wave 12.D-fix per PRD-036 FR-018: throwing companion to the
 * non-throwing {@link isImpersonating} predicate. Use this from
 * imperative code that wants a structured error when the UUIDs are
 * missing or when the session is not actually impersonating.
 *
 * @throws DataAccessUuidMissingError when `operatorUuid` or
 *   `dataAccessUuid` is empty / undefined.
 * @throws Error when both UUIDs are present but equal (no impersonation
 *   in progress) — distinguishable by message.
 */
export function assertImpersonating(session: Session): void {
  const operatorUuid = session.operatorUuid;
  const dataAccessUuid = session.dataAccessUuid;
  if (
    operatorUuid === undefined ||
    operatorUuid === '' ||
    dataAccessUuid === undefined ||
    dataAccessUuid === ''
  ) {
    throw new DataAccessUuidMissingError({
      message:
        'Cannot determine impersonation: session operatorUuid or dataAccessUuid is empty / undefined',
      details: { reason: 'data-access-uuid-missing' },
    });
  }
  if (operatorUuid === dataAccessUuid) {
    throw new Error(
      'Session is not impersonating: operatorUuid === dataAccessUuid',
    );
  }
}
