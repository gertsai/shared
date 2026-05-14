/**
 * Embed Batch Action — `v1.ingest._embed` (internal worker-only).
 *
 * Originally one of the two journaled "leaves" of the previous
 * `wf-ingest.ingest.process` workflow. Sprint 3.1 §W-7 collapsed the
 * workflow handler onto a pure `IngestDocumentUseCase` delegation
 * (now `v1.ingest.process`), so this internal action is no longer
 * called from the workflow path. Kept as a stable internal entry
 * point in case a future sprint re-introduces the two-step split for
 * non-deterministic embedders. Workflows wrap `ctx.call(...)` with an event-log read/write so
 * that, on worker crash + replay, this action's last-known result is read
 * from the journal instead of being re-executed. Keeping the action surface
 * small (single deterministic input → single deterministic output) is what
 * makes idempotent replay safe.
 *
 * Conventions (mirror pipeline patterns):
 *
 *   - Action name starts with `_` to signal "internal use only" — we deny
 *     direct REST exposure by NOT setting `rest:`.
 *   - `auth: 'none'` because the action is invoked from inside a workflow
 *     handler running on the same broker; cross-tenant isolation should be
 *     enforced upstream at the workflow trigger.
 *   - Params validated with typia at compile time (consistent with the
 *     rest of the example) — separate from the workflow-level
 *     fastest-validator schema.
 */
import typia from 'typia';

import { defineAction } from '../../../../lib/define-action';
import { resolveExampleController } from '../../../../lib/example-controller';
import type { IngestServiceContext } from '../../types';

/**
 * Request body of `v1.ingest._embed`. Single batch of texts for the
 * embedder; output preserves index order so callers can zip with chunks.
 */
export interface EmbedBatchRequest {
  texts: string[];
}

/**
 * Response of `v1.ingest._embed`. `vectors[i]` corresponds to `texts[i]`.
 */
export interface EmbedBatchResponse {
  vectors: number[][];
}

const controller = resolveExampleController<'v1', 'ingest', IngestServiceContext>('v1', 'ingest');

export const embedBatch = defineAction(controller.register('_embed', {
  // Internal: not exposed over HTTP, no auth (broker-only invocation).
  auth: 'none',

  params: typia.createValidate<EmbedBatchRequest>(),
  response: typia.createValidate<EmbedBatchResponse>(),

  async handler({ params, service, logger, respond }) {
    const { texts } = params;

    logger.info('[v1.ingest._embed] embedding batch', { count: texts.length });

    if (texts.length === 0) {
      return respond({ vectors: [] });
    }

    // Single call — the embedder port batches internally.
    const vectors = await service.embedder.embed(texts);

    if (vectors.length !== texts.length) {
      throw new Error(
        `Embedder returned ${vectors.length} vectors for ${texts.length} texts`,
      );
    }

    return respond({ vectors });
  },
}));
