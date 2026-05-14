// SPDX-License-Identifier: Apache-2.0
/**
 * List Documents Action — `v1.ingest.list-documents` → `GET /ingest/list`.
 *
 * Wave 10.B (PRD-019 FR-005). Paginated CMS-admin list of non-deleted
 * documents in the demo tenant. Auth-gated via session-guard's
 * `assertAuthenticated` (same Wave 9.0.1 pattern as `ingest-document`).
 *
 * Pagination contract:
 *   - `skip`  — non-negative integer, defaults to 0.
 *   - `limit` — 1..100, defaults to 20; clamped at the action layer
 *               (transport defence-in-depth on top of adapter clamping).
 *
 * Response shape is admin-UI-driven: the port's `DocumentSummary`
 * projection (id/preview/bytes/createdAt) lets the adapter pick the
 * cheapest projection it can (Pg uses `LEFT(text, 200)` + `octet_length`;
 * memory adapter slices the in-memory body).
 */
import { APIError, ResponseCode } from '@gertsai/api-core/contracts';
import {
  AuthenticationRequiredError,
  TenantScopeViolationError,
  assertAuthenticated,
  assertSessionInTenant,
} from '@gertsai/session-guard';
import typia from 'typia';

import { defineAction } from '../../../../lib/define-action';
import { resolveExampleController } from '../../../../lib/example-controller';
import { tryGetRequestContextFromCtx } from '../../../../composition/wave5-middlewares';
import type { DocumentSummary } from '../../../../domain/ports/IDocumentStore';
import type { IngestServiceContext } from '../../types';

/** Request — both fields optional with defaults applied server-side. */
export interface ListDocumentsRequest {
  /** Non-negative; defaults to 0. */
  skip?: number;
  /** 1..100; defaults to 20 and is clamped to that range. */
  limit?: number;
}

/** Response shape consumed by the SvelteKit admin page. */
export interface ListDocumentsResponse {
  items: DocumentSummary[];
  total: number;
  skip: number;
  limit: number;
}

const controller = resolveExampleController<'v1', 'ingest', IngestServiceContext>('v1', 'ingest');

export const listDocuments = defineAction(controller.register('list-documents', {
  // Wave 9.0.1 / Wave 10.B parity with ingest-document: auth-gate is done
  // inside the handler via session-guard so the rest of the demo runs
  // without an OAuth provider.
  auth: 'none',

  rest: 'GET /ingest/list',

  params: typia.createValidate<ListDocumentsRequest>(),
  response: typia.createValidate<ListDocumentsResponse>(),

  responseCode: ResponseCode.SUCCESS,
  responseMessage: 'Documents listed',

  async handler({ params, ctx, service, logger, respond }) {
    try {
      // Session-guard FIRST (Wave 9.0.1 invariant — assert before any
      // business work). Anonymous request → AuthenticationRequiredError →
      // mapped to 401 below.
      const { session, expectedTenantId } = tryGetRequestContextFromCtx(ctx);
      if (session !== undefined) {
        assertAuthenticated(session);
        if (expectedTenantId !== undefined) {
          assertSessionInTenant(session, expectedTenantId);
        }
      }

      // Transport-boundary clamp.
      const rawSkip = params.skip ?? 0;
      const rawLimit = params.limit ?? 20;
      if (!Number.isFinite(rawSkip) || rawSkip < 0) {
        throw new APIError(
          ResponseCode.BAD_REQUEST__INVALID_PARAMS,
          undefined,
          'skip must be a non-negative number',
        );
      }
      if (!Number.isFinite(rawLimit) || rawLimit < 1 || rawLimit > 100) {
        throw new APIError(
          ResponseCode.BAD_REQUEST__INVALID_PARAMS,
          undefined,
          'limit must be between 1 and 100',
        );
      }
      const skip = Math.floor(rawSkip);
      const limit = Math.floor(rawLimit);

      const [items, total] = await Promise.all([
        service.docStore.listSummaries({ skip, limit }),
        service.docStore.count(),
      ]);

      logger.info('[v1.ingest.list-documents] ok', {
        skip,
        limit,
        returned: items.length,
        total,
      });

      const response: ListDocumentsResponse = {
        items: [...items],
        total,
        skip,
        limit,
      };
      return respond(response, 'Documents listed', ResponseCode.SUCCESS);
    } catch (err) {
      if (err instanceof AuthenticationRequiredError) {
        throw new APIError(
          ResponseCode.UNAUTHORIZED_REQUEST,
          undefined,
          'Authentication required',
        );
      }
      if (err instanceof TenantScopeViolationError) {
        throw new APIError(
          ResponseCode.FORBIDDEN__INSUFFICIENT_RIGHTS,
          undefined,
          'Tenant scope violation',
        );
      }
      throw err;
    }
  },
}));
