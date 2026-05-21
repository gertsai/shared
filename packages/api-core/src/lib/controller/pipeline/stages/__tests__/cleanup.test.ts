// SPDX-License-Identifier: Apache-2.0
/**
 * cleanup (Stage 13) unit tests.
 *
 * Wave 27 (PRD-065 / RFC-027 PR-1 AC — 3 cases):
 *   1. Logs 'Action finished'
 *   2. Calls session.$destroy() if session is present
 *   3. No-op if session is undefined
 * Wave 32.E (EVID-083 HIGH-10):
 *   5. session.$destroy() throw propagates (no internal try/catch in cleanup.ts)
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

  // Wave 33.C (EVID-083 W4) — cleanup awaits an async session.$destroy() result.
  // Before W4 the call was `ctx.session?.$destroy()` (no await), which would
  // silently lose rejections from a future async $destroy implementation.
  // Verify the await contract by passing a Promise-returning $destroy and
  // observing that cleanup waits for it.
  it('awaits async session.$destroy() (Wave 33.C / EVID-083 W4)', async () => {
    let destroyResolved = false;
    const destroySpy = vi.fn().mockImplementation(
      () =>
        new Promise<void>((resolve) =>
          setTimeout(() => {
            destroyResolved = true;
            resolve();
          }, 5),
        ),
    );
    const ctx = makeCtx({
      session: { $destroy: destroySpy } as unknown as PipelineContext['session'],
    });
    const deps = makeDeps();

    await cleanup(ctx, deps);

    expect(destroySpy).toHaveBeenCalledOnce();
    expect(destroyResolved).toBe(true);
  });

  // Case 5 — Wave 32.E (EVID-083 HIGH-10)
  // cleanup.ts has NO internal try/catch around $destroy() (verified: line 25
  // is a bare `ctx.session?.$destroy()` with no surrounding try/catch).
  // PipelineRunner wraps cleanup in its own finally/catch, but at the unit level
  // cleanup itself propagates. This test confirms that invariant so any future
  // internal-try/catch addition must be an intentional, reviewed change.
  it('propagates when session.$destroy() throws (Wave 32.E / EVID-083 HIGH-10)', async () => {
    const destroyError = new Error('destroy boom');
    const ctx = makeCtx({
      session: {
        $destroy: vi.fn().mockImplementation(() => {
          throw destroyError;
        }),
      } as unknown as PipelineContext['session'],
    });
    const deps = makeDeps();

    await expect(cleanup(ctx, deps)).rejects.toThrow('destroy boom');
    expect(ctx.session!.$destroy).toHaveBeenCalledOnce();
  });
});
