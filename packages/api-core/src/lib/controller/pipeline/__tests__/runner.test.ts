// SPDX-License-Identifier: Apache-2.0
/**
 * PipelineRunner unit tests.
 *
 * Wave 27 (PRD-065 / RFC-027 PR-1 AC):
 *   - Empty stages list runs cleanly, returns initial result
 *   - Sequential stage execution preserves context flow
 *   - Stage throwing routes to translateError (mock)
 *   - PipelineShortCircuit thrown by a stage is caught and returns data
 *   - cleanup always runs in finally (even on throw)
 *
 * PR-4: runStagesSerially removed; runner now returns full {success, code, message, data}
 * envelope when ctx.result.code is set (wrapResponse guarantees this in the full pipeline).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PipelineRunner } from '../runner';
import { PipelineShortCircuit } from '../types';
import type { PipelineContext, PipelineDeps, Stage } from '../types';
import { APIError } from '../../../error';
import { ResponseCode } from '../../../apiResponse';

// ---------------------------------------------------------------------------
// Minimal mock deps
// ---------------------------------------------------------------------------

function makeDeps(overrides?: Partial<PipelineDeps>): PipelineDeps {
  return {
    action: {
      name: 'test.action',
      rest: 'GET /test',
      path: 'test.action',
      options: {} as PipelineDeps['action']['options'],
    } as PipelineDeps['action'],
    service: {} as PipelineDeps['service'],
    logger: {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      trace: vi.fn(),
      fatal: vi.fn(),
    },
    ...overrides,
  };
}

function makeCtx(overrides?: Partial<PipelineContext>): PipelineContext {
  return {
    ctx: {} as PipelineContext['ctx'],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PipelineRunner', () => {
  let deps: PipelineDeps;
  let initialCtx: PipelineContext;

  beforeEach(() => {
    deps = makeDeps();
    initialCtx = makeCtx();
  });

  // AC-1: Empty stages list — no stages = returns undefined (no result set)
  it('empty stages list runs cleanly and returns undefined when no result set', async () => {
    const runner = new PipelineRunner([]);
    const result = await runner.run(initialCtx, deps);
    expect(result).toBeUndefined();
  });

  // AC-1 variant: Empty stages with result pre-set but no code → returns ctx.result.data
  it('empty stages list returns ctx.result.data when initial context has result without code', async () => {
    const ctx = makeCtx({ result: { data: { id: '42' } } });
    const runner = new PipelineRunner([]);
    const result = await runner.run(ctx, deps);
    expect(result).toEqual({ id: '42' });
  });

  // AC-1 PR-4 variant: result with code set → returns full success envelope
  it('empty stages list returns {success, code, message, data} envelope when result.code is set', async () => {
    const ctx = makeCtx({
      result: { code: ResponseCode.SUCCESS_CREATED, message: 'Created', data: { id: '99' } },
    });
    const runner = new PipelineRunner([]);
    const result = await runner.run(ctx, deps);
    expect(result).toEqual({
      success: true,
      code: ResponseCode.SUCCESS_CREATED,
      message: 'Created',
      data: { id: '99' },
    });
  });

  // AC-2: Sequential stages — each stage receives the previous stage's output
  it('sequential stage execution threads context through each stage in order', async () => {
    const log: string[] = [];

    const stageA: Stage = async (ctx) => {
      log.push('A');
      return { ...ctx, params: { step: 'A' } };
    };
    const stageB: Stage = async (ctx) => {
      log.push('B');
      // stageB should see stageA's output
      expect((ctx.params as { step: string }).step).toBe('A');
      return { ...ctx, params: { step: 'B' } };
    };
    const stageC: Stage = async (ctx) => {
      log.push('C');
      expect((ctx.params as { step: string }).step).toBe('B');
      return { ...ctx, result: { data: 'final' } };
    };

    const runner = new PipelineRunner([stageA, stageB, stageC]);
    const result = await runner.run(initialCtx, deps);

    expect(log).toEqual(['A', 'B', 'C']);
    // result.code not set → returns raw data
    expect(result).toBe('final');
  });

  // AC-2 PR-4 variant: full pipeline with wrapResponse-equivalent stage
  it('stage that sets result.code triggers full success envelope return', async () => {
    const wrapStage: Stage = async (ctx) => ({
      ...ctx,
      result: {
        ...ctx.result,
        code: ResponseCode.SUCCESS,
        message: undefined,
        data: { wrapped: true },
      },
    });

    const runner = new PipelineRunner([wrapStage]);
    const result = await runner.run(initialCtx, deps);

    expect(result).toEqual({
      success: true,
      code: ResponseCode.SUCCESS,
      message: undefined,
      data: { wrapped: true },
    });
  });

  // AC-3: Stage throws generic Error — translateError wraps it as APIError
  it('stage throwing a generic Error causes runner to throw an APIError', async () => {
    const failingStage: Stage = async () => {
      throw new Error('something went wrong');
    };

    const runner = new PipelineRunner([failingStage]);

    await expect(runner.run(initialCtx, deps)).rejects.toBeInstanceOf(APIError);
  });

  // AC-3 variant: Stage throws an APIError — it is rethrown as-is (not double-wrapped)
  it('stage throwing an APIError is rethrown unchanged', async () => {
    const original = new APIError(ResponseCode.NOT_FOUND);
    const failingStage: Stage = async () => {
      throw original;
    };

    const runner = new PipelineRunner([failingStage]);

    await expect(runner.run(initialCtx, deps)).rejects.toBe(original);
  });

  // AC-4: PipelineShortCircuit — remaining stages skipped, data returned directly
  it('PipelineShortCircuit thrown by a stage is caught and returns shortCircuit.data', async () => {
    const shortCircuitStage: Stage = async () => {
      throw new PipelineShortCircuit({ shortCircuited: true });
    };
    const neverReachedStage: Stage = vi.fn().mockResolvedValue({} as PipelineContext);

    const runner = new PipelineRunner([shortCircuitStage, neverReachedStage]);
    const result = await runner.run(initialCtx, deps);

    expect(result).toEqual({ shortCircuited: true });
    expect(neverReachedStage).not.toHaveBeenCalled();
  });

  // AC-5: cleanup always runs — even when a stage throws
  it('cleanup (logger.info + session.$destroy) always runs even when a stage throws', async () => {
    const destroySpy = vi.fn();
    const ctxWithSession = makeCtx({
      session: { $destroy: destroySpy } as unknown as PipelineContext['session'],
    });

    const failingStage: Stage = async () => {
      throw new Error('boom');
    };

    const runner = new PipelineRunner([failingStage]);

    // Runner will rethrow translated error; cleanup still runs
    await expect(runner.run(ctxWithSession, deps)).rejects.toBeInstanceOf(APIError);

    expect(destroySpy).toHaveBeenCalledOnce();
    expect(deps.logger?.info).toHaveBeenCalledWith('Action finished', 'test.action');
  });

  // AC-5 variant: cleanup runs on successful execution too
  it('cleanup runs even on successful execution', async () => {
    const destroySpy = vi.fn();
    const ctxWithSession = makeCtx({
      session: { $destroy: destroySpy } as unknown as PipelineContext['session'],
    });

    const runner = new PipelineRunner([]);
    await runner.run(ctxWithSession, deps);

    expect(destroySpy).toHaveBeenCalledOnce();
    expect(deps.logger?.info).toHaveBeenCalledWith('Action finished', 'test.action');
  });

  // AC-5 variant: cleanup runs after PipelineShortCircuit
  it('cleanup runs after PipelineShortCircuit', async () => {
    const destroySpy = vi.fn();
    const ctxWithSession = makeCtx({
      session: { $destroy: destroySpy } as unknown as PipelineContext['session'],
    });

    const shortCircuitStage: Stage = async () => {
      throw new PipelineShortCircuit('early-result');
    };

    const runner = new PipelineRunner([shortCircuitStage]);
    const result = await runner.run(ctxWithSession, deps);

    expect(result).toBe('early-result');
    expect(destroySpy).toHaveBeenCalledOnce();
  });
});
