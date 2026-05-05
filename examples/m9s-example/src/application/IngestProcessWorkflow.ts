// SPDX-License-Identifier: Apache-2.0
/**
 * IngestProcessWorkflow — pure, transport-agnostic `WorkflowDefinition`.
 *
 * Sprint 3.1 W-6 migration: the previous incarnation lived in
 * `services/workflows/ingest-process.workflow.ts` as a hand-rolled
 * Moleculer `ServiceSchema` with a `workflows: {...}` block read directly
 * by the `@moleculer/workflows` middleware. That shape worked, but it
 * locked the workflow body into the Moleculer transport (handler took a
 * `Context`, called `ctx.call(...)` for journaled steps).
 *
 * The new shape conforms to `@gertsai/core`'s language-neutral
 * `WorkflowDefinition<TInput, TOutput>` contract:
 *   - `name`, `version`, `params`, `handler(input, signal)`
 *   - No Moleculer types; no transport coupling.
 *
 * The Moleculer-specific adaptation (wrapping the handler so it accepts
 * a Moleculer `Context`, threading `runId` + `AbortSignal`, and surfacing
 * the schema to the `@moleculer/workflows` middleware) is performed by
 * `@gertsai/api-core/moleculer`'s `setWorkflows()` helper at registration
 * time. See `examples/m9s-example/src/services/ingest/lifecycle.ts`.
 *
 * Behavioural parity with the previous version:
 *   - Same idempotent semantics (chunking is deterministic; replay reads
 *     the event log courtesy of @moleculer/workflows mw).
 *   - Same outputs (`docId`, `chunkCount`, `status`).
 *   - Same defensive guard against oversized inputs.
 *
 * Trade-offs:
 *   - The previous version split embedding and storage into TWO journaled
 *     `ctx.call(...)`s (`_embed`, `_store`). Each call wrote a separate
 *     event-log entry, so a worker crash AFTER embed but BEFORE store
 *     skipped re-embedding on replay. The pure handler delegates to a
 *     single `IngestDocumentUseCase.execute(...)` which performs both
 *     steps in one shot — replay re-runs the whole use case (including
 *     the embedder). This is acceptable here: deterministic chunking +
 *     deterministic embedders (Mock/OpenAI w/ identical seeds) produce
 *     identical vectors. Application code using a non-deterministic
 *     embedder should restore the two-call split (TODO Sprint 3.x).
 *
 * @see {@link createIngestProcessWorkflow} — the factory accepting
 * the `IngestDocumentUseCase` dep. Lifecycle wires it.
 */
import type { WorkflowDefinition, WorkflowSignal } from '@gertsai/core';

import type { IngestDocumentUseCase } from './IngestDocumentUseCase';

/**
 * Payload accepted by `ingest.process`. Mirrors the previous shape so
 * existing REST callers (`POST /api/v1/ingest/workflow`) keep working
 * unchanged.
 *
 * Workflows are validated by `@moleculer/workflows`' built-in
 * fastest-validator (the `params` block is forwarded into the
 * synthesized Moleculer schema). Pure handler logic re-validates only
 * what's not covered by the schema (e.g. `MAX_INPUT_BYTES`).
 */
export interface IngestProcessInput {
  docId: string;
  text: string;
  userId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Result of a successful `ingest.process` run. `status` distinguishes
 * normal completion from the no-op path (input had zero usable chunks
 * after splitting, e.g. whitespace-only document).
 */
export interface IngestProcessResult {
  docId: string;
  chunkCount: number;
  status: 'completed' | 'skipped-empty';
}

/**
 * Hard cap on input size — defensive guard so a runaway client cannot
 * blow up the Redis event log with a multi-MB chunk-list. 1 MB is well
 * above any realistic single-document ingest in this example.
 *
 * Real pipelines should ALSO enforce this at the gateway / RLR layer.
 */
const MAX_INPUT_BYTES = 1_000_000;

/**
 * fastest-validator schema forwarded into the Moleculer workflow's
 * `params` block. Kept here (alongside the `WorkflowDefinition`) so the
 * input validator and the TypeScript shape stay co-located.
 */
const INGEST_PROCESS_PARAMS = {
  docId: 'string',
  text: { type: 'string', min: 1 },
  userId: { type: 'string', optional: true, default: 'anonymous' },
  metadata: { type: 'object', optional: true },
} as const;

/**
 * Build the `ingest.process` workflow definition with its dependency
 * injected. Factory shape (rather than a singleton) keeps the workflow
 * pure: tests can construct an isolated definition with stub deps, and
 * the lifecycle layer wires the production deps from the composition
 * root.
 *
 * @param deps - `useCase` is the `IngestDocumentUseCase` already wired
 *   to the shared `infrastructure` singleton in
 *   `services/ingest/lifecycle.ts`.
 * @returns A `WorkflowDefinition` ready to be passed to
 *   `setWorkflows(controller, { 'ingest.process': def })`.
 */
export function createIngestProcessWorkflow(deps: {
  readonly useCase: IngestDocumentUseCase;
}): WorkflowDefinition<IngestProcessInput, IngestProcessResult> {
  const { useCase } = deps;

  return {
    name: 'ingest.process',
    version: 1,
    params: INGEST_PROCESS_PARAMS,

    /**
     * Pure handler. The `WorkflowSignal` exposes the runtime-managed
     * `runId` and an `AbortSignal` for cooperative cancellation. We do
     * not currently propagate the abort signal into the use case — the
     * `IEmbedder` and store ports do not yet accept one. Adding signal
     * threading is a future enhancement (TODO Sprint 3.x).
     */
    async handler(
      input: IngestProcessInput,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars -- signal is part of the contract; reserved for future cooperative-cancel wiring
      _signal: WorkflowSignal,
    ): Promise<IngestProcessResult> {
      const { docId, text, userId = 'anonymous', metadata } = input;

      // Defensive guard — schema enforces `min: 1` on `text` already, but
      // size-cap is a separate axis that fastest-validator does not cover.
      if (text.length > MAX_INPUT_BYTES) {
        throw new Error(`Document too large (>${MAX_INPUT_BYTES} bytes)`);
      }

      // Delegate the full pipeline (chunk → embed → persist) to the use
      // case. Behavioural parity with the previous handler: same chunking
      // algorithm, same deterministic vector pipeline, same persistence
      // order (document → chunks).
      //
      // TODO Sprint 3.x: re-introduce the two-step split (embed + store
      // as separate journaled steps) once the WorkflowSignal contract
      // grows a step-API. Until then, replay re-runs the whole use case;
      // safe with deterministic embedders, requires care otherwise.
      try {
        const result = await useCase.execute({
          userId,
          docId,
          text,
          metadata: metadata as Parameters<IngestDocumentUseCase['execute']>[0]['metadata'],
        });

        return {
          docId: result.docId,
          chunkCount: result.chunkCount,
          status: 'completed',
        };
      } catch (err) {
        // The use case throws when chunking yields zero chunks, but
        // `createDocument` already rejects empty text upstream — so
        // hitting that path means an exotic input squeezed through the
        // schema. Mirror the previous handler's `'skipped-empty'` exit
        // for that one specific case to preserve behavioural parity.
        if (err instanceof Error && err.message === 'Document produced zero chunks') {
          return { docId, chunkCount: 0, status: 'skipped-empty' };
        }
        throw err;
      }
    },
  };
}
