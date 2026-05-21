// SPDX-License-Identifier: Apache-2.0
/**
 * extractParams (Stage 1) unit tests.
 *
 * Wave 27 (PRD-065 / RFC-027 PR-2 AC — ≥5 cases per SPEC-021 §Stage 1):
 *   1. Normal path: params ← ctx.params, file ← null, fileMeta ← {}
 *   2. Multipart path: params ← ctx.meta.$params, file ← ctx.params
 *   3. Multipart path: fileMeta carries fieldname/filename/mimetype/encoding from meta
 *   4. Normal path preserves existing ctx fields (immutable spread)
 *   5. Multipart: $params absent from fileMeta (only file meta fields copied)
 *   6. Edge: params is an object — returned by reference (same object, not copy)
 */

import { describe, it, expect } from 'vitest';
import { extractParams } from '../extract-params';
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

function makeMolCtx(overrides?: {
  params?: unknown;
  meta?: Record<string, unknown>;
}): PipelineContext['ctx'] {
  return {
    params: overrides?.params ?? { id: 'abc' },
    meta: {
      $params: undefined,
      $multipart: undefined,
      ...overrides?.meta,
    },
  } as unknown as PipelineContext['ctx'];
}

function makeCtx(molCtx: PipelineContext['ctx']): PipelineContext {
  return { ctx: molCtx };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('extractParams (Stage 1)', () => {
  // Case 1: Normal (non-multipart) path
  it('normal path: params from ctx.params, file is null, fileMeta is empty object', async () => {
    const bodyParams = { userId: '1', name: 'Alice' };
    const molCtx = makeMolCtx({ params: bodyParams });
    const ctx = makeCtx(molCtx);

    const result = await extractParams(ctx, makeDeps());

    expect(result.params).toBe(bodyParams);
    expect(result.file).toBeNull();
    expect(result.fileMeta).toEqual({});
  });

  // Case 2: Multipart path — params from $params, file from ctx.params
  it('multipart path: params from ctx.meta.$params, file from ctx.params', async () => {
    const formFields = { title: 'photo' };
    const uploadStream = { pipe: () => {} }; // mock stream
    const molCtx = makeMolCtx({
      params: uploadStream,
      meta: {
        $params: formFields,
        fieldname: 'avatar',
        filename: 'pic.jpg',
        mimetype: 'image/jpeg',
        encoding: '7bit',
      },
    });
    const ctx = makeCtx(molCtx);

    const result = await extractParams(ctx, makeDeps());

    expect(result.params).toBe(formFields);
    expect(result.file).toBe(uploadStream);
  });

  // Case 3: Multipart fileMeta carries fieldname/filename/mimetype/encoding
  it('multipart path: fileMeta contains fieldname, filename, mimetype, encoding from ctx.meta', async () => {
    const molCtx = makeMolCtx({
      params: {},
      meta: {
        $params: { field: 'value' },
        fieldname: 'document',
        filename: 'report.pdf',
        mimetype: 'application/pdf',
        encoding: 'base64',
      },
    });
    const ctx = makeCtx(molCtx);

    const result = await extractParams(ctx, makeDeps());

    expect(result.fileMeta).toEqual({
      fieldname: 'document',
      filename: 'report.pdf',
      mimetype: 'application/pdf',
      encoding: 'base64',
    });
  });

  // Case 4: Normal path — returns new context spread (other ctx fields preserved)
  it('normal path: returns new PipelineContext preserving existing ctx fields', async () => {
    const existingResult = { data: 'preserved' };
    const molCtx = makeMolCtx({ params: { x: 1 } });
    const ctx: PipelineContext = { ctx: molCtx, result: existingResult };

    const result = await extractParams(ctx, makeDeps());

    // Other fields are preserved via spread
    expect(result.result).toBe(existingResult);
    // params set
    expect(result.params).toEqual({ x: 1 });
  });

  // Case 5: Multipart when meta.$params is falsy (undefined) → normal path
  it('falls back to normal path when ctx.meta.$params is undefined', async () => {
    const bodyParams = { name: 'Bob' };
    const molCtx = makeMolCtx({ params: bodyParams, meta: { $params: undefined } });
    const ctx = makeCtx(molCtx);

    const result = await extractParams(ctx, makeDeps());

    expect(result.params).toBe(bodyParams);
    expect(result.file).toBeNull();
    expect(result.fileMeta).toEqual({});
  });

  // Case 6: Normal path — params reference is the same object (no copy)
  it('normal path: params is the same object reference as ctx.params', async () => {
    const rawParams = { deep: { nested: true } };
    const molCtx = makeMolCtx({ params: rawParams });
    const ctx = makeCtx(molCtx);

    const result = await extractParams(ctx, makeDeps());

    expect(result.params).toBe(rawParams);
  });
});
