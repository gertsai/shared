import { ApiController, APIError, ResponseCode } from '@gertsai/api-core';
import typia from 'typia';

import { PermissionDeniedError } from '../../application/IngestDocumentUseCase';
import type { DocumentsServiceContext, SearchRequest, SearchResponse } from './types';

/**
 * Inbound adapter — exposes the SearchDocumentsUseCase as a Moleculer action
 * (`v1.documents.search`) reachable via `POST /api/v1/search`.
 *
 * Caching strategy:
 *   We rely on Moleculer's per-action `cache` configuration, which routes
 *   through the broker's M9sCacheCacher (configured in composition/broker.ts).
 *   TTL is 60 s; the cache key is auto-derived from the action params.
 *
 *   This keeps domain logic cache-agnostic — only the inbound boundary
 *   knows that a result for the same query is "good enough" for 60 s.
 */
const controller = ApiController.resolveController<'v1', 'documents', DocumentsServiceContext>(
  'v1',
  'documents',
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const searchAction: any = controller.register('search', {
  auth: 'none',

  rest: 'POST /search',

  params: typia.createValidate<SearchRequest>(),
  response: typia.createValidate<SearchResponse>(),

  responseCode: ResponseCode.SUCCESS,
  responseMessage: 'Search completed',

  async handler({ params, ctx, service, logger, respond }) {
    const { query, topK } = params;

    const userId =
      (ctx.meta as Record<string, unknown>).user_uuid as string | undefined ?? 'anonymous';

    logger.info('search:received', { userId, queryLength: query.length, topK });

    try {
      const { results } = await service.searchUseCase.execute({ userId, query, topK });
      logger.info('search:ok', { count: results.length });
      return respond({ results: results.map((r) => ({ ...r })) });
    } catch (err) {
      if (err instanceof PermissionDeniedError) {
        throw new APIError(
          ResponseCode.FORBIDDEN__INSUFFICIENT_RIGHTS,
          undefined,
          err.message,
        );
      }
      if (err instanceof Error && err.message === 'Search query must be non-empty') {
        throw new APIError(
          ResponseCode.BAD_REQUEST__INVALID_PARAMS,
          undefined,
          err.message,
        );
      }
      throw err;
    }
  },
});
