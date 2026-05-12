// SPDX-License-Identifier: Apache-2.0
/**
 * m9s-example error helpers — Wave 8.1.
 *
 * Thin facade over `@gertsai/errors` canonical taxonomy. Replaces the
 * legacy custom `PermissionDeniedError` class deleted in Wave 8.1.
 *
 * Adopters in m9s-example MUST import error subclasses from this module
 * (not from `@gertsai/errors` directly) so the example presents one
 * canonical surface. This keeps inbound adapters (Moleculer actions /
 * BullMQ workers) one import away from the entire taxonomy.
 *
 * Usage:
 *   import { permissionDenied, ForbiddenError, ErrorKind } from '../composition/errors.js';
 *
 *   // Throw:
 *   throw permissionDenied(userId, 'ingest', docId);
 *
 *   // Catch (either form works):
 *   if (err instanceof ForbiddenError) { ... }
 *   if (isAppError(err) && err.kind === ErrorKind.FORBIDDEN) { ... }
 *
 *   // HTTP boundary:
 *   const { status, body } = appErrorToHttpResponse(err);
 *   // body is RFC 9457 ProblemDetails (status 403, type 'urn:gertsai:errors:permission')
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

export {
  appErrorToHttpResponse,
  type ProblemDetails,
} from '@gertsai/errors/http';

import { ForbiddenError } from '@gertsai/errors';

/**
 * Build a `ForbiddenError` that preserves the legacy `PermissionDeniedError`
 * message + details shape. Used by application use cases when the
 * `IPermissionGate` rejects an action.
 *
 * Produces:
 *   kind:    ErrorKind.FORBIDDEN
 *   message: `User '<userId>' is not allowed to '<action>' on '<resource>'`
 *   details: { userId, action, resource }
 *
 * HTTP boundary: `appErrorToHttpResponse` yields status 403,
 * type `urn:gertsai:errors:permission`.
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
