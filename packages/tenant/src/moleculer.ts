// SPDX-License-Identifier: Apache-2.0
/**
 * @gertsai/tenant/moleculer — Moleculer-shape adapter.
 *
 * Lifts tenantId from Moleculer Context (`ctx.meta.tenantId`).
 * Lazy import — does NOT couple non-Moleculer consumers to moleculer types.
 */
import type { Context } from 'moleculer';
import {
  getTenantIdOptional as getTenantIdOptionalRoot,
  getTenantIdStrict as getTenantIdStrictRoot,
  type TenantId,
} from './index';

/**
 * Read `ctx.meta.tenantId` from a Moleculer Context. Returns `undefined` when
 * absent or empty (use `getMoleculerTenantIdStrict` to enforce presence).
 */
export function getMoleculerTenantId(ctx: Context): TenantId | undefined {
  return getTenantIdOptionalRoot({ meta: ctx?.meta as { tenantId?: string } | undefined });
}

/**
 * Read `ctx.meta.tenantId` from a Moleculer Context, throwing
 * `MissingTenantIdError` when the value is missing or empty.
 */
export function getMoleculerTenantIdStrict(ctx: Context): TenantId {
  return getTenantIdStrictRoot({ meta: ctx?.meta as { tenantId?: string } | undefined });
}

/**
 * Moleculer middleware factory that validates `ctx.meta.tenantId` is present
 * before any action runs. Throws `MissingTenantIdError` if absent.
 *
 * @example
 * import { tenantMiddleware } from '@gertsai/tenant/moleculer';
 *
 * export default {
 *   middlewares: [tenantMiddleware()],
 * };
 */
export function tenantMiddleware(): {
  name: string;
  localAction(
    handler: (ctx: Context) => unknown,
    action: { name: string },
  ): (ctx: Context) => unknown;
} {
  return {
    name: 'TenantValidator',
    localAction(handler, _action) {
      return function tenantWrapped(ctx: Context) {
        getMoleculerTenantIdStrict(ctx);
        return handler(ctx);
      };
    },
  };
}
