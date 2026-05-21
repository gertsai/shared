// SPDX-License-Identifier: Apache-2.0
/**
 * cleanup (Stage 13) unit tests.
 *
 * Wave 27 (PRD-065 / RFC-027 PR-1 AC — 3 cases):
 *   1. Logs 'Action finished'
 *   2. Calls session.$destroy() if session is present
 *   3. No-op if session is undefined
 */

import { describe, it, expect, vi } from 'vitest';
import { cleanup } from '../cleanup';
import type { PipelineContext, PipelineDeps } from '../../types';

// ---------------------------------------------------------------------------
// Minimal fixtures
// ---------------------------------------------------------------------------

function makeCtx(overrides?: Partial<PipelineContext>): PipelineContext {
  return {
    ctx: {} as PipelineContext['ctx'],
    ...overrides,
  };
}

function makeDeps(overrides?: Partial<PipelineDeps>): PipelineDeps {
  return {
    action: {
      name: 'test.cleanup-action',
      rest: undefined,
      path: 'test.cleanup-action',
      options: {} as PipelineDeps['action']['options'],
    } as PipelineDeps['action'],
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('cleanup (Stage 13)', () => {
  // Case 1: Logs 'Action finished'
  it("logs 'Action finished' with the action name", async () => {
    const deps = makeDeps();
    const ctx = makeCtx();

    await cleanup(ctx, deps);

    expect(deps.logger?.info).toHaveBeenCalledWith('Action finished', 'test.cleanup-action');
    expect(deps.logger?.info).toHaveBeenCalledOnce();
  });

  // Case 2: Calls session.$destroy() when session is present
  it('calls session.$destroy() when a session is present', async () => {
    const destroySpy = vi.fn();
    const ctx = makeCtx({
      session: { $destroy: destroySpy } as unknown as PipelineContext['session'],
    });
    const deps = makeDeps();

    await cleanup(ctx, deps);

    expect(destroySpy).toHaveBeenCalledOnce();
  });

  // Case 3: No-op if session is undefined
  it('does not throw and completes cleanly when session is undefined', async () => {
    const ctx = makeCtx({ session: undefined });
    const deps = makeDeps();

    await expect(cleanup(ctx, deps)).resolves.toBeUndefined();
    // logger.info still fires for the 'Action finished' log
    expect(deps.logger?.info).toHaveBeenCalledOnce();
  });

  // Edge: logger is undefined (no-op, no crash)
  it('does not throw when logger is undefined', async () => {
    const ctx = makeCtx();
    const deps = makeDeps({ logger: undefined });

    await expect(cleanup(ctx, deps)).resolves.toBeUndefined();
  });
});
