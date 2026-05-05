// SPDX-License-Identifier: Apache-2.0
import type { WorkflowDefinition, WorkflowSignal } from '@gertsai/core';
import type { Context } from 'moleculer';

/**
 * Moleculer-flavoured workflow schema produced from a language-neutral
 * `WorkflowDefinition`. Shape mirrors the contract expected by
 * `@moleculer/workflows` (name, version, params, handler).
 */
export interface MoleculerWorkflowSchema {
  name: string;
  version: number;
  params?: object;
  handler: (this: unknown, ctx: Context) => Promise<unknown>;
}

/**
 * Adapt a language-neutral `WorkflowDefinition<I, O>` into the
 * Moleculer-flavoured schema. The synthesized handler:
 *  - extracts `runId` from `ctx.id` (falling back to a deterministic stamp),
 *  - threads an `AbortSignal` from `ctx.locals.abortSignal` if the runtime
 *    publishes one, otherwise provides a fresh `AbortController().signal`,
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
    params: def.params,
    handler: async function moleculerHandler(this: unknown, ctx: Context) {
      const signal: WorkflowSignal = {
        runId: (ctx.id as string) ?? `${name}-${Date.now()}`,
        abort:
          (ctx as unknown as { locals?: { abortSignal?: AbortSignal } }).locals?.abortSignal
          ?? new AbortController().signal,
      };
      return def.handler(ctx.params as I, signal);
    },
  };
}
