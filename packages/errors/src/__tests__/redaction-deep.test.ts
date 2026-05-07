// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { redactDetails } from '../redaction.js';

describe('redactDetails — deep-scan (Sprint 3.10 W-3-10-3, ADR-010 I-15)', () => {
  it('redacts nested credentials at depth 2-4', () => {
    const out = redactDetails({
      level1: {
        level2: {
          password: 'secret',
          plain: 'kept',
          level3: {
            api_key: 'sk-x',
            keep: 'ok',
          },
        },
      },
    });
    const l1 = out.level1 as Record<string, unknown>;
    const l2 = l1.level2 as Record<string, unknown>;
    const l3 = l2.level3 as Record<string, unknown>;
    expect(l2.password).toBe('[REDACTED]');
    expect(l2.plain).toBe('kept');
    expect(l3.api_key).toBe('[REDACTED]');
    expect(l3.keep).toBe('ok');
  });

  it('truncates at MAX_DEPTH=5 with [REDACTED:depth] marker', () => {
    // depth 0 → details root; nested keys recurse with depth+1. Object
    // at depth 6 (and deeper) is replaced with '[REDACTED:depth]'.
    const out = redactDetails({
      a: { b: { c: { d: { e: { f: { password: 'leak' } } } } } },
    });
    // Walk a..e (5 hops, depths 1..5) — each is still an object.
    let current: unknown = out;
    for (const k of ['a', 'b', 'c', 'd', 'e']) {
      expect(typeof current).toBe('object');
      expect(current).not.toBe('[REDACTED:depth]');
      current = (current as Record<string, unknown>)[k];
    }
    // After hopping to `e`, current = { f: <value at depth 6> }.
    // Value at depth 6 must be the depth marker — its content (incl.
    // the would-be redacted password) is unreachable.
    expect((current as Record<string, unknown>).f).toBe('[REDACTED:depth]');
  });

  it('caps breadth at MAX_BREADTH=1000 and emits __truncated__ marker', () => {
    const big: Record<string, unknown> = {};
    for (let i = 0; i < 1500; i++) big[`k${i}`] = i;
    const out = redactDetails(big);
    const keys = Object.keys(out);
    // 1000 original keys + 1 __truncated__ marker
    expect(keys.length).toBe(1001);
    expect(out.__truncated__).toBe('[REDACTED:breadth>1000]');
    expect(out.k0).toBe(0);
    expect(out.k999).toBe(999);
    expect(out.k1000).toBeUndefined();
  });

  it('cycle protection — circular reference returns [REDACTED:cycle], no infinite loop', () => {
    const a: Record<string, unknown> = { name: 'a' };
    const b: Record<string, unknown> = { name: 'b', a };
    a.b = b;
    const out = redactDetails({ root: a });
    const root = out.root as Record<string, unknown>;
    const bSeen = root.b as Record<string, unknown>;
    // Re-encountering `a` from inside `b` must yield the cycle marker
    expect(bSeen.a).toBe('[REDACTED:cycle]');
  });

  it('mixed-case credential keys redacted (case-insensitive comparison)', () => {
    const out = redactDetails({
      Password: 'x',
      TOKEN: 'y',
      Authorization: 'Bearer z',
      Cookie: 'sid=q',
      PrivateKey: '----',
      keep: 'ok',
    });
    expect(out.Password).toBe('[REDACTED]');
    expect(out.TOKEN).toBe('[REDACTED]');
    expect(out.Authorization).toBe('[REDACTED]');
    expect(out.Cookie).toBe('[REDACTED]');
    expect(out.PrivateKey).toBe('[REDACTED]');
    expect(out.keep).toBe('ok');
  });

  it('skips non-plain objects (Date, RegExp, Map) leaving them untouched', () => {
    const date = new Date('2026-05-07T00:00:00Z');
    const re = /password/g;
    const map = new Map([['password', 'leak-not-traversed']]);
    const out = redactDetails({
      created: date,
      pattern: re,
      bucket: map,
      password: 'topLevelStillRedacted',
    });
    // Top-level redaction key still works
    expect(out.password).toBe('[REDACTED]');
    // Non-plain objects pass through by reference (not enumerated)
    expect(out.created).toBe(date);
    expect(out.pattern).toBe(re);
    expect(out.bucket).toBe(map);
  });

  it('redacts inside arrays — nested object items', () => {
    const out = redactDetails({
      items: [
        { id: 1, password: 'a' },
        { id: 2, token: 'b' },
        { id: 3, plain: 'c' },
      ],
    });
    const items = out.items as Record<string, unknown>[];
    expect(items[0].password).toBe('[REDACTED]');
    expect(items[0].id).toBe(1);
    expect(items[1].token).toBe('[REDACTED]');
    expect(items[2].plain).toBe('c');
  });

  it('handles primitive values at the leaf without coercion', () => {
    const out = redactDetails({
      nullVal: null,
      undef: undefined,
      bool: true,
      num: 42,
      str: 'hi',
    });
    expect(out.nullVal).toBe(null);
    expect(out.undef).toBe(undefined);
    expect(out.bool).toBe(true);
    expect(out.num).toBe(42);
    expect(out.str).toBe('hi');
  });
});
