// SPDX-License-Identifier: Apache-2.0
/**
 * ApiController.setStageOverride unit tests.
 *
 * Wave 27 PR-5 (PRD-065 FR-3 / RFC-027 §PR-5).
 * Wave 32.E (EVID-083 HIGH-4 follow-up) — sensitive-stage warn-on-override.
 *
 * AC coverage:
 *   AC-SO-1: setStageOverride replaces a named stage for newly-built schemas
 *   AC-SO-2: Overrides are captured at schema-build time (snapshot isolation)
 *   AC-SO-3: Already-registered actions retain original pipeline (set-after-register has no effect)
 *   AC-SO-4: Multiple overrides on different stages compose correctly
 *   AC-SO-5: console.warn fires when overriding a sensitive stage (Wave 32.E)
 *   AC-SO-6: console.warn does NOT fire for non-sensitive stage override (Wave 32.E)
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

  // ---------------------------------------------------------------------------
  // Wave 32.E follow-up to Phase D (EVID-083 HIGH-4) — sensitive-stage warn
  // ---------------------------------------------------------------------------

  // AC-SO-5 — Wave 32.E follow-up to Phase D (EVID-083 HIGH-4):
  // setStageOverride must emit a console.warn (broker fallback when broker is
  // not yet started at call time) when overriding a sensitive stage such as
  // 'establishAuthSession'. Verifies HIGH-4 implementation is observable.
  it("logs console.warn when overriding a sensitive stage 'establishAuthSession' (Wave 32.E / EVID-083 HIGH-4)", () => {
    const controller = freshController();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const customAuth: Stage = async (ctx) => ctx;
    controller.setStageOverride('establishAuthSession', customAuth);

    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringMatching(/SENSITIVE stage 'establishAuthSession' overridden/),
    );

    warnSpy.mockRestore();
  });

  // AC-SO-6 — Wave 32.E: overriding a non-sensitive stage must NOT emit a warning.
  // Ensures the warn is scoped only to the SENSITIVE_STAGES set.
  it('does NOT log console.warn when overriding a non-sensitive stage (Wave 32.E)', () => {
    const controller = freshController();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const customExtract: Stage = async (ctx) => ctx;
    controller.setStageOverride('extractParams', customExtract);

    expect(warnSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  // ---------------------------------------------------------------------------
  // Wave 34.A (EVID-083 W3) — addStageBefore / addStageAfter / wrapStage
  //
  // AC-A1: addStageBefore injects a stage that runs BEFORE the anchor.
  // AC-A2: multiple addStageBefore calls compose in INSERTION ORDER.
  // AC-A3: addStageAfter injects a stage that runs AFTER the anchor.
  // AC-A4: wrapStage produces around-advice (pre + post hook).
  // AC-A5: multiple wrapStage calls compose ONION-STYLE — LAST-pushed wrapper
  //        is OUTERMOST (runs first/last around the chain).
  // AC-A6: addStageBefore on a SENSITIVE anchor emits console.warn.
  // ---------------------------------------------------------------------------

  // AC-A1: addStageBefore injects a stage that runs BEFORE the anchor.
  it('addStageBefore injects a stage that runs before the anchor (Wave 34.A / EVID-083 W3)', async () => {
    const controller = freshController();
    const callLog: string[] = [];

    const beforeExtract: Stage = async (ctx, _deps) => {
      callLog.push('before-extract');
      return ctx;
    };

    // Override extractParams so we can observe relative ordering deterministically.
    const recordExtract: Stage = async (ctx, _deps) => {
      callLog.push('anchor-extract');
      return { ...ctx, params: ctx.ctx.params ?? {} };
    };

    controller.setStageOverride('extractParams', recordExtract);
    controller.addStageBefore('extractParams', beforeExtract);

    const action = makeRegisteredAction(controller);
    const schema = controller['_createActionSchema'](action);

    await schema.handler.call(moleculerServiceMock, validParamsContextMock);

    expect(callLog).toContain('before-extract');
    expect(callLog).toContain('anchor-extract');
    expect(callLog.indexOf('before-extract')).toBeLessThan(callLog.indexOf('anchor-extract'));
  });

  // AC-A2: multiple addStageBefore calls compose in INSERTION ORDER.
  // First-pushed runs first → effective order: A → B → anchor.
  it('addStageBefore multiple calls compose in insertion order (Wave 34.A)', async () => {
    const controller = freshController();
    const callLog: string[] = [];

    const beforeA: Stage = async (ctx, _deps) => {
      callLog.push('A');
      return ctx;
    };
    const beforeB: Stage = async (ctx, _deps) => {
      callLog.push('B');
      return ctx;
    };
    const anchor: Stage = async (ctx, _deps) => {
      callLog.push('anchor');
      return { ...ctx, params: ctx.ctx.params ?? {} };
    };

    controller.setStageOverride('extractParams', anchor);
    controller.addStageBefore('extractParams', beforeA);
    controller.addStageBefore('extractParams', beforeB);

    const action = makeRegisteredAction(controller);
    const schema = controller['_createActionSchema'](action);

    await schema.handler.call(moleculerServiceMock, validParamsContextMock);

    // First-pushed (A) runs first, then B, then anchor.
    expect(callLog.indexOf('A')).toBeLessThan(callLog.indexOf('B'));
    expect(callLog.indexOf('B')).toBeLessThan(callLog.indexOf('anchor'));
  });

  // AC-A3: addStageAfter injects a stage that runs AFTER the anchor.
  it('addStageAfter injects a stage that runs after the anchor (Wave 34.A)', async () => {
    const controller = freshController();
    const callLog: string[] = [];

    const recordExtract: Stage = async (ctx, _deps) => {
      callLog.push('anchor-extract');
      return { ...ctx, params: ctx.ctx.params ?? {} };
    };
    const afterExtract: Stage = async (ctx, _deps) => {
      callLog.push('after-extract');
      return ctx;
    };

    controller.setStageOverride('extractParams', recordExtract);
    controller.addStageAfter('extractParams', afterExtract);

    const action = makeRegisteredAction(controller);
    const schema = controller['_createActionSchema'](action);

    await schema.handler.call(moleculerServiceMock, validParamsContextMock);

    expect(callLog).toContain('anchor-extract');
    expect(callLog).toContain('after-extract');
    expect(callLog.indexOf('anchor-extract')).toBeLessThan(callLog.indexOf('after-extract'));
  });

  // AC-A4: wrapStage produces around-advice (pre + post hook around the anchor).
  it('wrapStage runs wrapper around the anchor (pre + post) (Wave 34.A)', async () => {
    const controller = freshController();
    const callLog: string[] = [];

    const anchor: Stage = async (ctx, _deps) => {
      callLog.push('anchor');
      return { ...ctx, params: ctx.ctx.params ?? {} };
    };

    const aroundWrap = (next: Stage): Stage => async (ctx, deps) => {
      callLog.push('pre');
      const result = await next(ctx, deps);
      callLog.push('post');
      return result;
    };

    controller.setStageOverride('extractParams', anchor);
    controller.wrapStage('extractParams', aroundWrap);

    const action = makeRegisteredAction(controller);
    const schema = controller['_createActionSchema'](action);

    await schema.handler.call(moleculerServiceMock, validParamsContextMock);

    expect(callLog).toEqual(expect.arrayContaining(['pre', 'anchor', 'post']));
    expect(callLog.indexOf('pre')).toBeLessThan(callLog.indexOf('anchor'));
    expect(callLog.indexOf('anchor')).toBeLessThan(callLog.indexOf('post'));
  });

  // AC-A5: multiple wrapStage calls compose ONION-STYLE.
  // First-pushed = INNERMOST (closest to anchor), last-pushed = OUTERMOST.
  // Effective stage = wrapLast(...wrapFirst(default)) → wrapLast pre runs FIRST,
  // wrapLast post runs LAST. Order around anchor:
  //   outerPre → innerPre → anchor → innerPost → outerPost
  it('wrapStage multiple wrappers compose onion-style — last-pushed is outermost (Wave 34.A)', async () => {
    const controller = freshController();
    const callLog: string[] = [];

    const anchor: Stage = async (ctx, _deps) => {
      callLog.push('anchor');
      return { ...ctx, params: ctx.ctx.params ?? {} };
    };

    // Inner wrapper — pushed FIRST → becomes innermost.
    const innerWrap = (next: Stage): Stage => async (ctx, deps) => {
      callLog.push('inner-pre');
      const result = await next(ctx, deps);
      callLog.push('inner-post');
      return result;
    };

    // Outer wrapper — pushed LAST → becomes outermost (runs first/last).
    const outerWrap = (next: Stage): Stage => async (ctx, deps) => {
      callLog.push('outer-pre');
      const result = await next(ctx, deps);
      callLog.push('outer-post');
      return result;
    };

    controller.setStageOverride('extractParams', anchor);
    controller.wrapStage('extractParams', innerWrap); // pushed first
    controller.wrapStage('extractParams', outerWrap); // pushed last

    const action = makeRegisteredAction(controller);
    const schema = controller['_createActionSchema'](action);

    await schema.handler.call(moleculerServiceMock, validParamsContextMock);

    // outer-pre runs BEFORE inner-pre; inner-post runs BEFORE outer-post.
    expect(callLog.indexOf('outer-pre')).toBeLessThan(callLog.indexOf('inner-pre'));
    expect(callLog.indexOf('inner-pre')).toBeLessThan(callLog.indexOf('anchor'));
    expect(callLog.indexOf('anchor')).toBeLessThan(callLog.indexOf('inner-post'));
    expect(callLog.indexOf('inner-post')).toBeLessThan(callLog.indexOf('outer-post'));
  });

  // AC-A6: addStageBefore on a SENSITIVE anchor emits console.warn.
  // Reuses SENSITIVE_STAGES set (Wave 32.D) — observable proof that W3
  // extension API plumbs the same security warning channel.
  it('addStageBefore on a sensitive anchor emits console.warn (Wave 34.A / EVID-083 W3)', () => {
    const controller = freshController();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const noop: Stage = async (ctx) => ctx;
    controller.addStageBefore('establishAuthSession', noop);

    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringMatching(/SENSITIVE stage 'establishAuthSession' modified/),
    );

    warnSpy.mockRestore();
  });
});
