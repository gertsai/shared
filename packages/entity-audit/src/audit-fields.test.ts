// SPDX-License-Identifier: Apache-2.0
/**
 * Coverage for {@link AUDIT_FIELDS} + {@link CREATOR_AUDIT_FIELDS} —
 * Wave 21 / EVID-076 CP-1 closure. The values are part of the public
 * surface; renaming any of them is a breaking change requiring a major
 * version bump.
 */
import { describe, expect, it } from 'vitest';

import { AUDIT_FIELDS, CREATOR_AUDIT_FIELDS } from './index';
import type { AuditFieldName } from './index';

describe('AUDIT_FIELDS', () => {
  it('exposes the canonical MutationMarks field names verbatim', () => {
    expect(AUDIT_FIELDS.created_at).toBe('created_at');
    expect(AUDIT_FIELDS.creator_uuid).toBe('creator_uuid');
    expect(AUDIT_FIELDS.created_by_platform).toBe('created_by_platform');
    expect(AUDIT_FIELDS.updated_at).toBe('updated_at');
    expect(AUDIT_FIELDS.updated_by_uuid).toBe('updated_by_uuid');
    expect(AUDIT_FIELDS.updated_by_platform).toBe('updated_by_platform');
    expect(AUDIT_FIELDS.deleted_at).toBe('deleted_at');
    expect(AUDIT_FIELDS.deleted_by_uuid).toBe('deleted_by_uuid');
    expect(AUDIT_FIELDS.deleted_by_platform).toBe('deleted_by_platform');
  });

  it('is frozen — adapter code cannot mutate the canonical names', () => {
    expect(Object.isFrozen(AUDIT_FIELDS)).toBe(true);
  });

  it('each value is a literal string', () => {
    const name: AuditFieldName = AUDIT_FIELDS.creator_uuid;
    // Type-level check via assignment + runtime spot-check.
    expect(typeof name).toBe('string');
  });
});

describe('CREATOR_AUDIT_FIELDS', () => {
  it('contains exactly creator_uuid + created_at in that order', () => {
    expect(CREATOR_AUDIT_FIELDS).toEqual(['creator_uuid', 'created_at']);
  });

  it('is frozen — adapter code cannot mutate the strip list', () => {
    expect(Object.isFrozen(CREATOR_AUDIT_FIELDS)).toBe(true);
  });
});
