import { ApiController, APIError, ResponseCode } from '@gertsai/api-core';
import typia from 'typia';

import { PermissionDeniedError } from '../../application/IngestDocumentUseCase';
import type { DocumentsServiceContext, IngestRequest, IngestResponse } from './types';

/**
 * Inbound adapter — exposes the IngestDocumentUseCase as a Moleculer action
 * (`v1.documents.ingest`) reachable via `POST /api/v1/ingest`.
 *
 * The adapter knows about transport (REST, typia validation, APIError),
 * but knows NOTHING about how ingestion is actually carried out — the use
 * case behind `ctx.service.ingestUseCase` is wired in composition/.
 *
 * Side-effect import: `import './moleculer-ingest.adapter'` registers the
 * action with the global ApiController controller registry. This mirrors
 * the pattern used by apps/pipeline/src/services/*.
 */
const controller = ApiController.resolveController<'v1', 'documents', DocumentsServiceContext>(
  'v1',
  'documents',
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const ingestAction: any = controller.register('ingest', {
  // Auth handled by the gate INSIDE the use case so that the example app
  // remains runnable without an OAuth provider; switch to 'required' once
  // a real auth middleware is in place.
  auth: 'none',

  rest: 'POST /ingest',

  params: typia.createValidate<IngestRequest>(),
  response: typia.createValidate<IngestResponse>(),

  responseCode: ResponseCode.SUCCESS_CREATED,
  responseMessage: 'Document ingested',

  async handler({ params, ctx, service, logger, respond }) {
    const { docId, text, metadata } = params;

    // The userId would normally come from `session.user_uuid` (auth='required').
    // For the demo we accept it from meta or fall back to 'anonymous'.
    const userId =
      (ctx.meta as Record<string, unknown>).user_uuid as string | undefined ?? 'anonymous';

    logger.info('ingest:received', { docId, userId, textLength: text.length });

    try {
      const result = await service.ingestUseCase.execute({
        userId,
        docId,
        text,
        metadata,
      });
      logger.info('ingest:ok', result);
      return respond(result, 'Document ingested', ResponseCode.SUCCESS_CREATED);
    } catch (err) {
      // Map domain errors to transport (HTTP) errors here — keeps the
      // application layer independent of @gertsai/api-core.
      if (err instanceof PermissionDeniedError) {
        throw new APIError(
          ResponseCode.FORBIDDEN__INSUFFICIENT_RIGHTS,
          undefined,
          err.message,
        );
      }
      if (err instanceof Error && err.message.startsWith('Document.')) {
        throw new APIError(ResponseCode.BAD_REQUEST, undefined, err.message);
      }
      throw err;
    }
  },
});
