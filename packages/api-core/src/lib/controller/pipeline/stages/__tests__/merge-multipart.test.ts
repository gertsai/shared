// SPDX-License-Identifier: Apache-2.0
/**
 * mergeMultipart (Stage 2) unit tests.
 *
 * Wave 27 (PRD-065 / RFC-027 PR-2 AC — ≥5 cases per SPEC-021 §Stage 2):
 *   1. $multipart present: fields merged into params via Object.assign
 *   2. $multipart undefined: params unchanged
 *   3. $multipart null: params unchanged (falsy check)
 *   4. merge overwrites existing params key (Object.assign semantics)
 *   5. returns same ctx reference (in-place mutation)
 *   6. does not add $multipart itself as a params key
 */

import { describe, it, expect } from 'vitest';
import { mergeMultipart } from '../merge-multipart';
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
  multipart?: Record<string, unknown> | null,
): PipelineContext {
  return {
    ctx: {
      meta: {
        $multipart: multipart,
      },
    } as unknown as PipelineContext['ctx'],
    params,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('mergeMultipart (Stage 2)', () => {
  // Case 1: $multipart present — fields merged into params
  it('merges ctx.meta.$multipart fields into params when $multipart is truthy', async () => {
    const params: Record<string, unknown> = { existingField: 'kept' };
    const ctx = makeCtx(params, { title: 'New title', tags: ['a', 'b'] });

    const result = await mergeMultipart(ctx, makeDeps());

    expect(result.params).toMatchObject({
      existingField: 'kept',
      title: 'New title',
      tags: ['a', 'b'],
    });
  });

  // Case 2: $multipart undefined — params untouched
  it('no-op when ctx.meta.$multipart is undefined', async () => {
    const params: Record<string, unknown> = { id: '42' };
    const ctx = makeCtx(params, undefined);

    const result = await mergeMultipart(ctx, makeDeps());

    expect(result.params).toEqual({ id: '42' });
  });

  // Case 3: $multipart null — params untouched (null is falsy)
  it('no-op when ctx.meta.$multipart is null', async () => {
    const params: Record<string, unknown> = { id: '99' };
    const ctx = makeCtx(params, null);

    const result = await mergeMultipart(ctx, makeDeps());

    expect(result.params).toEqual({ id: '99' });
  });

  // Case 4: $multipart overwrites existing params key (Object.assign semantics)
  it('$multipart values overwrite existing params keys with the same name', async () => {
    const params: Record<string, unknown> = { title: 'old title', keep: true };
    const ctx = makeCtx(params, { title: 'new title' });

    await mergeMultipart(ctx, makeDeps());

    expect((params as { title: unknown }).title).toBe('new title');
    expect((params as { keep: unknown }).keep).toBe(true);
  });

  // Case 5: returns same ctx reference (mutation is in-place, not a new object)
  it('returns the same PipelineContext reference (params mutated in-place)', async () => {
    const params: Record<string, unknown> = { a: 1 };
    const ctx = makeCtx(params, { b: 2 });

    const result = await mergeMultipart(ctx, makeDeps());

    // Same context reference
    expect(result).toBe(ctx);
    // And params is the same object
    expect(result.params).toBe(params);
  });

  // Case 6: $multipart is an empty object — params unchanged
  it('no-op when $multipart is an empty object (Object.assign with no keys)', async () => {
    const params: Record<string, unknown> = { x: 10 };
    const ctx = makeCtx(params, {});

    const result = await mergeMultipart(ctx, makeDeps());

    expect(result.params).toEqual({ x: 10 });
  });
});
