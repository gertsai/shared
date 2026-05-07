// SPDX-License-Identifier: Apache-2.0
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  dateTimestampProvider,
  fixedTimestampProvider,
  type TimestampProvider,
} from '../providers.js';
import type { Timestamp } from '../types.js';

describe('dateTimestampProvider', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('produces seconds floor of Date.now()/1000', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-15T12:00:00.000Z'));
    const ts = dateTimestampProvider();
    expect(ts.seconds).toBe(Math.floor(new Date('2026-01-15T12:00:00.000Z').getTime() / 1000));
    expect(ts.nanoseconds).toBe(0);
  });

  it('derives nanoseconds from ms remainder (×1_000_000)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-15T12:00:00.250Z'));
    const ts = dateTimestampProvider();
    expect(ts.nanoseconds).toBe(250_000_000);
  });

  it('matches the TimestampProvider call-signature alias', () => {
    const p: TimestampProvider = dateTimestampProvider;
    const ts = p();
    expect(ts).toHaveProperty('seconds');
    expect(ts).toHaveProperty('nanoseconds');
  });
});

describe('fixedTimestampProvider', () => {
  it('returns the supplied Timestamp on every call (identity not enforced)', () => {
    const fixed: Timestamp = { seconds: 42, nanoseconds: 7 };
    const provider = fixedTimestampProvider(fixed);
    const a = provider();
    const b = provider();
    const c = provider();
    expect(a).toEqual(fixed);
    expect(b).toEqual(fixed);
    expect(c).toEqual(fixed);
  });

  it('does not mutate the supplied Timestamp', () => {
    const fixed: Timestamp = { seconds: 100, nanoseconds: 200 };
    const provider = fixedTimestampProvider(fixed);
    provider();
    expect(fixed).toEqual({ seconds: 100, nanoseconds: 200 });
  });
});
