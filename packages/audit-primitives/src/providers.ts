// SPDX-License-Identifier: Apache-2.0
import type { Timestamp } from './types.js';

/**
 * Pluggable clock that yields a {@link Timestamp}.
 *
 * Per ADR-007 Amendment 1.1.3 this is a **call-signature alias**, not an
 * object-with-method. Mirrors the existing `@gertsai/entity-audit`
 * `TimestampProvider` shape exactly so consumers can swap between the two
 * packages without refactoring call sites.
 */
export type TimestampProvider = () => Timestamp;

/**
 * Default provider — reads `Date.now()` and decomposes the millis-since-epoch
 * value into the `{ seconds, nanoseconds }` shape. Resolution is wall-clock
 * milliseconds; sub-millisecond precision is always 0. For monotonic or
 * higher-resolution clocks (e.g. `process.hrtime.bigint`) inject your own.
 */
export const dateTimestampProvider: TimestampProvider = () => {
  const ms = Date.now();
  const seconds = Math.floor(ms / 1000);
  const nanoseconds = (ms % 1000) * 1_000_000;
  return { seconds, nanoseconds };
};

/**
 * Test fixture provider — returns the same {@link Timestamp} on every call.
 * Use to pin time deterministically in unit tests.
 */
export function fixedTimestampProvider(ts: Timestamp): TimestampProvider {
  return () => ts;
}
