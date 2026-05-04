/**
 * `wf-ingest.ingest.process` — idempotent ingest workflow.
 *
 * This is a plain Moleculer service (NOT registered through the api-core
 * `ApiController` pipeline) because `@moleculer/workflows` reads the
 * `workflows: {...}` schema property directly off the Moleculer service
 * object during `serviceCreated`. ApiController manages REST/queue
 * surfaces, not workflow surfaces — so the workflow definition is just
 * a regular `ServiceSchema` exported from this file and fed into
 * `ApiController.Start({ services: [..., IngestWorkflowService] })`.
 *
 * Why a SEPARATE service rather than putting `workflows: {...}` on the
 * existing `v1.ingest` schema?
 *
 *   ApiController synthesises Moleculer service schemas from registered
 *   actions/queues; the schema-shape contract belongs to api-core. Mixing
 *   workflow declarations into that synth path would require api-core
 *   changes. Keeping the workflow service separate also makes the layer
 *   boundary obvious — composition glue lives in `services/workflows/`,
 *   domain/application code stays untouched.
 *
 * Steps (Temporal-like execution model):
 *
 *   1. validate (inline — deterministic, replay-safe)
 *   2. chunk    (inline — deterministic, replay-safe)
 *   3. embed    via `ctx.call('v1.ingest._embed', ...)` — JOURNALED
 *   4. store    via `ctx.call('v1.ingest._store', ...)` — JOURNALED
 *
 * If the worker crashes between step 3 completing and step 4 starting,
 * the middleware restarts the handler from the top, but step 3's result
 * is read from the Redis-backed event log instead of being recomputed.
 * Determinism in steps 1+2 means re-running them produces identical
 * inputs to step 3, and the event log short-circuits to the same vectors.
 */
import type { ServiceSchema, Context } from 'moleculer';

/**
 * Payload accepted by the `ingest.process` workflow. Validation is
 * performed by Moleculer's built-in fastest-validator (workflows
 * middleware wraps the handler with `broker.validator.compile(wf.params)`
 * — see `package/dist/cjs/middleware.js`). We can't reuse the typia
 * validators from `services/ingest/types.ts` here because the broker is
 * configured with `validator: false` to avoid double-validation on the
 * api-core path; the workflows middleware compiles its own validator
 * even when the broker validator is disabled.
 */
interface IngestProcessParams {
  docId: string;
  text: string;
  userId?: string;
  metadata?: Record<string, unknown>;
}

interface IngestProcessResult {
  docId: string;
  chunkCount: number;
  status: 'completed' | 'skipped-empty';
}

/**
 * Shape of the api-core response envelope. Every action registered via
 * `controller.register(...)` returns `{ success, code, message, data }`.
 * Inside an api-core action handler, the framework's `call` accessor
 * unwraps `.data` for you (see ApiController.class.ts handler wrapper).
 * Workflow handlers run on the raw Moleculer ctx, so we have to unwrap
 * the envelope ourselves to reach the typed payload.
 */
interface ApiEnvelope<T> {
  success: boolean;
  code?: string;
  message?: string;
  data: T;
}

/**
 * Hard cap on input size — defensive guard so a runaway client cannot
 * blow up the Redis event log with a multi-MB chunk-list. 1 MB is well
 * above any realistic single-document ingest in this example. Real
 * pipelines should enforce this at the gateway / RLR layer too.
 */
const MAX_INPUT_BYTES = 1_000_000;

const IngestWorkflowService: ServiceSchema = {
  name: 'wf-ingest',

  workflows: {
    'ingest.process': {
      // Total budget for the whole workflow run, including replays.
      timeout: '1 hour',
      // How long completed/failed jobs are kept in the event log for
      // post-mortem inspection via `broker.wf.getEvents(...)`.
      retention: '1 day',
      // Per-node cap on simultaneously running jobs of THIS workflow.
      // 4 lines up nicely with the default WORKER_CONCURRENCY.
      concurrency: 4,

      // Workflows-mw uses Moleculer's fastest-validator independently of
      // typia / the broker `validator` flag. Mirrors the documented shape
      // in @moleculer/workflows README ("Advanced Example").
      params: {
        docId: 'string',
        text: { type: 'string', min: 1 },
        userId: { type: 'string', optional: true, default: 'anonymous' },
        metadata: { type: 'object', optional: true },
      },

      async handler(ctx: Context<IngestProcessParams>): Promise<IngestProcessResult> {
        const { docId, text, userId = 'anonymous', metadata } = ctx.params;

        // -------------------------------------------------------------
        // Step 1: validate (inline, deterministic — safe to replay)
        // -------------------------------------------------------------
        if (text.length > MAX_INPUT_BYTES) {
          throw new Error(`Document too large (>${MAX_INPUT_BYTES} bytes)`);
        }

        // -------------------------------------------------------------
        // Step 2: chunk (inline, deterministic — safe to replay)
        //
        // Same naive splitter as `IngestDocumentUseCase.splitIntoChunks`.
        // Inlined here on purpose: keeps the workflow handler a single
        // self-contained unit, avoids pulling the whole application layer
        // into the workflow's import graph.
        // -------------------------------------------------------------
        const chunks = text
          .split(/(?<=[.!?])\s+|\n+/u)
          .map((s) => s.trim())
          .filter((s) => s.length > 0);

        if (chunks.length === 0) {
          // Defensive: with `min: 1` on `text` this should be unreachable,
          // but if it somehow happens, finish cleanly without writes.
          return { docId, chunkCount: 0, status: 'skipped-empty' };
        }

        // -------------------------------------------------------------
        // Step 3: embed — JOURNALED ctx.call
        //
        // The middleware wraps `ctx.call` so the (texts → vectors) tuple
        // lands in the event log. On replay (worker crash + retry from
        // step 1), this call's result is read from Redis instead of
        // re-invoking the embedder.
        //
        // Note the `.data` unwrap: api-core actions return Orchestra
        // envelopes; we reach for the typed payload explicitly.
        // -------------------------------------------------------------
        const embedRes = (await ctx.call('v1.ingest._embed', {
          texts: chunks,
        })) as ApiEnvelope<{ vectors: number[][] }>;
        const vectors = embedRes.data.vectors;

        // -------------------------------------------------------------
        // Step 4: store — JOURNALED ctx.call
        //
        // Persisting the prepared chunk batch. Idempotency at the store
        // level is the responsibility of the adapter (MemoryDocumentStore
        // overwrites on duplicate id; SQL adapters should use UPSERT).
        // The workflow guarantees no double-embedding; double-store is
        // up to the adapter.
        // -------------------------------------------------------------
        const storeRes = (await ctx.call('v1.ingest._store', {
          docId,
          userId,
          text,
          metadata,
          chunks,
          vectors,
        })) as ApiEnvelope<{ docId: string; chunkCount: number }>;
        const stored = storeRes.data;

        return {
          docId: stored.docId,
          chunkCount: stored.chunkCount,
          status: 'completed',
        };
      },
    },
  },
};

export default IngestWorkflowService;
