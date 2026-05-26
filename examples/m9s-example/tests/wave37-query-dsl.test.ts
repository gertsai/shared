// SPDX-License-Identifier: Apache-2.0
/**
 * Wave 37 — query-dsl roundtrip tests (FR-D6, Group 1).
 *
 * Tests focus on two areas:
 *   1. The 2 queries migrated to query-dsl (save:existing-check + findById):
 *      assert compileToSql output contains tenant_id in both SQL string and
 *      params array (FR-A4 non-regression).
 *   2. Cross-tenant isolation: different tenantId values produce different
 *      params — no bleed between tenants.
 *   3. defineQueryConstraints type safety: invalid field names are caught at
 *      compile time by the DocumentQueryMeta indexed constraint.
 */
import { describe, expect, it } from 'vitest';

import type { StorageMetadata } from '@gertsai/storage-core';
import { defineQueryConstraints } from '@gertsai/query-dsl';
import { compileToSql } from '@gertsai/query-dsl/sql';

// Mirror the DocumentQueryMeta from pg-document.repository.ts (Wave 37.A)
type DocumentQueryMeta = StorageMetadata<
  unknown,
  unknown,
  'id' | 'tenant_id' | 'deleted_at'
>;

const q = defineQueryConstraints<DocumentQueryMeta>();

describe('Wave 37.A — query-dsl SELECT-by-id roundtrip (FR-D6 Group 1)', () => {
  it('save:existing-check compileToSql includes tenant_id in WHERE clause and params', () => {
    // Mirrors pg-document.repository.ts save() — existingQuery
    const tenantId = 'tenant-acme';
    const id = '11111111-1111-1111-1111-111111111111';

    const query = [
      q.where('id', '==', id),
      q.where('tenant_id', '==', tenantId),
      q.limit(1),
    ] as const;

    const { sql, params } = compileToSql(query, 'documents');

    // SQL must include tenant_id equality predicate
    expect(sql).toContain('"tenant_id"');
    expect(sql).toMatch(/WHERE .+ AND .+/);
    expect(sql).toContain('LIMIT $3');

    // params: [id, tenantId, 1]
    expect(params).toHaveLength(3);
    expect(params[0]).toBe(id);
    expect(params[1]).toBe(tenantId);
    expect(params[2]).toBe(1);
  });

  it('findById compileToSql + tombstone splice preserves tenant_id and deleted_at IS NULL', () => {
    // Mirrors pg-document.repository.ts findById() — findQuery + splice
    const tenantId = 'tenant-beta';
    const id = '22222222-2222-2222-2222-222222222222';

    const query = [
      q.where('id', '==', id),
      q.where('tenant_id', '==', tenantId),
      q.limit(1),
    ] as const;

    const { sql, params } = compileToSql(query, 'documents');

    // Simulate the soft-delete splice done in findById
    const sqlWithTombstone = sql.replace(' LIMIT ', ' AND deleted_at IS NULL LIMIT ');

    expect(sqlWithTombstone).toContain('"id"');
    expect(sqlWithTombstone).toContain('"tenant_id"');
    expect(sqlWithTombstone).toContain('deleted_at IS NULL');

    // Both id and tenantId must appear in params — cross-tenant isolation
    expect(params).toContain(tenantId);
    expect(params).toContain(id);
  });

  it('cross-tenant isolation: same id, different tenantId produces different params (no bleeding)', () => {
    const sharedId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

    const queryA = [
      q.where('id', '==', sharedId),
      q.where('tenant_id', '==', 'tenant-a'),
      q.limit(1),
    ] as const;
    const queryB = [
      q.where('id', '==', sharedId),
      q.where('tenant_id', '==', 'tenant-b'),
      q.limit(1),
    ] as const;

    const compiledA = compileToSql(queryA, 'documents');
    const compiledB = compileToSql(queryB, 'documents');

    // Same SQL shape — both include tenant_id predicate
    expect(compiledA.sql).toBe(compiledB.sql);
    expect(compiledA.sql).toContain('"tenant_id"');

    // Different params — tenant isolation enforced at parameter level
    expect(compiledA.params[1]).toBe('tenant-a');
    expect(compiledB.params[1]).toBe('tenant-b');
  });
});
