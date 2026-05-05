// SPDX-License-Identifier: Apache-2.0
// Originally inspired by Orchestra orchlab/core/src/timestamp.ts (Apache 2.0).
// The Orchestra implementation pulls `Timestamp` from Firelord through a DI
// container; this version exposes the same surface as a plain function so
// consumers can inject their own clock without taking a Firestore dep.

import type { Timestamp } from './types';

/**
 * Pluggable clock. Builders accept this via `BuilderOpts.timestampProvider`
 * so tests can pin time deterministically and consumers can route through
 * Firestore's `serverTimestamp()` (or any other source) when desired.
 */
export type TimestampProvider = () => Timestamp;

/**
 * Default provider — reads `Date.now()` and decomposes it into the
 * `{ seconds, nanoseconds }` shape. Wall-clock precision; for monotonic
 * needs inject your own.
 */
export const defaultTimestampProvider: TimestampProvider = () => {
  const now = Date.now();
  return {
    seconds: Math.floor(now / 1000),
    nanoseconds: (now % 1000) * 1_000_000,
  };
};

/** Convert a {@link Timestamp} back to an integer millis-since-epoch. */
export function timestampToMillis(t: Timestamp): number {
  return t.seconds * 1000 + Math.floor(t.nanoseconds / 1_000_000);
}

/** Build a {@link Timestamp} from a JS `Date`. */
export function timestampFromDate(d: Date): Timestamp {
  const ms = d.getTime();
  return {
    seconds: Math.floor(ms / 1000),
    nanoseconds: (ms % 1000) * 1_000_000,
  };
}
