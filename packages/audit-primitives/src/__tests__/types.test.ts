// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import type { AuditMarks, Timestamp } from '../types.js';

describe('Timestamp shape', () => {
  it('accepts a structurally-valid object literal', () => {
    const ts: Timestamp = { seconds: 1700000000, nanoseconds: 500_000_000 };
    expect(ts.seconds).toBe(1700000000);
    expect(ts.nanoseconds).toBe(500_000_000);
  });

  it('treats fields as readonly at runtime via plain object semantics', () => {
    const ts: Timestamp = { seconds: 1, nanoseconds: 2 };
    expect(Object.keys(ts).toSorted()).toEqual(['nanoseconds', 'seconds']);
  });
});

describe('AuditMarks shape', () => {
  it('requires created_at and updated_at; deleted_at is optional', () => {
    const marks: AuditMarks = {
      created_at: { seconds: 1, nanoseconds: 0 },
      updated_at: { seconds: 2, nanoseconds: 0 },
    };
    expect(marks.created_at.seconds).toBe(1);
    expect(marks.updated_at.seconds).toBe(2);
    expect(marks.deleted_at).toBeUndefined();
  });

  it('accepts deleted_at when present (soft-delete)', () => {
    const marks: AuditMarks = {
      created_at: { seconds: 1, nanoseconds: 0 },
      updated_at: { seconds: 2, nanoseconds: 0 },
      deleted_at: { seconds: 3, nanoseconds: 0 },
    };
    expect(marks.deleted_at?.seconds).toBe(3);
  });
});
