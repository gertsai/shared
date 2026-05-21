// SPDX-License-Identifier: Apache-2.0
/**
 * coerceQueryString (Stage 3) unit tests.
 *
 * Wave 27 (PRD-065 / RFC-027 PR-2 AC — ≥5 cases per SPEC-021 §Stage 3):
 *   1. String REST config "GET /…" → coerceQueryParams called (legacy format)
 *   2. String REST config "DELETE /…" → coerceQueryParams called (legacy format)
 *   3. Object REST config { method: 'GET' } → coerceQueryParams called (legacy format)
 *   4. POST endpoint → no coercion applied (params left as strings)
 *   5. TypiaParamsWithSchema → smartCoerce called (new format)
 *   6. Object REST config { method: 'DELETE' } → coerceQueryParams called
 */

import { describe, it, expect, vi } from 'vitest';
import { coerceQueryString } from '../coerce-query-string';
import type { PipelineContext, PipelineDeps } from '../../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDepsWithRest(
  rest: unknown,
  actionParams: unknown = () => ({ success: true }),
): PipelineDeps {
  return {
    action: {
      name: 'test.action',
      rest,
      path: 'test.action',
      options: {
        rest,
        params: actionParams,
      },
    } as unknown as PipelineDeps['action'],
    service: {} as PipelineDeps['service'],
    logger: undefined,
  };
}

function makeCtxWithParams(params: Record<string, unknown>): PipelineContext {
  return {
    ctx: {
      meta: {},
    } as unknown as PipelineContext['ctx'],
    params,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('coerceQueryString (Stage 3)', () => {
  // Case 1: GET string REST config → numeric fields coerced (legacy coerceQueryParams)
  it('coerces numeric query-string params for "GET /..." REST config (legacy format)', async () => {
    const params: Record<string, unknown> = { limit: '10', offset: '5', name: 'Alice' };
    const ctx = makeCtxWithParams(params);
    const deps = makeDepsWithRest('GET /users');

    await coerceQueryString(ctx, deps);

    // limit and offset are in the legacy numeric list
    expect(params.limit).toBe(10);
    expect(params.offset).toBe(5);
    // non-numeric field unchanged
    expect(params.name).toBe('Alice');
  });

  // Case 2: DELETE string REST config → coercion applied
  it('coerces query-string params for "DELETE /..." REST config', async () => {
    const params: Record<string, unknown> = { limit: '3' };
    const ctx = makeCtxWithParams(params);
    const deps = makeDepsWithRest('DELETE /items');

    await coerceQueryString(ctx, deps);

    expect(params.limit).toBe(3);
  });

  // Case 3: Object REST config with method GET → coercion applied
  it('coerces query-string params when REST config is { method: "GET" }', async () => {
    const params: Record<string, unknown> = { page: '2', limit: '25' };
    const ctx = makeCtxWithParams(params);
    const deps = makeDepsWithRest({ method: 'GET', path: 'users' });

    await coerceQueryString(ctx, deps);

    expect(params.page).toBe(2);
    expect(params.limit).toBe(25);
  });

  // Case 4: POST endpoint → no coercion (params remain strings)
  it('does not coerce params for POST endpoints', async () => {
    const params: Record<string, unknown> = { limit: '10', page: '1' };
    const ctx = makeCtxWithParams(params);
    const deps = makeDepsWithRest('POST /items');

    await coerceQueryString(ctx, deps);

    // Strings should remain strings — POST doesn't coerce
    expect(params.limit).toBe('10');
    expect(params.page).toBe('1');
  });

  // Case 5: TypiaParamsWithSchema → smartCoerce with schema-based fields
  it('uses smartCoerce with schema metadata when action uses TypiaParamsWithSchema format', async () => {
    const params: Record<string, unknown> = { count: '7', active: 'true', tags: 'a,b' };
    const ctx = makeCtxWithParams(params);

    // TypiaParamsWithSchema format: has validate function + schema metadata
    const typiaParamsWithSchema = {
      // Minimal typia validate function mock
      validate: vi.fn(() => ({ success: true, data: params })),
      numericFields: ['count'],
      booleanFields: ['active'],
      arrayFields: ['tags'],
      // isTypiaParamsWithSchema detection key
      __typia_params_with_schema__: true,
    };
    const deps = makeDepsWithRest('GET /items', typiaParamsWithSchema);

    await coerceQueryString(ctx, deps);

    // count should be coerced to number by smartCoerce
    expect(params.count).toBe(7);
    // active should be coerced to boolean
    expect(params.active).toBe(true);
  });

  // Case 6: Object REST config with DELETE → coercion applied
  it('coerces params when REST config object has method "DELETE"', async () => {
    const params: Record<string, unknown> = { version: '3' };
    const ctx = makeCtxWithParams(params);
    const deps = makeDepsWithRest({ method: 'DELETE', path: 'docs/:id' });

    await coerceQueryString(ctx, deps);

    expect(params.version).toBe(3);
  });

  // Case 7: Returns ctx reference unchanged (in-place mutation like original)
  it('returns the same PipelineContext reference', async () => {
    const params: Record<string, unknown> = { x: '1' };
    const ctx = makeCtxWithParams(params);
    const deps = makeDepsWithRest('POST /items');

    const result = await coerceQueryString(ctx, deps);

    expect(result).toBe(ctx);
  });
});
