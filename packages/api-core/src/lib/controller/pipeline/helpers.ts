// SPDX-License-Identifier: Apache-2.0
/**
 * Pipeline helper re-exports.
 *
 * Wave 27 (PRD-065 / RFC-027 PR-3): Exposes the `respond` helper that lives
 * in ApiController.class.ts for use by stage files, avoiding a circular
 * import from stages → ApiController.
 *
 * The `respond` function is a pure helper with no dependency on ApiController
 * state, so extracting its definition here is safe.
 */

import type { ResponseCode } from '../../apiResponse';

/**
 * Helper to build a typed action handler response envelope.
 *
 * PRESERVED VERBATIM from ApiController.class.ts:76-80.
 *
 * Used by action handlers via `deps.respond(data, message, code)` in Stage 8.
 */
export const respond = <C>(data: C, message?: string, code?: ResponseCode) => ({
  data,
  code,
  message,
});
