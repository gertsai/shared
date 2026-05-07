// SPDX-License-Identifier: Apache-2.0
/**
 * @gertsai/tenant — language-neutral tenant primitives.
 *
 * Pure types + helpers. NO Moleculer/HTTP coupling — runtime adapters live in
 * subpaths (e.g. `@gertsai/tenant/moleculer`). This split lets non-Moleculer
 * consumers use the tenant types without pulling Moleculer into their bundle.
 */

/**
 * Branded `TenantId` — a non-empty string tagged so the type system can
 * distinguish a validated tenant identifier from an arbitrary string.
 *
 * @example
 * declare const raw: string;
 * const tid: TenantId = asTenantId(raw); // throws if empty
 */
export type TenantId = string & { readonly __brand: 'TenantId' };

/**
 * A context that *requires* a tenant identifier.
 */
export interface TenantContext {
  readonly tenantId: string;
}

/**
 * A context that may carry a tenant identifier.
 */
export interface MaybeTenantContext {
  readonly tenantId?: string | undefined;
}

/**
 * The shape every tenant-aware adapter targets: an object exposing optional
 * `meta.tenantId`. Matches Moleculer's `Context` shape but is structurally
 * compatible with any framework/transport that places per-call metadata under
 * `meta`.
 */
export interface TenantBearingContext {
  readonly meta?: MaybeTenantContext;
}

/**
 * Thrown by `getTenantIdStrict` (and adapters that wrap it) when the incoming
 * context lacks a non-empty `meta.tenantId`.
 */
export class MissingTenantIdError extends Error {
  constructor() {
    super('Tenant ID is required but was missing from context.meta.tenantId');
    this.name = 'MissingTenantIdError';
  }
}

/**
 * Read `ctx.meta.tenantId` and require it to be a non-empty string.
 *
 * @throws {MissingTenantIdError} If `ctx.meta.tenantId` is missing or empty.
 * @returns The tenant id, narrowed to the `TenantId` brand.
 */
export function getTenantIdStrict(ctx: TenantBearingContext): TenantId {
  const tid = ctx?.meta?.tenantId;
  if (typeof tid !== 'string' || tid.length === 0) {
    throw new MissingTenantIdError();
  }
  return tid as TenantId;
}

/**
 * Read `ctx.meta.tenantId` if present and non-empty, otherwise return
 * `undefined`. Use this for code paths that gracefully degrade when the call
 * is unscoped (system jobs, health checks, etc.).
 */
export function getTenantIdOptional(ctx: TenantBearingContext): TenantId | undefined {
  const tid = ctx?.meta?.tenantId;
  return typeof tid === 'string' && tid.length > 0 ? (tid as TenantId) : undefined;
}

/**
 * Cast a raw string into the `TenantId` brand after a minimal non-empty check.
 *
 * Callers are responsible for additional validation (regex, allow-list, etc.)
 * — this helper exists so the brand stays opaque outside the package without
 * forcing every call site to write its own cast.
 *
 * @throws {TypeError} If `value` is not a non-empty string.
 */
export function asTenantId(value: string): TenantId {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError('asTenantId: value must be a non-empty string');
  }
  return value as TenantId;
}
