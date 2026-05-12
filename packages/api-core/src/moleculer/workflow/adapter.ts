// SPDX-License-Identifier: Apache-2.0
import type { WorkflowDefinition, WorkflowSignal, WorkflowSignalMeta } from '@gertsai/core';
import type { Context } from 'moleculer';

/**
 * Moleculer-flavoured workflow schema produced from a language-neutral
 * `WorkflowDefinition`. Shape mirrors the contract expected by
 * `@moleculer/workflows` (name, version, params, handler).
 */
export interface MoleculerWorkflowSchema {
  name: string;
  version: number;
  /**
   * fastestValidator-compatible schema literal. Tightened from `object` to
   * `Readonly<Record<string, unknown>>` (Sprint 3.0.1, F-2): structural
   * supertype of the `as const` literals consumers commonly write.
   */
  params?: Readonly<Record<string, unknown>>;
  handler: (this: unknown, ctx: Context) => Promise<unknown>;
}

/**
 * Pull tenant / user / correlation hints from a Moleculer `ctx.meta` blob.
 *
 * `ctx.meta` is `unknown` at the contract level (different runtimes shape it
 * differently and middlewares may inject fields), so we read defensively:
 *  - require `meta` to be a non-null object,
 *  - copy each field only when it is a string,
 *  - return `undefined` if no field survives the filter, so the resulting
 *    `WorkflowSignal` simply omits `meta` rather than carrying an empty bag.
 *
 * Pure: no side effects, no `ctx` access beyond the `meta` read.
 *
 * @param ctx Moleculer call context (or any object with an optional `meta`).
 * @returns Populated `WorkflowSignalMeta`, or `undefined` if nothing matched.
 */
export function extractWorkflowMeta(ctx: unknown): WorkflowSignalMeta | undefined {
  const ctxMeta = (ctx as { meta?: unknown } | null | undefined)?.meta;
  if (!ctxMeta || typeof ctxMeta !== 'object') {
    return undefined;
  }
  const m = ctxMeta as Record<string, unknown>;
  const out: { tenantId?: string; userId?: string; correlationId?: string } = {};
  if (typeof m.tenantId === 'string') out.tenantId = m.tenantId;
  if (typeof m.userId === 'string') out.userId = m.userId;
  if (typeof m.correlationId === 'string') out.correlationId = m.correlationId;
  return out.tenantId === undefined &&
    out.userId === undefined &&
    out.correlationId === undefined
    ? undefined
    : out;
}

/**
 * Adapt a language-neutral `WorkflowDefinition<I, O>` into the
 * Moleculer-flavoured schema. The synthesized handler:
 *  - extracts `runId` from `ctx.id` (falling back to a deterministic stamp),
 *  - threads an `AbortSignal` from `ctx.locals.abortSignal` if the runtime
 *    publishes one, otherwise provides a fresh `AbortController().signal`,
 *  - (Sprint 3.0.1, F-9) attaches optional `meta` lifted from `ctx.meta`
 *    when at least one of `tenantId` / `userId` / `correlationId` is present,
 *  - forwards `ctx.params` typed as the workflow's input.
 *
 * @param name Workflow registration name (becomes `schema.name`).
 * @param def  Source `WorkflowDefinition`.
 * @returns Moleculer-compatible workflow schema.
 */
export function adaptWorkflowDefinition<I, O>(
  name: string,
  def: WorkflowDefinition<I, O>,
): MoleculerWorkflowSchema {
  return {
    name,
    version: def.version,
    ...(def.params !== undefined && { params: def.params }),
    handler: async function moleculerHandler(this: unknown, ctx: Context) {
      const meta = extractWorkflowMeta(ctx);
      const signal: WorkflowSignal = {
        runId: (ctx.id as string) ?? `${name}-${Date.now()}`,
        abort:
          (ctx as unknown as { locals?: { abortSignal?: AbortSignal } }).locals?.abortSignal
          ?? new AbortController().signal,
        ...(meta !== undefined ? { meta } : {}),
      };
      return def.handler(ctx.params as I, signal);
    },
  };
}
