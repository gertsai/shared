// SPDX-License-Identifier: Apache-2.0
/**
 * m9s-example HTTP-boundary error scrubber — Wave 8.3.
 *
 * This module belongs to the composition layer: it wires the canonical
 * `@gertsai/errors/http.appErrorToHttpResponse` output through a denylist
 * that strips PII / internal-topology hints before the response body
 * crosses the HTTP wire (Wave 8.2 audit Sec#3+#4, CWE-209).
 *
 * The neutral error kernel — taxonomy re-exports + `permissionDenied()`
 * factory — lives in `src/shared/errors.ts` and is the import target for
 * domain / application / infrastructure / services layers. This file is
 * intentionally minimal: only adapters that emit HTTP responses (i.e. the
 * composition root / inbound HTTP transports) should depend on it.
 *
 * @see ../shared/errors.js for the kernel (re-exports + factory).
 */
import type { AppError } from '@gertsai/errors';
import {
  appErrorToHttpResponse as _appErrorToHttpResponse,
  type ProblemDetails,
} from '@gertsai/errors/http';

export type { ProblemDetails };

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
