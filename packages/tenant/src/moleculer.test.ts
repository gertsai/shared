// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, vi } from 'vitest';
import type { Context } from 'moleculer';
import { MissingTenantIdError } from './index';
import {
  getMoleculerTenantId,
  getMoleculerTenantIdStrict,
  tenantMiddleware,
} from './moleculer';

/**
 * Build a minimal Moleculer-shaped Context. We only exercise `ctx.meta`, so
 * casting through `unknown` keeps the test free of the full Moleculer type
 * surface (which is large and not under test here).
 */
function makeCtx(meta: { tenantId?: string } | undefined): Context {
  return { meta } as unknown as Context;
}

describe('@gertsai/tenant/moleculer — adapter', () => {
  describe('getMoleculerTenantId', () => {
    it('returns undefined when meta is empty', () => {
      expect(getMoleculerTenantId(makeCtx({}))).toBeUndefined();
    });

    it('returns the branded id on valid meta', () => {
      const tid = getMoleculerTenantId(makeCtx({ tenantId: 'demo' }));
      expect(tid).toBe('demo');
    });
  });

  describe('getMoleculerTenantIdStrict', () => {
    it('throws MissingTenantIdError when tenantId is missing', () => {
      expect(() => getMoleculerTenantIdStrict(makeCtx({}))).toThrow(MissingTenantIdError);
    });

    it('returns the branded id when present', () => {
      const tid = getMoleculerTenantIdStrict(makeCtx({ tenantId: 'acme' }));
      expect(tid).toBe('acme');
    });
  });

  describe('tenantMiddleware', () => {
    it('returns a middleware object with name="TenantValidator"', () => {
      const mw = tenantMiddleware();
      expect(mw.name).toBe('TenantValidator');
      expect(typeof mw.localAction).toBe('function');
    });

    it('throws MissingTenantIdError when ctx has no tenantId', () => {
      const mw = tenantMiddleware();
      const handler = vi.fn(() => 'ok');
      const wrapped = mw.localAction(handler, { name: 'svc.action' });

      expect(() => wrapped(makeCtx({}))).toThrow(MissingTenantIdError);
      expect(handler).not.toHaveBeenCalled();
    });

    it('passes through to the handler when tenantId is present', () => {
      const mw = tenantMiddleware();
      const handler = vi.fn(() => 'ok');
      const wrapped = mw.localAction(handler, { name: 'svc.action' });

      const ctx = makeCtx({ tenantId: 'acme' });
      const result = wrapped(ctx);

      expect(result).toBe('ok');
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(ctx);
    });
  });
});
