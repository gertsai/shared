// SPDX-License-Identifier: Apache-2.0
/**
 * rawResponseShortcut (Stage 9) unit tests.
 *
 * Wave 27 (PRD-065 / RFC-027 PR-4 AC — ≥5 cases per SPEC-021 §Stage 9):
 *   1. raw: true  → throws PipelineShortCircuit carrying result.data
 *   2. raw: false → passes through unchanged
 *   3. raw: undefined → passes through unchanged
 *   4. result: undefined → passes through (defensive)
 *   5. Short-circuit carries data payload exactly (no transformation)
 */

import { describe, it, expect, vi } from 'vitest';
import { rawResponseShortcut } from '../raw-response-shortcut';
import { PipelineShortCircuit } from '../../types';
import { ResponseCode } from '../../../../apiResponse';
import type { PipelineContext, PipelineDeps } from '../../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDeps(overrides?: Partial<PipelineDeps>): PipelineDeps {
  return {
    action: {
      name: 'test.action',
      rest: undefined,
      path: 'test.action',
      options: {} as PipelineDeps['action']['options'],
    } as unknown as PipelineDeps['action'],
    controller: {},
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

function makeCtx(
  resultOverrides?: Partial<NonNullable<PipelineContext['result']>> | undefined,
): PipelineContext {
  return {
    ctx: {} as PipelineContext['ctx'],
    ...(resultOverrides !== undefined
      ? { result: { data: null, ...resultOverrides } }
      : {}),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('rawResponseShortcut (Stage 9)', () => {
  // Case 1: raw: true → throws PipelineShortCircuit with result.data
  it('raw: true → throws PipelineShortCircuit carrying result.data', async () => {
    const payload = { stream: 'readable-stream-handle' };
    const ctx = makeCtx({ raw: true, data: payload });
    const deps = makeDeps();

    await expect(rawResponseShortcut(ctx, deps)).rejects.toBeInstanceOf(PipelineShortCircuit);
  });

  // Case 2: raw: false → passes through unchanged
  it('raw: false → returns ctx unchanged without throwing', async () => {
    const ctx = makeCtx({ raw: false, data: { id: '1' }, code: ResponseCode.SUCCESS });
    const deps = makeDeps();

    const result = await rawResponseShortcut(ctx, deps);

    expect(result).toBe(ctx);
  });

  // Case 3: raw: undefined → passes through unchanged
  it('raw: undefined → returns ctx unchanged without throwing', async () => {
    const ctx = makeCtx({ data: { id: '1' } });
    const deps = makeDeps();

    const result = await rawResponseShortcut(ctx, deps);

    expect(result).toBe(ctx);
  });

  // Case 4: result: undefined → passes through (defensive)
  it('result undefined → passes through without throwing', async () => {
    const ctx: PipelineContext = { ctx: {} as PipelineContext['ctx'] };
    const deps = makeDeps();

    const result = await rawResponseShortcut(ctx, deps);

    expect(result).toBe(ctx);
  });

  // Case 5: short-circuit carries data payload exactly (no transformation)
  it('PipelineShortCircuit.data is exactly result.data with no transformation', async () => {
    const rawData = { bytes: Buffer.from('hello'), streamId: 'abc-123' };
    const ctx = makeCtx({ raw: true, data: rawData });
    const deps = makeDeps();

    let caught: PipelineShortCircuit | undefined;
    try {
      await rawResponseShortcut(ctx, deps);
    } catch (err) {
      caught = err as PipelineShortCircuit;
    }

    expect(caught).toBeInstanceOf(PipelineShortCircuit);
    expect(caught?.data).toBe(rawData); // strict reference equality — no copy
  });

  // Case 6: raw: true → logger.info is called with action name
  it('raw: true → logs info with action name before short-circuiting', async () => {
    const ctx = makeCtx({ raw: true, data: 'stream' });
    const deps = makeDeps();

    await expect(rawResponseShortcut(ctx, deps)).rejects.toBeInstanceOf(PipelineShortCircuit);
    expect(deps.logger?.info).toHaveBeenCalledWith('Action returning raw response', 'test.action');
  });
});
