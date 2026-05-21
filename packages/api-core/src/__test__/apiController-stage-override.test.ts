// SPDX-License-Identifier: Apache-2.0
/**
 * ApiController.setStageOverride unit tests.
 *
 * Wave 27 PR-5 (PRD-065 FR-3 / RFC-027 §PR-5).
 *
 * AC coverage:
 *   AC-SO-1: setStageOverride replaces a named stage for newly-built schemas
 *   AC-SO-2: Overrides are captured at schema-build time (snapshot isolation)
 *   AC-SO-3: Already-registered actions retain original pipeline (set-after-register has no effect)
 *   AC-SO-4: Multiple overrides on different stages compose correctly
 */

import { describe, it, expect, vi } from 'vitest';
import typia from 'typia';

import { ApiController, ResponseCode } from '..';
import type { Stage } from '../lib/controller/pipeline/types';
import {
  moleculerServiceMock,
  validParamsContextMock,
  sessionMock,
  validParamsMock,
  validResponseMock,
} from './__mocks__';

// ---------------------------------------------------------------------------
// Typia validators reused across tests (identical shape to apiController.test.ts)
// ---------------------------------------------------------------------------

const paramsValidate = typia.createValidate<typeof validParamsMock>();
const responseValidate = typia.createValidate<typeof validResponseMock>();

const baseActionOptions = {
  auth: 'none' as const,
  rest: 'GET /:param1',
  params: paramsValidate,
  response: responseValidate,
  handler(ctx: any) {
    return ctx.respond({ var1: ctx.params.param1, var2: ctx.params.param2 });
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a fresh controller with a unique name to avoid global registry collisions. */
let _ctr = 0;
function freshController() {
  return new ApiController({ version: 'v1', name: `so_svc_${++_ctr}` });
}

/** Build minimal PipelineDeps-compatible mock action for _createActionSchema.
 *  Returns as `any` because the test calls `_createActionSchema` with the result
 *  and the inferred TypiaParamsWithSchema vs TypiaValidator generic narrowing
 *  doesn't widen cleanly across the assignable boundary. Cast is test-only. */
function makeRegisteredAction(controller: ApiController<any, any, any, any>): any {
  // Cast inputs: typia validators + Moleculer rest-string have complex inferred shape that
  // doesn't widen cleanly to ActionOptions's RestConfig union; baseActionOptions is
  // structurally correct for `register()` per Moleculer's runtime contract.
  return controller.register(`action_${_ctr}`, baseActionOptions as any);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ApiController.setStageOverride', () => {
  ApiController.configure({ sessionFactory: () => sessionMock });

  // AC-SO-1: Override replaces the named stage in newly-built schemas
  it('setStageOverride replaces a single named stage for new action schemas', async () => {
    const controller = freshController();
    const callLog: string[] = [];

    // Custom extractParams that records a marker and populates ctx.params so
    // downstream stages (coerceQueryString etc.) receive a valid context.
    const customExtract: Stage = async (ctx, _deps) => {
      callLog.push('custom-extract');
      return { ...ctx, params: ctx.ctx.params ?? {} };
    };

    controller.setStageOverride('extractParams', customExtract);

    const action = makeRegisteredAction(controller);
    const schema = controller['_createActionSchema'](action);

    await schema.handler.call(moleculerServiceMock, validParamsContextMock);

    expect(callLog).toContain('custom-extract');
  });

  // AC-SO-1 variant: Override for a stage OTHER than extractParams does not affect extractParams
  it('override on one stage does not affect other stages', async () => {
    const controller = freshController();
    const callLog: string[] = [];

    // Override wrapResponse only — earlier stages should still run
    const customWrap: Stage = async (ctx, _deps) => {
      callLog.push('custom-wrap');
      // Produce a valid result shape so runner returns an envelope
      return {
        ...ctx,
        result: { code: ResponseCode.SUCCESS, message: undefined, data: { wrapped: true } },
      };
    };

    controller.setStageOverride('wrapResponse', customWrap);

    const action = makeRegisteredAction(controller);
    const schema = controller['_createActionSchema'](action);

    const result = await schema.handler.call(moleculerServiceMock, validParamsContextMock);

    expect(callLog).toContain('custom-wrap');
    // Result should carry the override's envelope
    expect(result).toMatchObject({ success: true, data: { wrapped: true } });
  });

  // AC-SO-2: Overrides are captured as a snapshot at schema-build time
  it('override set AFTER _createActionSchema does NOT affect the already-built handler', async () => {
    const controller = freshController();

    const action = makeRegisteredAction(controller);
    // Build schema BEFORE setting the override
    const schemaBefore = controller['_createActionSchema'](action);

    const neverCalled: Stage = vi.fn().mockImplementation(async (ctx) => ctx);
    controller.setStageOverride('extractParams', neverCalled);

    // schemaBefore's handler closure captured the override-free stage list
    await schemaBefore.handler.call(moleculerServiceMock, validParamsContextMock);

    expect(neverCalled).not.toHaveBeenCalled();
  });

  // AC-SO-3: Already-registered action schemas retain original pipeline — set-after-register
  it('override applied after register() has no effect on previously generated schema', async () => {
    const controller = freshController();

    // Register action and immediately generate schema (simulates generateServiceSchema path)
    const action = makeRegisteredAction(controller);
    const schemaOriginal = controller['_createActionSchema'](action);

    const neverCalled: Stage = vi.fn().mockImplementation(async (ctx) => ctx);
    controller.setStageOverride('validateRequest', neverCalled);

    // The original schema's closure already has effectiveStages without the override
    await schemaOriginal.handler.call(moleculerServiceMock, validParamsContextMock);

    expect(neverCalled).not.toHaveBeenCalled();
  });

  // AC-SO-4: Multiple overrides on different stages compose correctly
  it('multiple overrides on different stages all apply to new schemas', async () => {
    const controller = freshController();
    const callLog: string[] = [];

    // customExtract populates params so downstream stages work correctly
    const customExtract: Stage = async (ctx, _deps) => {
      callLog.push('custom-extract');
      return { ...ctx, params: ctx.ctx.params ?? {} };
    };

    const customInject: Stage = async (ctx, _deps) => {
      callLog.push('custom-inject');
      return ctx;
    };

    controller.setStageOverride('extractParams', customExtract);
    controller.setStageOverride('injectTenantId', customInject);

    const action = makeRegisteredAction(controller);
    const schema = controller['_createActionSchema'](action);

    await schema.handler.call(moleculerServiceMock, validParamsContextMock);

    expect(callLog).toContain('custom-extract');
    expect(callLog).toContain('custom-inject');
    // Both should have been called (order: extract before inject per STAGE_NAMES order)
    expect(callLog.indexOf('custom-extract')).toBeLessThan(callLog.indexOf('custom-inject'));
  });
});
