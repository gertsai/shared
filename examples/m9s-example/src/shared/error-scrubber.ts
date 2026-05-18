// SPDX-License-Identifier: Apache-2.0
/**
 * m9s-example HTTP-boundary error scrubber — kernel sibling.
 *
 * Wave 12.E-fix-2 Phase 2 (PRD-039 FR-007 / EVID-053 H-4): hoisted from
 * `src/composition/errors.ts` so services can consume it without
 * violating the Wave 8.3 architectural rule (`no-services-to-
 * composition-errors`).
 *
 * The denylist strips PII / internal-topology hints from outbound
 * ProblemDetails bodies before they cross the HTTP wire (Wave 8.2 audit
 * Sec#3+#4, CWE-209). Server-side logs still receive the unredacted
 * error via the original `AppError`.
 *
 * `src/composition/errors.ts` continues to re-export this function for
 * backwards compatibility with composition-layer consumers.
 */
import type { AppError } from '@gertsai/errors';
import {
  appErrorToHttpResponse as _appErrorToHttpResponse,
  type ProblemDetails,
} from '@gertsai/errors/http';

export type { ProblemDetails };

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
 * Wraps `@gertsai/errors/http.appErrorToHttpResponse` and strips PII /
 * internal-topology hints from the outbound ProblemDetails body.
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
