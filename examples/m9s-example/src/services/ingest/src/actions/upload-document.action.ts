// SPDX-License-Identifier: Apache-2.0
/**
 * Upload Document Action — `v1.ingest.upload` (PRD-019 FR-001).
 *
 * REST: `POST /api/v1/ingest/upload` accepting `multipart/form-data` with a
 * single `file` field (≤10 MiB, UTF-8 text). Optional `docId` form field.
 *
 * Pipeline:
 *   1. Pull the raw `req` via moleculer-web's `passReqResToParams: true`
 *      (alias config in the rest object — see `rest:` below). Body parsers
 *      (JSON, urlencoded) skip multipart/form-data, so the request stream is
 *      still intact when we reach the handler.
 *   2. Parse via `parseMultipart` (busboy under the hood; 10 MiB cap).
 *   3. Decode the file buffer as UTF-8 text. Reject non-text MIME types.
 *   4. Generate `docId` (crypto.randomUUID()) if absent.
 *   5. Delegate to the existing `v1.ingest.document` action via `broker.call`
 *      — reuses queue gating + session-guard + use case wiring already
 *      battle-tested in `ingest-document.action.ts`.
 *   6. Map `PayloadTooLargeError` → HTTP 413 via
 *      `ResponseCode.PAYLOAD_TOO_LARGE`. Any session-guard rejection from
 *      the downstream call bubbles up as the existing APIError.
 *
 * Observability (PRD-019 NFR-2):
 *   - One INFO line per request: bytes, docId. NEVER the body content
 *     (CWE-532).
 *
 * Session-guard discipline mirrors `ingest-document.action.ts`: we DON'T
 * re-assert session here — the broker.call into `v1.ingest.document` will
 * run those checks. Re-asserting twice would double-log and split the
 * 401/403 boundary across two action frames.
 */
import { randomUUID } from 'crypto';

import { APIError, ResponseCode } from '@gertsai/api-core/contracts';
import typia from 'typia';

import { defineAction } from '../../../../lib/define-action';
import { resolveExampleController } from '../../../../lib/example-controller';
import { tryGetRequestContextFromCtx } from '../../../../composition/wave5-middlewares';
import {
  MAX_UPLOAD_BYTES,
  PayloadTooLargeError,
  parseMultipart,
} from '../multipart-parser';
import type {
  IngestServiceContext,
  IngestDocumentResponse,
} from '../../types';

/**
 * Public request shape — `multipart/form-data` is decoded by `parseMultipart`
 * so the typia validator is intentionally permissive: the action's typia
 * validator runs over an empty `params` object (the body is not JSON), and
 * the meaningful validation happens inline against the parsed multipart.
 */
interface UploadDocumentEnvelope {
  // moleculer-web injects $req/$res when passReqResToParams: true. typia
  // tolerates unknown fields by default, so we just allow them through.
}

/**
 * Response shape — mirrors the upload contract in PRD-019 FR-001:
 * `{docId, bytes, status: 'queued'}`. We always report 'queued' from this
 * action's POV — actual inline-vs-queued semantics live inside the
 * downstream `v1.ingest.document` call (the upload caller doesn't care
 * which path the pipeline took).
 */
interface UploadDocumentResponse {
  docId: string;
  bytes: number;
  status: 'queued';
}

const controller = resolveExampleController<'v1', 'ingest', IngestServiceContext>('v1', 'ingest');

// EVID-036 audit fix (P2 / W-Logic-4): unify docId regex with delete-document
// (`^[A-Za-z0-9_-]{1,128}$`) so an upload-then-delete round-trip works for
// any caller-supplied id. The previous lowercase-only pattern caused
// `randomUUID()`-generated ids (which are lowercase + length 36) to succeed
// but rejected mixed-case ids that the delete action happily accepted.
const DOC_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

// Accept text/plain and markdown variants (PRD-019 FR-003 scope). PDF / Word
// land in Wave 10.C — file-level MIME enforcement matches the client-side
// `accept=".txt,.md,text/plain"` so a malicious client can't bypass.
const TEXT_MIME_RE = /^text\/(plain|markdown|x-markdown)$/i;

