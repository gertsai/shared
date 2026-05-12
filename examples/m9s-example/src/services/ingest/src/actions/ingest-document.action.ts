/**
 * Ingest Document Action — `v1.ingest.document`
 *
 * Mirrors the pipeline action shape (see
 * `apps/pipeline/src/services/ingest/src/actions/file.ts`):
 *
 *   1. Parse + typia-validate request body.
 *   2. Resolve the user identifier (real apps use `auth: 'required'` and
 *      `session.user_uuid`; we accept it from `meta.user_uuid` or fall
 *      back to 'anonymous' so curl works without auth).
 *   3. Produce side: if the service has `addJob` (queue configured via
 *      `ApiController.configure({queue})`), enqueue a BullMQ job —
 *      api-core's worker picks it up. Otherwise, run the use case
 *      synchronously here as an in-process fallback.
 *   4. Map known domain errors to `APIError` instances; let everything else
 *      bubble up to the framework's default handler.
 *
 * The action stays pure transport — all business logic lives in
 * `IngestDocumentUseCase`, wired via the lifecycle handler.
 */
import { APIError, ResponseCode } from '@gertsai/api-core/contracts';
import {
  AuthenticationRequiredError,
  TenantScopeViolationError,
} from '@gertsai/session-guard';
import typia from 'typia';

import config from '../../../../../project.config';
import { resolveExampleController } from '../../../../lib/example-controller';
import { ForbiddenError } from '../../../../composition/errors.js';
import { tryGetRequestContextFromCtx } from '../../../../composition/wave5-middlewares';
import { INGEST_QUEUE_NAME, JOB_PROCESS_DOCUMENT } from '../queues';
import type {
  IngestServiceContext,
  IngestDocumentRequest,
  IngestDocumentResponse,
} from '../../types';

/**
 * Whether api-core's queue methods (`service.addJob`/`service.getQueue`) are
 * available on this service. Mirrors the gating in api-core
 * `_createServiceSchema` which adds those methods only when
 * `ApiController._config.queue` is set — i.e., when REDIS_URL was provided.
 *
 * Single source of truth = `project.config.REDIS_URL`.
 */
const QUEUE_ENABLED = !!config.REDIS_URL;

const controller = resolveExampleController<'v1', 'ingest', IngestServiceContext>('v1', 'ingest');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const ingestDocument: any = controller.register('document', {
  // Auth handled inside the gate so the example runs without an OAuth
  // provider; switch to 'required' once a real auth middleware is in place.
  auth: 'none',

  // setRestBasePath('/') strips the service-name prefix, so we add it
  // explicitly here for URL namespacing — keeps /api/v1/ingest/document
  // distinct from /api/v1/search/query.
  rest: 'POST /ingest/document',

  params: typia.createValidate<IngestDocumentRequest>(),
  response: typia.createValidate<IngestDocumentResponse>(),

  responseCode: ResponseCode.SUCCESS_CREATED,
  responseMessage: 'Document accepted for ingestion',

  async handler({ params, ctx, service, logger, respond, addJob }) {
    const { docId, text, metadata } = params;

    // Resolve user id from meta (set by an auth middleware in real apps).
    const metaUserId = (ctx.meta as Record<string, unknown>).user_uuid;
    const userId =
      params.userId ?? (typeof metaUserId === 'string' ? metaUserId : 'anonymous');

    logger.info('[v1.ingest.document] received', {
      docId,
      userId,
      textLength: text.length,
      mode: QUEUE_ENABLED ? 'queued' : 'inline',
    });

    try {
      // Pipeline-style: when api-core has queue config, the service has
      // `addJob` injected automatically. Action just enqueues — the worker
      // registered in `queues/ingest-chunk.worker.ts` runs asynchronously.
      if (QUEUE_ENABLED) {
        const job = await addJob(
          INGEST_QUEUE_NAME,
          JOB_PROCESS_DOCUMENT,
          { docId, text, userId, metadata },
        );

        const response: IngestDocumentResponse = {
          docId,
          jobId: String(job?.id ?? `job-${Date.now()}`),
          mode: 'queued',
          chunkCount: null,
        };

        logger.info('[v1.ingest.document] enqueued', response);
        return respond(response, 'Document accepted for ingestion', ResponseCode.SUCCESS_CREATED);
      }

      // Inline fallback — no Redis configured. Same code path as the
      // worker handler, just executed in the request thread.
      //
      // Sprint 3.10 Addendum 2 — wire Wave 5 RequestContext through to use
      // case. tryGetRequestContextFromCtx returns `{ session, expectedTenantId
      // }` populated when sessionMiddleware composed an authenticated
      // RequestContext, or both undefined for anonymous / pre-Wave-5 callers.
      // Use case treats the fields as additive optional per ADR-010 I-2/I-3
      // (16-test regression invariant).
      const { session, expectedTenantId } = tryGetRequestContextFromCtx(ctx);

      const { chunkCount } = await service.useCase.execute({
        docId,
        text,
        userId,
        ...(metadata !== undefined && { metadata }),
        ...(session !== undefined && { session }),
        ...(expectedTenantId !== undefined && { expectedTenantId }),
      });

      const response: IngestDocumentResponse = {
        docId,
        jobId: `inline-${Date.now()}-${chunkCount}`,
        mode: 'inline',
        chunkCount,
      };

      logger.info('[v1.ingest.document] processed inline', response);
      return respond(response, 'Document accepted for ingestion', ResponseCode.SUCCESS_CREATED);
    } catch (err) {
      // Map domain errors to transport (HTTP) errors here — keeps the
      // application layer independent of @gertsai/api-core.
      //
      // Sprint 3.10 Addendum 2: session-guard rejections (composed by Wave 5
      // middleware path → use case assertions) surface as AppError subclasses;
      // map them to the closest HTTP/RFC-9457 status without leaking internal
      // session details.
      if (err instanceof AuthenticationRequiredError) {
        // 401 Unauthorized — destroyed/missing session.
        throw new APIError(
          ResponseCode.UNAUTHORIZED_REQUEST,
          undefined,
          'Authentication required',
        );
      }
      if (err instanceof TenantScopeViolationError) {
        // 403 Forbidden — session tenant ≠ expected tenant.
        throw new APIError(
          ResponseCode.FORBIDDEN__INSUFFICIENT_RIGHTS,
          undefined,
          'Tenant scope violation',
        );
      }
      if (err instanceof ForbiddenError) {
        throw new APIError(ResponseCode.FORBIDDEN__INSUFFICIENT_RIGHTS, undefined, err.message);
      }
      if (err instanceof Error && err.message.startsWith('Document.')) {
        throw new APIError(ResponseCode.BAD_REQUEST, undefined, err.message);
      }
      throw err;
    }
  },
});
