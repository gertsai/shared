// SPDX-License-Identifier: Apache-2.0
/**
 * invokeHandler (Stage 8) unit tests.
 *
 * Wave 27 (PRD-065 / RFC-027 PR-3 AC — ≥5 cases per SPEC-021 §Stage 8):
 *   1. Handler returns full envelope { code, message, data } → stored in ctx.result verbatim
 *   2. Handler returns { data, raw: true } → raw: true propagated to ctx.result
 *   3. Handler throws → exception propagates (caller catches in runner)
 *   4. addJob wrapper auto-injects _traceContext into payload (SPEC-021 I-4)
 *   5. call wrapper unwraps .data from Moleculer broker response
 *   6. respond helper is passed to handler deps
 *   7. Pre-existing ctx fields preserved after invokeHandler runs
 */

import { describe, it, expect, vi } from 'vitest';
import { invokeHandler } from '../invoke-handler';
import { ResponseCode } from '../../../../apiResponse';
import type { PipelineContext, PipelineDeps } from '../../types';
import type { OrchestraSession } from '@gertsai/core';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSession(): OrchestraSession {
  return { $destroy: vi.fn() } as unknown as OrchestraSession;
}

function makeDeps(handlerFn: (handlerDeps: any) => any): PipelineDeps {
  const addJob = vi.fn().mockResolvedValue({ id: 'job-1' });
  const getQueue = vi.fn().mockReturnValue({});
  const service = {
    addJob,
    getQueue,
    logger: {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      trace: vi.fn(),
      fatal: vi.fn(),
    },
  };

  return {
    action: {
      name: 'test.action',
      rest: undefined,
      path: 'test.action',
      options: {
        auth: 'none',
        handler: handlerFn,
      },
    } as unknown as PipelineDeps['action'],
    service: service as unknown as PipelineDeps['service'],
    logger: service.logger,
    sessionFactory: () => makeSession(),
  };
}

function makeCtx(overrides?: Partial<Omit<PipelineContext, 'ctx'>>): PipelineContext {
  const ctxCall = vi.fn().mockResolvedValue({ data: { result: 'ok' } });
  return {
    ctx: {
      call: ctxCall,
      meta: {},
    } as unknown as PipelineContext['ctx'],
    params: { id: '1' },
    file: null,
    fileMeta: {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('invokeHandler (Stage 8)', () => {
  // Case 1: Handler returns full envelope { code, message, data } → stored in ctx.result
  it('handler returns { code, message, data } → stored verbatim in ctx.result', async () => {
    const handlerResult = { code: ResponseCode.SUCCESS, message: 'Done', data: { id: '1' } };
    const deps = makeDeps(() => handlerResult);
    const ctx = makeCtx();

    const result = await invokeHandler(ctx, deps);

    expect(result.result).toEqual(handlerResult);
  });

  // Case 2: Handler returns { data, raw: true } → raw: true propagated
  it('handler returns { data, raw: true } → ctx.result.raw is true', async () => {
    const rawResponse = { data: Buffer.from('stream'), raw: true };
    const deps = makeDeps(() => rawResponse);
    const ctx = makeCtx();

    const result = await invokeHandler(ctx, deps);

    expect(result.result?.raw).toBe(true);
    expect(result.result?.data).toBe(rawResponse.data);
  });

  // Case 3: Handler throws → exception propagates
  it('handler throws → error propagates out of invokeHandler', async () => {
    const handlerError = new Error('handler exploded');
    const deps = makeDeps(() => { throw handlerError; });
    const ctx = makeCtx();

    await expect(invokeHandler(ctx, deps)).rejects.toThrow('handler exploded');
  });

  // Case 4: addJob auto-injects _traceContext (SPEC-021 I-4)
  it('addJob wrapper injects _traceContext from ctx.traceContext into job payload', async () => {
    let capturedAddJobCall: unknown;
    const deps = makeDeps(async (handlerDeps: any) => {
      await handlerDeps.addJob('my-queue', 'my-job', { userId: 'u1' }, {});
      capturedAddJobCall = true;
      return { data: 'ok' };
    });
    const traceCtx = { traceparent: '00-abc-def-01' };
    const ctx = makeCtx({ traceContext: traceCtx as any });

    await invokeHandler(ctx, deps);

    // service.addJob should have been called with _traceContext injected
    const service = deps.service as any;
    expect(service.addJob).toHaveBeenCalledWith(
      'my-queue',
      'my-job',
      expect.objectContaining({ _traceContext: traceCtx, userId: 'u1' }),
      {},
    );
    expect(capturedAddJobCall).toBe(true);
  });

  // Case 5: call wrapper unwraps .data from Moleculer broker response
  it('call wrapper returns res.data from broker ctx.call response', async () => {
    let callResult: unknown;
    const deps = makeDeps(async (handlerDeps: any) => {
      callResult = await handlerDeps.call('v1.users.get', { id: '1' });
      return { data: callResult };
    });
    const mockCtxCall = vi.fn().mockResolvedValue({ data: { name: 'Alice' } });
    const ctx = makeCtx();
    (ctx.ctx as any).call = mockCtxCall;

    await invokeHandler(ctx, deps);

    expect(callResult).toEqual({ name: 'Alice' });
    expect(mockCtxCall).toHaveBeenCalledWith('v1.users.get', { id: '1' });
  });

  // Case 6: respond helper passed to handler deps
  it('respond helper is passed to handler and produces correct envelope', async () => {
    let respondResult: unknown;
    const deps = makeDeps((handlerDeps: any) => {
      respondResult = handlerDeps.respond({ id: '1' }, 'Created', ResponseCode.SUCCESS);
      return respondResult;
    });
    const ctx = makeCtx();

    const result = await invokeHandler(ctx, deps);

    expect(respondResult).toEqual({ data: { id: '1' }, message: 'Created', code: ResponseCode.SUCCESS });
    expect(result.result).toEqual(respondResult);
  });

  // Case 7: Pre-existing ctx fields preserved after invokeHandler
  it('pre-existing PipelineContext fields are preserved in the returned context', async () => {
    const session = makeSession();
    const traceCtx = { traceparent: '00-abc-def-01' };
    const deps = makeDeps(() => ({ data: 'response' }));
    const ctx = makeCtx({ session, traceContext: traceCtx as any });

    const result = await invokeHandler(ctx, deps);

    expect(result.session).toBe(session);
    expect(result.traceContext).toBe(traceCtx);
    expect(result.params).toEqual({ id: '1' });
  });
});
