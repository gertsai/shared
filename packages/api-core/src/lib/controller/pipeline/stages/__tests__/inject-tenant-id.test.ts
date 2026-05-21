// SPDX-License-Identifier: Apache-2.0
/**
 * injectTenantId (Stage 4) unit tests.
 *
 * Wave 27 (PRD-065 / RFC-027 PR-2 AC — ≥5 cases per SPEC-021 §Stage 4):
 *   1. tenantId in meta AND absent in params → injected
 *   2. tenantId in meta AND already in params → NOT overwritten
 *   3. tenantId absent from meta → params unchanged
 *   4. meta.tenantId falsy (empty string) → no injection
 *   5. returns same ctx reference (in-place mutation)
 *   6. params.tenantId = 0 (falsy) → meta.tenantId injected
 */

import { describe, it, expect } from 'vitest';
import { injectTenantId } from '../inject-tenant-id';
import type { PipelineContext, PipelineDeps } from '../../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDeps(): PipelineDeps {
  return {
    action: {
      name: 'test.action',
      rest: undefined,
      path: 'test.action',
      options: {} as PipelineDeps['action']['options'],
    } as PipelineDeps['action'],
    controller: {},
    service: {} as PipelineDeps['service'],
    logger: undefined,
  };
}

function makeCtx(
  params: Record<string, unknown>,
  metaTenantId?: unknown,
): PipelineContext {
  return {
    ctx: {
      meta: {
        tenantId: metaTenantId,
      },
    } as unknown as PipelineContext['ctx'],
    params,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('injectTenantId (Stage 4)', () => {
  // Case 1: tenantId in meta AND absent in params → injected
  it('injects ctx.meta.tenantId into params when params.tenantId is absent', async () => {
    const params: Record<string, unknown> = { userId: 'u1' };
    const ctx = makeCtx(params, 'tenant-abc');

    await injectTenantId(ctx, makeDeps());

    expect(params.tenantId).toBe('tenant-abc');
  });

  // Case 2: tenantId in meta AND already in params → NOT overwritten
  it('does NOT overwrite params.tenantId when it is already set', async () => {
    const params: Record<string, unknown> = { tenantId: 'existing-tenant' };
    const ctx = makeCtx(params, 'other-tenant');

    await injectTenantId(ctx, makeDeps());

    expect(params.tenantId).toBe('existing-tenant');
  });

  // Case 3: tenantId absent from meta → no injection
  it('no-op when ctx.meta.tenantId is undefined', async () => {
    const params: Record<string, unknown> = { userId: 'u2' };
    const ctx = makeCtx(params, undefined);

    await injectTenantId(ctx, makeDeps());

    expect(params.tenantId).toBeUndefined();
  });

  // Case 4: meta.tenantId is empty string (falsy) → no injection
  it('no-op when ctx.meta.tenantId is an empty string (falsy)', async () => {
    const params: Record<string, unknown> = { userId: 'u3' };
    const ctx = makeCtx(params, '');

    await injectTenantId(ctx, makeDeps());

    expect(params.tenantId).toBeUndefined();
  });

  // Case 5: returns same ctx reference (mutation in-place)
  it('returns the same PipelineContext reference', async () => {
    const params: Record<string, unknown> = {};
    const ctx = makeCtx(params, 'tenant-xyz');

    const result = await injectTenantId(ctx, makeDeps());

    expect(result).toBe(ctx);
  });

  // Case 6: params.tenantId is 0 (numeric falsy) → meta.tenantId injected
  // This preserves the verbatim !(params.tenantId) check from the original closure
  it('injects meta.tenantId when params.tenantId is 0 (falsy)', async () => {
    const params: Record<string, unknown> = { tenantId: 0 };
    const ctx = makeCtx(params, 'tenant-from-meta');

    await injectTenantId(ctx, makeDeps());

    expect(params.tenantId).toBe('tenant-from-meta');
  });
});
