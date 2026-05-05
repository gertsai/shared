/**
 * Search Query Action — `v1.search.query`
 *
 * Thin transport wrapper around `SearchDocumentsUseCase`:
 *
 *   1. typia-validate the body.
 *   2. Resolve the user id (meta.user_uuid → 'anonymous').
 *   3. Call the use case via `service.useCase.execute(...)`.
 *   4. Map known domain errors to APIError.
 *
 * No queue — search is synchronous (one embedder call + one cosine sweep).
 *
 * Mirror: `apps/pipeline/src/services/graph/src/actions/*.ts`.
 */
import { APIError, ResponseCode } from '@gertsai/api-core/contracts';
import typia from 'typia';

import { resolveExampleController } from '../../../../lib/example-controller';
import { PermissionDeniedError } from '../../../../application/errors/permission-denied.error';
import type { SearchServiceContext, SearchQueryRequest, SearchQueryResponse } from '../../types';

const controller = resolveExampleController<'v1', 'search', SearchServiceContext>('v1', 'search');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const searchQuery: any = controller.register('query', {
  auth: 'none',

  rest: 'POST /search/query',

  params: typia.createValidate<SearchQueryRequest>(),
  response: typia.createValidate<SearchQueryResponse>(),

  responseCode: ResponseCode.SUCCESS,
  responseMessage: 'Search completed',

  async handler({ params, ctx, service, logger, respond }) {
    const { query, topK } = params;

    const metaUserId = (ctx.meta as Record<string, unknown>).user_uuid;
    const userId =
      params.userId ?? (typeof metaUserId === 'string' ? metaUserId : 'anonymous');

    logger.info('[v1.search.query] received', { userId, queryLength: query.length, topK });

    try {
      const { results } = await service.useCase.execute({ userId, query, topK });
      logger.info('[v1.search.query] completed', { count: results.length });
      // Map ReadonlyArray<ChunkSearchHit> to plain objects for typia validation.
      return respond({ results: results.map((r) => ({ ...r })) });
    } catch (err) {
      if (err instanceof PermissionDeniedError) {
        throw new APIError(ResponseCode.FORBIDDEN__INSUFFICIENT_RIGHTS, undefined, err.message);
      }
      if (err instanceof Error && err.message === 'Search query must be non-empty') {
        throw new APIError(ResponseCode.BAD_REQUEST__INVALID_PARAMS, undefined, err.message);
      }
      throw err;
    }
  },
});
