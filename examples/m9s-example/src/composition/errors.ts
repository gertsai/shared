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

export type { ProblemDetails } from '@gertsai/errors/http';

import { AppError, ForbiddenError } from '@gertsai/errors';
import {
  appErrorToHttpResponse as _appErrorToHttpResponse,
  type ProblemDetails,
} from '@gertsai/errors/http';

/**
 * Wave 8.2 audit Sec#3+#4 — keys scrubbed from `ProblemDetails.details`
 * before crossing the HTTP boundary (CWE-209). The full payload remains
 * visible in server logs via the originating `AppError.details` and its
 * `.cause` chain, but the outbound body is shrunk to (a) avoid user
 * enumeration via 403 responses (`userId`), (b) avoid leaking internal
 * upstream hostnames over 5xx responses (`url`, `originalKind`).
 */
const HTTP_BOUNDARY_DETAILS_DENYLIST: readonly string[] = Object.freeze([
  'userId',
  'url',
  'originalKind',
] as const);

function scrubDetails(
  details: Readonly<Record<string, unknown>> | undefined,
): Readonly<Record<string, unknown>> | undefined {
  if (details === undefined) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(details)) {
    if (HTTP_BOUNDARY_DETAILS_DENYLIST.includes(k)) continue;
    out[k] = v;
  }
  return out;
}

/**
 * Wave 8.2 audit Sec#3+#4 — wraps `@gertsai/errors/http.appErrorToHttpResponse`
 * and strips PII / internal-topology hints from the outbound ProblemDetails
 * body. Server-side logs still receive the unredacted error via the original
 * `AppError`.
 */
export function appErrorToHttpResponse(
  err: AppError,
): { readonly status: number; readonly body: ProblemDetails } {
  const { status, body } = _appErrorToHttpResponse(err);
  const scrubbed = scrubDetails(body.details);
  if (scrubbed === body.details) return { status, body };
  return {
    status,
    body: {
      ...body,
      ...(scrubbed !== undefined && { details: scrubbed }),
    },
  };
}

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
