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
  assertAuthenticated,
  assertSessionInTenant,
} from '@gertsai/session-guard';
import typia from 'typia';

import config from '../../../../../project.config';
import { defineAction } from '@gertsai/api-core/moleculer';
import { resolveExampleController } from '../../../../lib/example-controller';
import { ForbiddenError } from '../../../../shared/errors';
import { tryGetRequestContextFromCtx } from '../../../../composition/wave5-middlewares';
import { INGEST_QUEUE_NAME, JOB_PROCESS_DOCUMENT } from '../queues';
import { emitSse } from '../sse-emitter';
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

export const ingestDocument = defineAction(controller.register('document', {
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

    // Wave 10.B (PRD-019 FR-002) — SSE lifecycle frames are emitted from
    // inside the try {...} below. `started` only fires AFTER the session
    // guards pass so rejected requests do not leak a phantom lifecycle to
    // other tabs watching this docId; `error` fires in the catch with the
    // domain error message so terminal failures still close the stream.
    try {
      // Wave 9.0.1 fix — assert session-guard invariants BEFORE deciding the
      // queue vs inline path. Pre-fix, the action enqueued first and the
      // worker ran assertions later, so an unauthenticated/wrong-tenant
      // request still received `mode: 'queued'` success (silent acceptance)
      // and the job failed downstream where the caller could no longer see
      // the rejection. Asserting early surfaces 401/403 synchronously on the
      // request that triggered it — the correct REST semantic.
      //
      // Sprint 3.10 Addendum 2 — wire Wave 5 RequestContext through to use
      // case. tryGetRequestContextFromCtx returns `{ session, expectedTenantId
      // }` populated when sessionMiddleware composed an authenticated
      // RequestContext (or when an e2e test passed `meta.testSession` —
      // Wave 9.0.1 test seam).
      //
      // Wave 12.E-fix-1 (PRD-038 FR-002 / EVID-053 CRIT-2 / CWE-862):
      // Authentication is now MANDATORY. Pre-fix the guard was conditional
      // (`if (session !== undefined) { ... }`) so unauthenticated POSTs
      // proceeded with no tenant scoping — the use case happily ingested
      // documents under whatever tenant the wire said. Now fails closed.
      const { session, expectedTenantId } = tryGetRequestContextFromCtx(ctx);
      assertAuthenticated(session);
      if (expectedTenantId !== undefined) {
        assertSessionInTenant(session, expectedTenantId);
      }

      // Wave 10.B — broadcast lifecycle start. Done after auth assertions
      // succeed so rejected requests do not leak a `started` event.
      emitSse({ kind: 'started', docId, ts: Date.now() });

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

        // Queued path: worker emits `embedding`/`persisted`/`done` after
        // each pipeline stage completes (Wave 10.B+ follow-up). Here we
        // only emit `started` above; the SSE consumer keeps the stream
        // open until those terminal frames arrive or the 30s idle timeout
        // fires server-side.
        logger.info('[v1.ingest.document] enqueued', response);
        return respond(response, 'Document accepted for ingestion', ResponseCode.SUCCESS_CREATED);
      }

      const { chunkCount } = await service.useCase.execute({
        docId,
        text,
        userId,
        ...(metadata !== undefined && { metadata }),
        // Session is now always present post Wave 12.E-fix-1 FR-002.
        session,
        ...(expectedTenantId !== undefined && { expectedTenantId }),
      });

      // Wave 10.B — inline path runs the full pipeline in this call, so the
      // four-frame lifecycle is synthesised here. Real embedding/persist
      // stages happen inside `service.useCase.execute`; this emits the
      // marker frames around the synchronous boundary so the UI panel
      // renders the canonical 4-event sequence without backend hooks.
      emitSse({ kind: 'embedding', docId, ts: Date.now() });
      emitSse({
        kind: 'persisted',
        docId,
        ts: Date.now(),
        detail: `chunkCount=${chunkCount}`,
      });
      emitSse({ kind: 'done', docId, ts: Date.now() });

      const response: IngestDocumentResponse = {
        docId,
        jobId: `inline-${Date.now()}-${chunkCount}`,
        mode: 'inline',
        chunkCount,
      };

      logger.info('[v1.ingest.document] processed inline', response);
      return respond(response, 'Document accepted for ingestion', ResponseCode.SUCCESS_CREATED);
    } catch (err) {
      // Wave 10.B — surface failures to any open SSE listener so the UI
      // panel can show a terminal `error` row instead of dangling at
      // `started`. Done BEFORE the domain→HTTP mapping so the wire frame
      // always fires, even when the eventual `throw` is intercepted by the
      // framework's default error handler.
      emitSse({
        kind: 'error',
        docId,
        ts: Date.now(),
        detail: err instanceof Error ? err.message : String(err),
      });

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
}));
