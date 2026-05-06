// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import {
  timestampCompare,
  timestampFromDate,
  timestampFromMillis,
  timestampToMillis,
} from '../convert.js';
import type { Timestamp } from '../types.js';

describe('timestampToMillis / timestampFromMillis', () => {
  it('round-trips an arbitrary millis value', () => {
    const ms = 1_700_123_456_789;
    const ts = timestampFromMillis(ms);
    expect(timestampToMillis(ts)).toBe(ms);
  });

  it('preserves epoch (ms = 0)', () => {
    const ts = timestampFromMillis(0);
    expect(ts).toEqual({ seconds: 0, nanoseconds: 0 });
    expect(timestampToMillis(ts)).toBe(0);
  });

  it('handles large millis values without precision loss within Number.MAX_SAFE_INTEGER', () => {
    const ms = 8_640_000_000_000_000; // ECMA Date max
    const ts = timestampFromMillis(ms);
    expect(timestampToMillis(ts)).toBe(ms);
  });
});

describe('timestampFromDate', () => {
  it('round-trips Date → Timestamp → ms', () => {
    const d = new Date('2026-05-06T10:11:12.345Z');
    const ts = timestampFromDate(d);
    expect(timestampToMillis(ts)).toBe(d.getTime());
  });

  it('decomposes ms remainder into nanoseconds', () => {
    const d = new Date(1_700_000_000_500);
    const ts = timestampFromDate(d);
    expect(ts.seconds).toBe(1_700_000_000);
    expect(ts.nanoseconds).toBe(500_000_000);
  });
});

describe('timestampCompare', () => {
  it('returns 0 for equal timestamps', () => {
    const ts: Timestamp = { seconds: 100, nanoseconds: 200 };
    expect(timestampCompare(ts, { ...ts })).toBe(0);
  });

  it('returns -1 when a.seconds < b.seconds', () => {
    expect(
      timestampCompare(
        { seconds: 1, nanoseconds: 999_999_999 },
        { seconds: 2, nanoseconds: 0 },
      ),
    ).toBe(-1);
  });

  it('returns 1 when a.seconds > b.seconds', () => {
    expect(
      timestampCompare(
        { seconds: 5, nanoseconds: 0 },
        { seconds: 4, nanoseconds: 999_999_999 },
      ),
    ).toBe(1);
  });

  it('breaks ties on nanoseconds (a < b)', () => {
    expect(
      timestampCompare(
        { seconds: 10, nanoseconds: 100 },
        { seconds: 10, nanoseconds: 200 },
      ),
    ).toBe(-1);
  });

  it('breaks ties on nanoseconds (a > b)', () => {
    expect(
      timestampCompare(
        { seconds: 10, nanoseconds: 500 },
        { seconds: 10, nanoseconds: 100 },
      ),
    ).toBe(1);
  });

  it('handles epoch and large-second extremes', () => {
    const epoch: Timestamp = { seconds: 0, nanoseconds: 0 };
    const far: Timestamp = { seconds: 9_999_999_999, nanoseconds: 0 };
    expect(timestampCompare(epoch, far)).toBe(-1);
    expect(timestampCompare(far, epoch)).toBe(1);
  });
});
