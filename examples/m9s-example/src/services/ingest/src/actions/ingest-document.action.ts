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
 *   3. Enqueue the job through `service.queue` — which runs synchronously
 *      (no Redis) or hands off to a BullMQ worker (Redis configured).
 *   4. Map known domain errors to `APIError` instances; let everything else
 *      bubble up to the framework's default handler.
 *
 * The action stays pure transport — all business logic lives in
 * `IngestDocumentUseCase`, wired via the lifecycle handler.
 */
import { APIError, ResponseCode } from '@gertsai/api-core';
import typia from 'typia';

import { resolveExampleController } from '../../../../lib/example-controller';
import { PermissionDeniedError } from '../../../../application/IngestDocumentUseCase';
import type { IngestServiceContext, IngestDocumentRequest, IngestDocumentResponse } from '../../types';

const controller = resolveExampleController<'v1', 'ingest', IngestServiceContext>('v1', 'ingest');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const ingestDocument: any = controller.register('document', {
  // Auth handled inside the gate so the example runs without an OAuth
  // provider; switch to 'required' once a real auth middleware is in place.
  auth: 'none',

  rest: 'POST /document',

  params: typia.createValidate<IngestDocumentRequest>(),
  response: typia.createValidate<IngestDocumentResponse>(),

  responseCode: ResponseCode.SUCCESS_CREATED,
  responseMessage: 'Document accepted for ingestion',

  async handler({ params, ctx, service, logger, respond }) {
    const { docId, text, metadata } = params;

    // Resolve user id from meta (set by an auth middleware in real apps).
    const metaUserId = (ctx.meta as Record<string, unknown>).user_uuid;
    const userId =
      params.userId ?? (typeof metaUserId === 'string' ? metaUserId : 'anonymous');

    logger.info('[v1.ingest.document] received', {
      docId,
      userId,
      textLength: text.length,
      mode: service.queue.mode,
    });

    try {
      const { jobId, chunkCount } = await service.queue.enqueue({
        docId,
        text,
        userId,
        metadata,
      });

      const response: IngestDocumentResponse = {
        docId,
        jobId,
        mode: service.queue.mode,
        chunkCount,
      };

      logger.info('[v1.ingest.document] enqueued', response);
      return respond(response, 'Document accepted for ingestion', ResponseCode.SUCCESS_CREATED);
    } catch (err) {
      // Map domain errors to transport (HTTP) errors here — keeps the
      // application layer independent of @gertsai/api-core.
      if (err instanceof PermissionDeniedError) {
        throw new APIError(ResponseCode.FORBIDDEN__INSUFFICIENT_RIGHTS, undefined, err.message);
      }
      if (err instanceof Error && err.message.startsWith('Document.')) {
        throw new APIError(ResponseCode.BAD_REQUEST, undefined, err.message);
      }
      throw err;
    }
  },
});
