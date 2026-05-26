// SPDX-License-Identifier: Apache-2.0
/**
 * Wave 37 — TenantId brand boundary tests (FR-D6, Group 2).
 *
 * Covers:
 *   1. Positive runtime: asTenantId('acme') returns a branded value that can
 *      be used in PgDocumentRepositoryOptions.tenantId (now TenantId, not string).
 *   2. Negative runtime: asTenantId('') throws TypeError (fail-fast on empty).
 *   3. Negative typecheck: plain string literal not assignable to TenantId
 *      — verified via @ts-expect-error (compile-time brand enforcement).
 *   4. Brand passthrough: TenantId value is structurally a string (runtime
 *      identity preserved — downstream SQL parameters receive the raw value).
 */
import { describe, expect, it } from 'vitest';

import { asTenantId, type TenantId } from '@gertsai/tenant';

describe('Wave 37.B — TenantId brand boundary (FR-D6 Group 2)', () => {
  it('positive: asTenantId returns a branded TenantId usable where TenantId is required', () => {
    const tid: TenantId = asTenantId('tenant-acme');
    // Structurally a string at runtime — downstream SQL params receive the value
    expect(typeof tid).toBe('string');
    expect(tid).toBe('tenant-acme');
  });

  it('positive: branded TenantId passes through to an opts object typed TenantId (mirrors PgDocumentRepositoryOptions)', () => {
    const tid = asTenantId('tenant-beta');
    // Simulate PgDocumentRepositoryOptions.tenantId field (typed TenantId after Wave 37.B)
    const opts: { readonly tenantId: TenantId } = { tenantId: tid };
    expect(opts.tenantId).toBe('tenant-beta');
    // Structural identity: TenantId is a string at runtime
    expect(typeof opts.tenantId).toBe('string');
  });

  it('negative runtime: asTenantId("") throws TypeError for empty string', () => {
    expect(() => asTenantId('')).toThrow(TypeError);
    expect(() => asTenantId('')).toThrow(/non-empty/i);
  });

  it('negative typecheck: plain string is NOT assignable to TenantId (compile-time brand)', () => {
    // @ts-expect-error — plain string must not be assignable to TenantId; this
    // is the compile-time enforcement Wave 37.B (PRD-071) requires. The test
    // passes at runtime because @ts-expect-error suppresses the error; the
    // important signal is that WITHOUT @ts-expect-error TypeScript would reject
    // this assignment.
    const _tid: TenantId = 'plain-string-not-branded';
    void _tid;
  });
});
