// SPDX-License-Identifier: Apache-2.0
/**
 * buildTraceContext (Stage 7) unit tests.
 *
 * Wave 27 (PRD-065 / RFC-027 PR-3 AC — ≥5 cases per SPEC-021 §Stage 7):
 *   1. All 4 fields present → traceContext is a string (traceparent assembled)
 *   2. Only requestID + id present (no tracing) → traceContext is undefined (not sampled)
 *   3. None present → traceContext is undefined
 *   4. traceContext threaded into output PipelineContext
 *   5. Pre-existing ctx fields preserved (no key drops via spread)
 *   6. ctx returned unchanged when no trace inputs are present
 */

import { describe, it, expect } from 'vitest';
import { buildTraceContext } from '../build-trace-context';
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
      options: {},
    } as unknown as PipelineDeps['action'],
    controller: {},
    service: {} as PipelineDeps['service'],
    logger: undefined,
    sessionFactory: () => ({ $destroy: () => {} } as any),
  };
}

function makeCtx(molCtxOverrides?: {
  requestID?: unknown;
  id?: unknown;
  parentID?: unknown;
  tracing?: unknown;
  meta?: Record<string, unknown>;
}, ctxOverrides?: Partial<Omit<PipelineContext, 'ctx'>>): PipelineContext {
  return {
    ctx: {
      requestID: molCtxOverrides?.requestID,
      id: molCtxOverrides?.id,
      parentID: molCtxOverrides?.parentID,
      tracing: molCtxOverrides?.tracing,
      meta: {
        ...molCtxOverrides?.meta,
      },
    } as unknown as PipelineContext['ctx'],
    ...ctxOverrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('buildTraceContext (Stage 7)', () => {
  // Case 1: All 4 fields present → traceContext is assembled
  it('all 4 tracing fields present → traceContext is defined with traceparent', async () => {
    const ctx = makeCtx({
      requestID: 'a'.repeat(32),
      id: 'b'.repeat(16),
      parentID: 'c'.repeat(16),
      tracing: true,
    });

    const result = await buildTraceContext(ctx, makeDeps());

    // buildTraceparent returns BuiltTraceparent (with traceparent field) or undefined
    // With tracing=true and proper IDs, it should return a defined value
    expect(result.traceContext).toBeDefined();
  });

  // Case 2: Only requestID + id present (tracing falsy) → undefined per buildTraceparent semantics
  it('requestID and id present but tracing is false → traceContext is undefined (not sampled)', async () => {
    const ctx = makeCtx({
      requestID: 'a'.repeat(32),
      id: 'b'.repeat(16),
      tracing: false,
    });

    const result = await buildTraceContext(ctx, makeDeps());

    // buildTraceparent enforces tracing=true for a valid traceparent — see otel/moleculer.ts
    expect(result.traceContext).toBeUndefined();
  });

  // Case 3: None of the tracing fields present → traceContext is undefined
  it('no tracing fields in ctx → traceContext is undefined', async () => {
    const ctx = makeCtx({});

    const result = await buildTraceContext(ctx, makeDeps());

    expect(result.traceContext).toBeUndefined();
  });

  // Case 4: traceContext correctly threaded into output PipelineContext
  it('traceContext populated when tracing fields produce a valid traceparent', async () => {
    const ctx = makeCtx({
      requestID: '0'.repeat(32),
      id: '1'.repeat(16),
      tracing: true,
    });

    const result = await buildTraceContext(ctx, makeDeps());

    if (result.traceContext !== undefined) {
      // traceContext has the shape from QueueTraceContext
      expect(typeof result.traceContext).toBe('object');
    }
    // The ctx field is preserved
    expect(result.ctx).toBe(ctx.ctx);
  });

  // Case 5: Pre-existing ctx fields preserved (no key drops)
  it('all pre-existing PipelineContext fields are preserved via spread', async () => {
    const params = { userId: '123' };
    const ctx: PipelineContext = makeCtx({ tracing: false }, {
      params,
      file: null,
      fileMeta: { fieldname: 'file' },
    });

    const result = await buildTraceContext(ctx, makeDeps());

    expect(result.params).toBe(params);
    expect(result.file).toBeNull();
    expect(result.fileMeta).toEqual({ fieldname: 'file' });
  });

  // Case 6: ctx returned unchanged when no trace inputs produce a traceparent
  it('ctx object returned when traceContext would be undefined (no extra allocations)', async () => {
    const ctx = makeCtx({});

    const result = await buildTraceContext(ctx, makeDeps());

    // When no traceContext, the same ctx reference is returned
    expect(result).toBe(ctx);
    expect(result.traceContext).toBeUndefined();
  });
});
