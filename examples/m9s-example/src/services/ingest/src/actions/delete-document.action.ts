// SPDX-License-Identifier: Apache-2.0
/**
 * Delete Document Action — `v1.ingest.delete-document` →
 * `POST /ingest/delete`.
 *
 * Wave 10.B (PRD-019 FR-005). Soft-delete via the audit-aware
 * `BaseEntityStorageService.delete()` (flips `status` to `'deleted'`,
 * stamps `deleted_*`). POST (not DELETE) so SvelteKit form-action CSRF
 * protection (SameSite cookie + form-action token) applies for free from
 * the admin UI.
 *
 * `service.docStore` is typed as `IDocumentStore` (save/findById only),
 * but the demo's default `memory` mode wires a `DocumentRepository`
 * (extends `BaseEntityStorageService`) — soft-delete lives on the base
 * class. The Pg adapter mode does NOT support soft-delete (the schema
 * lacks a `deleted_at` column) — that mode surfaces 501 here.
 */
import { APIError, ResponseCode } from '@gertsai/api-core/contracts';
import {
  AuthenticationRequiredError,
  TenantScopeViolationError,
  assertAuthenticated,
  assertSessionInTenant,
} from '@gertsai/session-guard';
import typia, { type tags } from 'typia';

import { defineAction } from '@gertsai/api-core/moleculer';
import { resolveExampleController } from '../../../../lib/example-controller';
import { tryGetRequestContextFromCtx } from '../../../../composition/wave5-middlewares';
import { PgSoftDeleteNotSupportedError } from '../../../../shared/errors';
import type { IngestServiceContext } from '../../types';

/**
 * Request body. `docId` is matched against `^[A-Za-z0-9_-]{1,128}$` so
 * both canonical UUIDs and demo-style ids are accepted; the regex is
 * tight enough to keep header/path-injection out of scope (CWE-22/CWE-93).
 */
export interface DeleteDocumentRequest {
  docId: string & tags.Pattern<'^[A-Za-z0-9_-]{1,128}$'>;
}

/** Response — `deleted: true` on success (idempotent for missing ids). */
export interface DeleteDocumentResponse {
  docId: string;
  deleted: true;
}

const controller = resolveExampleController<'v1', 'ingest', IngestServiceContext>('v1', 'ingest');

export const deleteDocument = defineAction(controller.register('delete-document', {
  auth: 'none',

  // POST (not DELETE) — SvelteKit form-action CSRF protection applies to
  // any POST/PUT/PATCH/DELETE in a form submission; using POST also lets
  // programmatic clients call this with a JSON body without preflight.
  rest: 'POST /ingest/delete',

  params: typia.createValidate<DeleteDocumentRequest>(),
  response: typia.createValidate<DeleteDocumentResponse>(),

  responseCode: ResponseCode.SUCCESS,
  responseMessage: 'Document deleted',

  async handler({ params, ctx, service, logger, respond }) {
    const { docId } = params;
    try {
      // Session-guard FIRST (Wave 9.0.1 invariant).
      const { session, expectedTenantId } = tryGetRequestContextFromCtx(ctx);
      if (session !== undefined) {
        assertAuthenticated(session);
        if (expectedTenantId !== undefined) {
          assertSessionInTenant(session, expectedTenantId);
        }
      }

      // Soft-delete is idempotent — the port returns void and missing ids
      // are a no-op so the admin UI's optimistic double-click flow survives
      // without a 404.
      await service.docStore.softDelete(docId);

      // No PII in logs — only docId + actor identifier.
      const actor = session !== undefined ? session.operatorUuid : 'anonymous';
      logger.info('[v1.ingest.delete-document] soft-deleted', { docId, userId: actor });

      const response: DeleteDocumentResponse = { docId, deleted: true };
      return respond(response, 'Document deleted', ResponseCode.SUCCESS);
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
      // EVID-036 audit fix (P1 / CI-3): PG adapter explicitly refuses to
      // hard-delete now. Surface 501 so the admin UI can show a meaningful
      // "schema migration required" message instead of a silent contract
      // violation.
      if (err instanceof PgSoftDeleteNotSupportedError) {
        logger.warn('[v1.ingest.delete-document] pg adapter refused soft-delete', {
          docId,
          reason: err.message,
        });
        throw new APIError(
          ResponseCode.NOT_IMPLEMENTED,
          undefined,
          'Soft-delete is not supported by the current storage adapter ' +
            '(documents schema lacks deleted_at).',
        );
      }
      throw err;
    }
  },
}));