export const uploadDocument = defineAction(controller.register('upload', {
  // Auth handled inside the downstream `v1.ingest.document` (see
  // RFC-014 D-3 — session-guard happens at the pipeline boundary, not at
  // every alias) so curl-without-auth still exercises the upload path in
  // dev. Production wiring should switch to `auth: 'required'`.
  auth: 'none',

  // Multipart access pattern: cast forces the extra `passReqResToParams`
  // field through the api-core RestSchema (which omits it from the public
  // type). moleculer-web reads `req.$alias.passReqResToParams` and copies
  // `req`/`res` into `params.$req`/`params.$res` (see moleculer-web
  // src/index.js:641). Body parsers skip multipart Content-Type so the
  // request stream is intact when we reach the handler.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rest: {
    method: 'POST',
    path: '/ingest/upload',
    passReqResToParams: true,
  } as any,

  // Typia validator tolerates the $req/$res injection. We do real validation
  // on the parsed multipart payload below.
  params: typia.createValidate<UploadDocumentEnvelope>(),
  response: typia.createValidate<UploadDocumentResponse>(),

  responseCode: ResponseCode.SUCCESS_CREATED,
  responseMessage: 'Upload accepted for ingestion',

  async handler({ params, ctx, logger, respond }) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawReq = (params as any).$req;
    if (!rawReq) {
      // Defensive: someone misconfigured the route. Surface as 400 — better
      // than a 500 stack trace.
      throw new APIError(
        ResponseCode.BAD_REQUEST,
        undefined,
        'Upload route misconfigured (raw request not available)',
      );
    }

    let parsed;
    try {
      parsed = await parseMultipart(rawReq);
    } catch (err) {
      if (err instanceof PayloadTooLargeError) {
        const maxMB = (err.maxBytes / (1024 * 1024)).toFixed(1);
        logger.warn('[v1.ingest.upload] rejected — payload too large', {
          maxBytes: err.maxBytes,
        });
        throw new APIError(
          ResponseCode.PAYLOAD_TOO_LARGE,
          { maxSize: err.maxBytes },
          `Upload exceeds maximum size of ${maxMB}MB`,
        );
      }
      // Any other parse failure — surface as 400 with a stable message
      // (no err.stack leak).
      logger.warn('[v1.ingest.upload] multipart parse failed', {
        reason: (err as Error).message,
      });
      throw new APIError(
        ResponseCode.BAD_REQUEST,
        undefined,
        `Invalid multipart upload: ${(err as Error).message}`,
      );
    }

    // Reject non-text MIME types early so the existing pipeline doesn't get
    // a binary blob shoehorned into its text-only contract.
    if (!TEXT_MIME_RE.test(parsed.mimeType)) {
      throw new APIError(
        ResponseCode.BAD_REQUEST,
        undefined,
        `Unsupported file type: ${parsed.mimeType} (expected text/plain or text/markdown)`,
      );
    }

    // UTF-8 decode. Buffer.toString('utf8') with malformed bytes silently
    // produces replacement characters — for this slice we accept that
    // tradeoff (alternative: TextDecoder with `fatal: true` and reject; can
    // be tightened in Wave 10.C if needed).
    const text = parsed.file.toString('utf8');
    if (text.length === 0) {
      throw new APIError(
        ResponseCode.BAD_REQUEST,
        undefined,
        'Empty file after UTF-8 decode',
      );
    }

    // EVID-036 audit fix (P0 / W-Security-9): an unauthenticated caller
    // MUST NOT be able to choose the docId. Otherwise an anonymous attacker
    // can overwrite any existing document by guessing its id. We only honor
    // a caller-supplied docId when a session is present (via the broker.call
    // ctx.meta path below). For anonymous uploads we always force a fresh
    // UUID.
    //
    // The session check looks at the same RequestContext that the downstream
    // `v1.ingest.document` will assert against — keeps the boundary single-
    // sourced.
    const { session: callerSession } = tryGetRequestContextFromCtx(ctx);
    const isAuthenticated = callerSession !== undefined;

    const candidateId = (parsed.fields['docId'] ?? '').trim();
    const docId = isAuthenticated && candidateId !== ''
      ? candidateId
      : randomUUID();

    if (!DOC_ID_RE.test(docId)) {
      throw new APIError(
        ResponseCode.BAD_REQUEST,
        undefined,
        `Invalid docId — must match ${DOC_ID_RE.source}`,
      );
    }

    const bytes = parsed.file.byteLength;
    logger.info('[v1.ingest.upload] received', {
      docId,
      bytes,
      mimeType: parsed.mimeType,
    });

    // Delegate to the existing ingest pipeline. broker.call propagates
    // ctx.meta (user_uuid, tenant, trace headers) automatically — so
    // session-guard assertions inside `v1.ingest.document` see the same
    // session that called us.
    try {
      await ctx.broker.call<IngestDocumentResponse, { docId: string; text: string }>(
        'v1.ingest.document',
        { docId, text },
        { meta: ctx.meta },
      );
    } catch (err) {
      // Let APIErrors raised by the downstream action propagate untouched —
      // that's the whole point of delegating. Wrap unknown errors as 500.
      if (err instanceof APIError) {
        throw err;
      }
      logger.error('[v1.ingest.upload] downstream ingest failed', {
        docId,
        error: (err as Error).message,
      });
      throw err;
    }

    const response: UploadDocumentResponse = {
      docId,
      bytes,
      status: 'queued',
    };
    return respond(response, 'Upload accepted for ingestion', ResponseCode.SUCCESS_CREATED);
  },
}));

// Re-export the cap so tests / docs can reference the single source of truth.
export { MAX_UPLOAD_BYTES };
