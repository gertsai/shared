// SPDX-License-Identifier: Apache-2.0
/**
 * wrapResponse (Stage 11) unit tests.
 *
 * Wave 27 (PRD-065 / RFC-027 PR-4 AC — ≥4 cases per SPEC-021 §Stage 11):
 *   1. result.code present → preserved as finalCode
 *   2. result.code undefined, action.responseCode present → uses action.responseCode
 *   3. both undefined → falls back to ResponseCode.SUCCESS
 *   4. result.message + action.responseMessage interaction (message wins; action is fallback)
 *   5. pre-existing ctx fields preserved after wrapping
 */

import { describe, it, expect } from 'vitest';
import { wrapResponse } from '../wrap-response';
import { ResponseCode } from '../../../../apiResponse';
import type { PipelineContext, PipelineDeps } from '../../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDeps(overrides?: {
  responseCode?: ResponseCode;
  responseMessage?: string;
}): PipelineDeps {
  return {
    action: {
      name: 'test.action',
      rest: undefined,
      path: 'test.action',
      options: {
        auth: 'none',
        responseCode: overrides?.responseCode,
        responseMessage: overrides?.responseMessage,
      },
    } as unknown as PipelineDeps['action'],
    service: {} as PipelineDeps['service'],
    logger: undefined,
  };
}

function makeCtx(result: NonNullable<PipelineContext['result']>): PipelineContext {
  return {
    ctx: {} as PipelineContext['ctx'],
    params: { id: '1' },
    result,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('wrapResponse (Stage 11)', () => {
  // Case 1: result.code present → preserved as finalCode
  it('result.code present → stored as-is in wrapped ctx.result.code', async () => {
    const deps = makeDeps({ responseCode: ResponseCode.SUCCESS_CREATED });
    const ctx = makeCtx({ code: ResponseCode.SUCCESS_NO_RESPONSE, data: { id: '1' } });

    const result = await wrapResponse(ctx, deps);

    // result.code wins over action.responseCode
    expect(result.result?.code).toBe(ResponseCode.SUCCESS_NO_RESPONSE);
  });

  // Case 2: result.code undefined, action.responseCode present → uses action.responseCode
  it('result.code undefined + action.responseCode set → uses action.responseCode', async () => {
    const deps = makeDeps({ responseCode: ResponseCode.SUCCESS_CREATED });
    const ctx = makeCtx({ data: { id: '2' } }); // code not set

    const result = await wrapResponse(ctx, deps);

    expect(result.result?.code).toBe(ResponseCode.SUCCESS_CREATED);
  });

  // Case 3: both undefined → falls back to ResponseCode.SUCCESS
  it('result.code and action.responseCode both undefined → finalCode is ResponseCode.SUCCESS', async () => {
    const deps = makeDeps(); // no responseCode
    const ctx = makeCtx({ data: { value: 42 } }); // no code

    const result = await wrapResponse(ctx, deps);

    expect(result.result?.code).toBe(ResponseCode.SUCCESS);
  });

  // Case 4: result.message present → preserved; action.responseMessage is fallback
  it('result.message present → message preserved over action.responseMessage', async () => {
    const deps = makeDeps({ responseMessage: 'default message' });
    const ctx = makeCtx({ data: null, message: 'custom message from handler' });

    const result = await wrapResponse(ctx, deps);

    expect(result.result?.message).toBe('custom message from handler');
  });

  // Case 4b: result.message absent → falls back to action.responseMessage
  it('result.message absent → uses action.options.responseMessage as fallback', async () => {
    const deps = makeDeps({ responseMessage: 'action fallback message' });
    const ctx = makeCtx({ data: null }); // no message

    const result = await wrapResponse(ctx, deps);

    expect(result.result?.message).toBe('action fallback message');
  });

  // Case 5: pre-existing ctx fields preserved
  it('pre-existing ctx fields (params, session, traceContext) are preserved in returned ctx', async () => {
    const deps = makeDeps();
    const session = { $destroy: () => undefined } as unknown as PipelineContext['session'];
    const traceCtx = { traceparent: '00-trace-span-01' } as unknown as PipelineContext['traceContext'];

    const ctx: PipelineContext = {
      ctx: {} as PipelineContext['ctx'],
      params: { id: 'preserve-me' },
      session,
      traceContext: traceCtx,
      result: { data: { answer: 42 } },
    };

    const result = await wrapResponse(ctx, deps);

    expect(result.params).toEqual({ id: 'preserve-me' });
    expect(result.session).toBe(session);
    expect(result.traceContext).toBe(traceCtx);
  });

  // Case 6: data preserved exactly — no transformation
  it('result.data is preserved exactly in the wrapped result', async () => {
    const deps = makeDeps();
    const payload = { nested: { deep: [1, 2, 3] } };
    const ctx = makeCtx({ data: payload });

    const result = await wrapResponse(ctx, deps);

    expect(result.result?.data).toBe(payload); // strict reference equality
  });
});
