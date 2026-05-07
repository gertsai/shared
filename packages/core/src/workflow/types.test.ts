// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from 'vitest';

import type { WorkflowSignal, WorkflowSignalMeta } from './types';

/**
 * Lightweight runtime-shape tests for the additive `WorkflowSignal.meta`
 * field introduced in Sprint 3.0.1 (F-9). These do not exercise an
 * adapter — full wiring coverage lives in `@gertsai/api-core`'s adapter
 * tests. The intent here is to:
 *  - prove `meta` is structurally optional (signals built without it
 *    still satisfy the interface),
 *  - prove `meta`'s individual fields are independently optional,
 *  - guard against accidental non-additive changes to the contract.
 */
describe('WorkflowSignal.meta (F-9)', () => {
  it('accepts a signal without meta (backward-compatible shape)', () => {
    const ctrl = new AbortController();
    const signal: WorkflowSignal = {
      runId: 'run-1',
      abort: ctrl.signal,
    };
    expect(signal.meta).toBeUndefined();
  });

  it('accepts a signal with a partially-populated meta', () => {
    const ctrl = new AbortController();
    const meta: WorkflowSignalMeta = { tenantId: 't-42' };
    const signal: WorkflowSignal = {
      runId: 'run-2',
      abort: ctrl.signal,
      meta,
    };
    expect(signal.meta?.tenantId).toBe('t-42');
    expect(signal.meta?.userId).toBeUndefined();
    expect(signal.meta?.correlationId).toBeUndefined();
  });

  it('accepts a fully-populated meta', () => {
    const ctrl = new AbortController();
    const signal: WorkflowSignal = {
      runId: 'run-3',
      abort: ctrl.signal,
      meta: {
        tenantId: 't-1',
        userId: 'u-1',
        correlationId: 'c-1',
      },
    };
    expect(signal.meta).toEqual({
      tenantId: 't-1',
      userId: 'u-1',
      correlationId: 'c-1',
    });
  });
});
