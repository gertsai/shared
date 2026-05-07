// SPDX-License-Identifier: Apache-2.0
// Originally inspired by Orchestra orchlab/core/src/timestamp.ts (Apache 2.0).
//
// Sprint 3.7 Amendment 1.1.4 (ADR-007): Timestamp helpers moved upstream to
// @gertsai/audit-primitives (Tier 2 pure data layer, zero internal deps).
// This file re-exports from the upstream package for backward compat.
// New code SHOULD import directly from @gertsai/audit-primitives.

import type { Timestamp } from './types';

/**
 * Pluggable clock. Builders accept this via `BuilderOpts.timestampProvider`
 * so tests can pin time deterministically and consumers can route through
 * Firestore's `serverTimestamp()` (or any other source) when desired.
 *
 * @see {@link "@gertsai/audit-primitives".TimestampProvider} (canonical home)
 */
export { type TimestampProvider } from '@gertsai/audit-primitives';

/**
 * Default provider — reads `Date.now()` and decomposes it into the
 * `{ seconds, nanoseconds }` shape. Wall-clock precision.
 *
 * @deprecated Sprint 3.7: prefer `dateTimestampProvider` from
 * `@gertsai/audit-primitives`. This export is kept as a backward-compat alias.
 */
export { dateTimestampProvider as defaultTimestampProvider } from '@gertsai/audit-primitives';

/**
 * Convert a {@link Timestamp} back to an integer millis-since-epoch.
 *
 * @deprecated Sprint 3.7: prefer `timestampToMillis` from
 * `@gertsai/audit-primitives`. Re-export retained for backward compat.
 */
export { timestampToMillis } from '@gertsai/audit-primitives';

/**
 * Build a {@link Timestamp} from a JS `Date`.
 *
 * @deprecated Sprint 3.7: prefer `timestampFromDate` from
 * `@gertsai/audit-primitives`. Re-export retained for backward compat.
 */
export { timestampFromDate } from '@gertsai/audit-primitives';

// Local alias preserves the symbol name expected by older imports.
// The actual implementation lives in @gertsai/audit-primitives.
export type { Timestamp };
