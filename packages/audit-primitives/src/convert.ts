// SPDX-License-Identifier: Apache-2.0
import type { Timestamp } from './types.js';

/** Convert a {@link Timestamp} to integer millis-since-epoch. */
export function timestampToMillis(ts: Timestamp): number {
  return ts.seconds * 1000 + Math.floor(ts.nanoseconds / 1_000_000);
}

/** Build a {@link Timestamp} from a JS `Date`. */
export function timestampFromDate(d: Date): Timestamp {
  const ms = d.getTime();
  return {
    seconds: Math.floor(ms / 1000),
    nanoseconds: (ms % 1000) * 1_000_000,
  };
}

/** Build a {@link Timestamp} from millis-since-epoch. */
export function timestampFromMillis(ms: number): Timestamp {
  return {
    seconds: Math.floor(ms / 1000),
    nanoseconds: (ms % 1000) * 1_000_000,
  };
}

/**
 * Total ordering on {@link Timestamp}: returns `-1`/`0`/`1` for `a<b`/`a===b`/`a>b`.
 * Compares `seconds` first, then `nanoseconds` as the tie-breaker so two
 * timestamps in the same wall-clock second still order deterministically.
 */
export function timestampCompare(a: Timestamp, b: Timestamp): -1 | 0 | 1 {
  if (a.seconds !== b.seconds) return a.seconds < b.seconds ? -1 : 1;
  if (a.nanoseconds !== b.nanoseconds) return a.nanoseconds < b.nanoseconds ? -1 : 1;
  return 0;
}
