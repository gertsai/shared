/**
 * Start Workflow Action — `v1.ingest.workflow`.
 *
 * Public REST entry point that triggers the `wf-ingest.ingest.process`
 * workflow on the @moleculer/workflows runtime. This is a sibling to
 * `v1.ingest.document` (BullMQ-style fire-and-forget); the difference is
 * the underlying execution model:
 *
 *   - `/ingest/document` → BullMQ job, retries on failure but **re-runs
 *     the whole use case** including embedding.
 *   - `/ingest/workflow` → @moleculer/workflows job, retries on failure
 *     but **journals each ctx.call** so already-embedded chunks aren't
 *     re-embedded on replay.
 *
 * The workflow runtime is gated on `REDIS_URL` (Redis is the event-log
 * backend). When Redis is unavailable, `service.broker.wf` is undefined
 * and we surface a 400 with an actionable hint instead of letting the
 * call fail with an obscure TypeError.
 *
 * Sync vs async modes:
 *   - Default (`sync` not set) → return immediately with the job id.
 *   - `?sync=true` (or `{"sync": true}`) → await `job.promise()` and
 *     return the workflow's final result. Useful for curl-driven demos
 *     and for tests that want to assert end-state.
 */
import type { ServiceBroker } from 'moleculer';

import { APIError, ResponseCode } from '@gertsai/api-core';
import typia from 'typia';

import { resolveExampleController } from '../../../../lib/example-controller';
import type { IngestServiceContext } from '../../types';

/**
 * Request body — same shape as `IngestDocumentRequest` plus an optional
 * `sync` flag. Keeping the shape aligned makes it trivial to swap one
 * endpoint for the other in client code.
 */
export interface StartWorkflowRequest {
  /** Stable document identifier supplied by the caller */
  docId: string;
  /** Raw document text */
  text: string;
  /** Optional metadata bag (passed through to the workflow handler) */
  metadata?: {
    source?: string;
    tags?: string[];
    author?: string;
    createdAt?: string;
  };
  /**
   * Caller user id. Optional in this example so curl works without an
   * auth provider; production wiring should set `auth: 'required'` on
   * the action and use `session.user_uuid`.
   */
  userId?: string;
  /**
   * When `true`, the action awaits workflow completion (`job.promise()`)
   * and returns the final result. When false / unset, returns the job
   * id immediately and the workflow runs in the background.
   */
  sync?: boolean;
}

/**
 * Response body. Shape depends on `sync`:
 *   - sync=false (default): `status='started'`, `chunkCount=null`.
 *   - sync=true:           `status='completed'|'skipped-empty'`,
 *                           `chunkCount=<final>`.
 */
export interface StartWorkflowResponse {
  docId: string;
  workflowJobId: string;
  status: 'started' | 'completed' | 'skipped-empty';
  chunkCount: number | null;
}

/**
 * Subset of `broker.wf` that this action actually consumes. We type it
 * locally instead of importing from `@moleculer/workflows` to avoid
 * tying api-core's type graph to the workflows package — the contract
 * is just `run() → { id, promise() }`.
 */
interface WorkflowRunner {
  run: (
    workflowName: string,
    payload?: unknown,
    opts?: unknown,
  ) => Promise<{ id: string; promise?: () => Promise<unknown> }>;
}

const controller = resolveExampleController<'v1', 'ingest', IngestServiceContext>('v1', 'ingest');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const startWorkflow: any = controller.register('workflow', {
  // Auth handled inside the gate (same as ingest-document); switch to
  // 'required' in production deployments.
  auth: 'none',

  rest: 'POST /ingest/workflow',

  params: typia.createValidate<StartWorkflowRequest>(),
  response: typia.createValidate<StartWorkflowResponse>(),

  responseCode: ResponseCode.SUCCESS_CREATED,
  responseMessage: 'Workflow accepted',

  async handler({ params, service, logger, respond }) {
    const { docId, text, metadata, sync } = params;

    // Resolve user id (auth-middleware-set meta wins over body).
    const userId = params.userId ?? 'anonymous';

    // -----------------------------------------------------------------
    // Gate: workflows require REDIS_URL.
    //
    // The middleware in `moleculer.config.ts` is only registered when
    // REDIS_URL is set; with no Redis there's no `broker.wf`. We surface
    // a precise 400 instead of letting Moleculer return a generic 500.
    // -----------------------------------------------------------------
    const broker = service.broker as ServiceBroker & { wf?: WorkflowRunner };
    if (!broker.wf || typeof broker.wf.run !== 'function') {
      throw new APIError(
        ResponseCode.BAD_REQUEST,
        undefined,
        'Workflows require REDIS_URL — set REDIS_URL=redis://... and restart',
      );
    }

    logger.info('[v1.ingest.workflow] starting workflow', {
      docId,
      userId,
      sync: !!sync,
    });

    // -----------------------------------------------------------------
    // Trigger the workflow. Workflow name = `<svc.fullName>.<key>`,
    // i.e. `wf-ingest.ingest.process` (svc.fullName='wf-ingest', key in
    // the workflows map='ingest.process'). See @moleculer/workflows
    // middleware.js: `wf.name = svc.fullName + "." + (wf.name || name)`.
    // -----------------------------------------------------------------
    const job = await broker.wf.run('wf-ingest.ingest.process', {
      docId,
      text,
      userId,
      metadata,
    });

    if (sync && typeof job.promise === 'function') {
      // Synchronous mode — await the workflow's final result. Errors
      // bubble up; api-core's default error handler maps them to 5xx.
      const result = (await job.promise()) as {
        docId: string;
        chunkCount: number;
        status: 'completed' | 'skipped-empty';
      };
      const response: StartWorkflowResponse = {
        docId: result.docId,
        workflowJobId: String(job.id),
        status: result.status,
        chunkCount: result.chunkCount,
      };
      logger.info('[v1.ingest.workflow] completed', response);
      return respond(response, 'Workflow completed', ResponseCode.SUCCESS_CREATED);
    }

    // Async mode — return job handle immediately, processing continues
    // in the workflow runtime. Caller polls via broker.wf.get / getState.
    const response: StartWorkflowResponse = {
      docId,
      workflowJobId: String(job.id),
      status: 'started',
      chunkCount: null,
    };

    logger.info('[v1.ingest.workflow] started (async)', response);
    return respond(response, 'Workflow started', ResponseCode.SUCCESS_CREATED);
  },
});
