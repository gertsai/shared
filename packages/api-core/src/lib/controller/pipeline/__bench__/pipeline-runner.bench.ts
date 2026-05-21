// SPDX-License-Identifier: Apache-2.0
/**
 * Pipeline runner bench harness.
 *
 * Wave 27 PR-5 (PRD-065 NFR perf / RFC-027 §Bench plan).
 *
 * Measures p50/p95/p99 of full 11-stage pipeline run with a synthetic
 * zero-work handler. Used to verify NFR: p95 increase ≤2% vs the
 * pre-extraction baseline.
 *
 * NOTE: This PR establishes the harness only — no recorded baseline yet.
 * The pre-extraction baseline was not captured before PR-1. The harness
 * provides a repeatable regression-detection baseline going forward.
 *
 * Run: `pnpm --filter @gertsai/api-core exec vitest bench --run`
 */

import { bench, describe } from 'vitest';
import { UserType, defaultSession } from '@gertsai/core';
import type { LoggerInstance } from 'moleculer';

import { PipelineRunner } from '../runner';
import { DEFAULT_STAGES } from '../default-stages';
import type { PipelineContext, PipelineDeps } from '../types';
import { ResponseCode } from '../../../apiResponse';

// ---------------------------------------------------------------------------
// Zero-work action stub — handler immediately returns a valid result
// ---------------------------------------------------------------------------

const zeroWorkActionOptions = {
  auth: 'none' as const,
  rest: 'GET /bench',
  handler: async (ctx: any) => ctx.respond({ ok: true }),
  params: undefined,
  response: undefined,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const zeroWorkAction: PipelineDeps['action'] = {
  name: 'bench.action',
  rest: 'GET /bench',
  path: 'bench.action',
  options: {
    ...zeroWorkActionOptions,
    // Minimal validator stubs — always pass, zero overhead
    params: { validate: () => ({ success: true, data: {} }) } as any,
    response: { validate: () => ({ success: true, data: { ok: true } }) } as any,
  } as any,
} as any;

// ---------------------------------------------------------------------------
// Minimal synthetic Moleculer context — no network, no I/O
// ---------------------------------------------------------------------------

const syntheticCtx: PipelineContext['ctx'] = {
  params: {},
  meta: {},
  call: async () => undefined,
} as any;

// ---------------------------------------------------------------------------
// Session factory stub
// ---------------------------------------------------------------------------

const benchSession = defaultSession('bench-user', UserType.USER, 'api', 'v0.0.0');
const sessionFactory = (_uuid: string, _type: UserType) => benchSession;

// ---------------------------------------------------------------------------
// Logger stub — no-op, so log I/O doesn't distort measurements
// ---------------------------------------------------------------------------

const noopLogger: LoggerInstance = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  fatal: () => undefined,
  debug: () => undefined,
  trace: () => undefined,
};

// ---------------------------------------------------------------------------
// Service stub — zero overhead
// ---------------------------------------------------------------------------

const benchService = { logger: noopLogger } as any;

// ---------------------------------------------------------------------------
// Controller stub — zero overhead
// ---------------------------------------------------------------------------

const benchController = {} as any;

// ---------------------------------------------------------------------------
// Bench suite
// ---------------------------------------------------------------------------

describe('PipelineRunner — full 11-stage pipeline (synthetic)', () => {
  bench(
    'zero-work handler, auth=none, no session',
    async () => {
      const deps: PipelineDeps = {
        action: zeroWorkAction,
        controller: benchController,
        service: benchService,
        logger: noopLogger,
        sessionFactory,
      };

      const initial: PipelineContext = { ctx: syntheticCtx };
      const runner = new PipelineRunner(DEFAULT_STAGES);
      await runner.run(initial, deps);
    },
    { iterations: 200, time: 2000 },
  );

  bench(
    'zero-work handler with wrapResponse producing SUCCESS envelope',
    async () => {
      // Reduced stage list to just the wrap stage — measures envelope overhead alone
      const wrapOnlyDeps: PipelineDeps = {
        action: zeroWorkAction,
        controller: benchController,
        service: benchService,
        logger: noopLogger,
        sessionFactory,
      };

      // Pre-seeded result to skip straight to wrapResponse
      const seededCtx: PipelineContext = {
        ctx: syntheticCtx,
        params: {},
        result: { code: ResponseCode.SUCCESS, data: { ok: true } },
      };

      const runner = new PipelineRunner(DEFAULT_STAGES.slice(-1)); // only wrapResponse
      await runner.run(seededCtx, wrapOnlyDeps);
    },
    { iterations: 500, time: 2000 },
  );
});
