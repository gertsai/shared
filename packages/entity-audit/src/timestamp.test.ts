// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';

import {
  defaultTimestampProvider,
  timestampFromDate,
  timestampToMillis,
} from './timestamp';
import type { TimestampProvider } from './timestamp';
import type { Timestamp } from './types';

describe('defaultTimestampProvider', () => {
  it('returns a Timestamp with integer seconds and nanoseconds', () => {
    const ts = defaultTimestampProvider();
    expect(ts).toEqual({
      seconds: expect.any(Number),
      nanoseconds: expect.any(Number),
    });
    expect(Number.isInteger(ts.seconds)).toBe(true);
    expect(Number.isInteger(ts.nanoseconds)).toBe(true);
    expect(ts.seconds).toBeGreaterThan(0);
    expect(ts.nanoseconds).toBeGreaterThanOrEqual(0);
    expect(ts.nanoseconds).toBeLessThan(1_000_000_000);
  });

  it('roughly tracks the current wall clock', () => {
    const before = Date.now();
    const ts = defaultTimestampProvider();
    const after = Date.now();
    const ms = timestampToMillis(ts);
    expect(ms).toBeGreaterThanOrEqual(before - 1);
    expect(ms).toBeLessThanOrEqual(after + 1);
  });
});

describe('timestampToMillis', () => {
  it('round-trips with timestampFromDate within ms precision', () => {
    const original = new Date('2024-06-15T12:34:56.789Z');
    const ts = timestampFromDate(original);
    const ms = timestampToMillis(ts);
    expect(ms).toBe(original.getTime());
  });

  it('handles the unix epoch', () => {
    const ts = timestampFromDate(new Date(0));
    expect(ts).toEqual({ seconds: 0, nanoseconds: 0 });
    expect(timestampToMillis(ts)).toBe(0);
  });
});

describe('timestampFromDate', () => {
  it('preserves sub-second precision down to milliseconds', () => {
    const ts = timestampFromDate(new Date('2024-01-01T00:00:00.250Z'));
    expect(ts.nanoseconds).toBe(250 * 1_000_000);
  });

  it('decomposes whole seconds correctly', () => {
    const ts = timestampFromDate(new Date(1_700_000_000_000));
    expect(ts.seconds).toBe(1_700_000_000);
    expect(ts.nanoseconds).toBe(0);
  });
});

describe('TimestampProvider injection', () => {
  it('honours a custom provider type', () => {
    const fixed: Timestamp = { seconds: 42, nanoseconds: 7 };
    const fixedProvider: TimestampProvider = () => fixed;
    expect(fixedProvider()).toBe(fixed);
    expect(fixedProvider().seconds).toBe(42);
  });
});
