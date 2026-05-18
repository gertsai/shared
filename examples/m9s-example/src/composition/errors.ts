// SPDX-License-Identifier: Apache-2.0
/**
 * m9s-example HTTP-boundary error scrubber — composition-layer re-export.
 *
 * Wave 12.E-fix-2 Phase 2 (PRD-039 FR-007 / EVID-053 H-4): the actual
 * scrubber implementation lives in `src/shared/error-scrubber.ts` so
 * services can consume it without tripping the Wave 8.3
 * `no-services-to-composition-errors` dep-cruiser rule. This file
 * remains as a thin re-export for backwards compatibility with any
 * composition-layer consumer that already imports from here.
 */
export {
  appErrorToHttpResponse,
  type ProblemDetails,
} from '../shared/error-scrubber';
