// SPDX-License-Identifier: Apache-2.0
import type { Session } from '@gertsai/session';
import type { OperatorType } from '@gertsai/session';

import { DataAccessUuidMissingError } from './errors.js';

/**
 * Type-predicate guard. Returns `true` when `session` is a defined, non-null
 * Session instance that has not been destroyed. Narrows `Session | undefined
 * | null` to `Session` in TypeScript control-flow analysis.
 *
 * Pure read — does not throw.
 */
export function isAuthenticated(
  session: Session | undefined | null,
): session is Session {
  return session !== undefined && session !== null && !session.destroyed;
}

/**
 * Returns `true` when the session's operator type matches the supplied value
 * (or is included in the supplied list when an array is passed).
 *
 * Purely structural — does not throw and does not consult the destroyed flag.
 * Combine with {@link isAuthenticated} or {@link assertNotDestroyed} when a
 * lifecycle precondition is also required.
 */
export function hasOperatorType(
  session: Session,
  type: OperatorType | OperatorType[],
): boolean {
  if (Array.isArray(type)) {
    return type.includes(session.operatorType);
  }
  return session.operatorType === type;
}

/**
 * Returns `true` when the session's `tenantId` matches the supplied value.
 *
 * Per ADR-007 I-18: when `session.tenantId === undefined`, returns `false`
 * regardless of the `tenantId` argument. This prevents silent cross-tenant
 * leak when both sides happen to be undefined under strict equality.
 */
export function isInTenant(session: Session, tenantId: string): boolean {
  if (session.tenantId === undefined) return false;
  return session.tenantId === tenantId;
}

/**
 * Returns `true` when the session's `dataAccessUuid` is non-empty AND
 * differs from the `operatorUuid` (i.e. the operator is acting on behalf of
 * another identity).
 *
 * Per ADR-007 I-19: throws {@link DataAccessUuidMissingError} if either
 * `operatorUuid` or `dataAccessUuid` is empty / undefined. This prevents the
 * audit-miss case where both UUIDs are empty and a naive inequality check
 * would falsely return `false`.
 *
 * @throws DataAccessUuidMissingError when either UUID is empty / undefined.
 */
export function isImpersonating(session: Session): boolean {
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
  return operatorUuid !== dataAccessUuid;
}
