// SPDX-License-Identifier: Apache-2.0
import type { Session } from '@gertsai/session';
import type { OperatorType } from '@gertsai/session';

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
 * differs from the `operatorUuid` (i.e. the operator is acting on behalf
 * of another identity).
 *
 * Pure predicate — never throws. Returns `false` when:
 *   - `session` is `undefined` / `null`
 *   - `operatorUuid` is empty / undefined
 *   - `dataAccessUuid` is empty / undefined
 *
 * Wave 12.D-fix per PRD-036 FR-018 (EVID-051 L-2): align with predicate
 * semantics (`is*`) and CWE-1188 fail-closed default. Callers that need a
 * throwing variant should use {@link assertImpersonating}; callers that
 * need a structured `CheckResult` should use {@link checkImpersonating}
 * (see `./check.ts`).
 */
export function isImpersonating(
  session: Session | undefined | null,
): boolean {
  if (session === undefined || session === null) return false;
  const operatorUuid = session.operatorUuid;
  const dataAccessUuid = session.dataAccessUuid;
  if (
    operatorUuid === undefined ||
    operatorUuid === '' ||
    dataAccessUuid === undefined ||
    dataAccessUuid === ''
  ) {
    return false;
  }
  return operatorUuid !== dataAccessUuid;
}
