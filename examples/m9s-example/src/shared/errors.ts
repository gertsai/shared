// SPDX-License-Identifier: Apache-2.0
/**
 * m9s-example error kernel — Wave 8.3 (audit Arch#1 closure).
 *
 * Pure-data re-exports + the `permissionDenied()` factory. This module is
 * the neutral kernel: domain, application, infrastructure, and services
 * layers MAY all import from here. The companion `composition/errors.ts`
 * remains in the composition layer because it is HTTP-boundary wiring
 * (scrubs PII before responses cross the wire).
 *
 * Migration from Wave 8.1: this file was previously `composition/errors.ts`.
 * It moved to `shared/` after the audit (EVID-029) flagged
 * `application/ → composition/` as inverted hex direction.
 *
 * @see ../composition/errors.js for the HTTP-boundary scrubber
 */
export {
  AppError,
  ErrorKind,
  ForbiddenError,
  UnauthorizedError,
  ValidationError,
  RateLimitedError,
  TimeoutError,
  UpstreamFailureError,
  BadGatewayError,
  InternalError,
  isAppError,
  wrapUnknownError,
} from '@gertsai/errors';

import { ForbiddenError } from '@gertsai/errors';

/**
 * Build a `ForbiddenError` that preserves the legacy `PermissionDeniedError`
 * message + details shape. Used by application use cases when the
 * `IPermissionGate` rejects an action. See Wave 8.1 migration notes in
 * the m9s-example README for usage patterns.
 */
export function permissionDenied(
  userId: string,
  action: string,
  resource: string,
): ForbiddenError<{ userId: string; action: string; resource: string }> {
  return new ForbiddenError<{ userId: string; action: string; resource: string }>({
    message: `User '${userId}' is not allowed to '${action}' on '${resource}'`,
    details: { userId, action, resource },
  });
}
