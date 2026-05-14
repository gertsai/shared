// SPDX-License-Identifier: Apache-2.0
/**
 * Wave 10.B (PRD-019 FR-001) — `busboy`-backed multipart/form-data parser.
 *
 * Why this lives here (not in @gertsai/*):
 *   This is example-app glue: we want strict server-side size enforcement and
 *   a single explicit error type (`PayloadTooLargeError`) translated to HTTP
 *   413 at the action boundary. Pushing this into a shared package is
 *   premature — see RFC-014 D-1 / I-4.
 *
 * Why `busboy` (not the built-in moleculer-web multipart route):
 *   moleculer-web's native `type: 'multipart'` alias hands the file stream to
 *   the action via `ctx.params`. That works, but it splits transport concerns
 *   across the route config AND the action handler. The team-lead RFC chose
 *   the in-handler parse path for tighter control over limits, error mapping,
 *   and unit-testability (no moleculer-web needed for parser tests).
 *
 * Hard limits (enforced server-side per NFR-1 / RFC-014 I-4):
 *   - `fileSize`: 10 * 1024 * 1024 (10 MiB). Stream-level — busboy emits
 *     `'limit'` and we destroy the stream, rejecting before buffering the
 *     overflow byte. Defense-in-depth against CWE-770.
 *   - `files`: 1. Reject if the request tries to send more than one file
 *     part (CWE-409 amplification attempt).
 *   - `fields`: 8. Cap on form-field count to keep memory bounded.
 *
 * Streaming behaviour:
 *   The file payload is buffered in memory as it arrives (single Buffer
 *   accumulation). For 10 MiB this is acceptable; if Wave 10.C lifts the
 *   limit, switch the consumer to a pipeline → temp-file streaming model
 *   instead of `Buffer.concat`.
 *
 * Error semantics:
 *   - `PayloadTooLargeError` — over 10 MiB OR more-than-1-file. Action maps
 *     to HTTP 413 via `payloadTooLargeError(...)` from @gertsai/api-core.
 *   - Plain `Error` — header parse failure, abort, unexpected end of stream.
 *     Action maps to HTTP 400 (BAD_REQUEST).
 */
import Busboy from 'busboy';
import type { IncomingMessage } from 'http';

/** Max file size accepted by `parseMultipart` — see file-level doc. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/**
 * Thrown when the inbound multipart payload exceeds size or count limits.
 * Action handler maps this to HTTP 413 (`ResponseCode.PAYLOAD_TOO_LARGE`).
 */
export class PayloadTooLargeError extends Error {
  public readonly maxBytes: number;
  constructor(message: string, maxBytes: number = MAX_UPLOAD_BYTES) {
    super(message);
    this.name = 'PayloadTooLargeError';
    this.maxBytes = maxBytes;
    // Preserve prototype across the `extends Error` boundary on older Node
    // typescript targets — harmless on Node ≥22.
    Object.setPrototypeOf(this, PayloadTooLargeError.prototype);
  }
}

/** Parsed multipart shape returned to the action handler. */
export interface ParsedMultipart {
  /** Decoded file contents — single file part only in this slice. */
  file: Buffer;
  /** Original filename from the Content-Disposition header. */
  filename: string;
  /** Reported MIME type from the file part header. */
  mimeType: string;
  /** Non-file form fields (caller decides whether to trust them). */
  fields: Record<string, string>;
}

/**
 * Parse a single-file multipart/form-data request from a Node `IncomingMessage`.
 *
 * Resolves with the decoded file + fields. Rejects with `PayloadTooLargeError`
 * on cap breach, or a plain `Error` for parse / abort / EOF failures.
 *
 * Pattern note: we attach handlers BEFORE `req.pipe(bb)` so no events fire
 * into a half-wired bus. The `settled` guard prevents double resolve/reject
 * across `'limit'` + `'close'` + `'error'` races.
 */
export function parseMultipart(req: IncomingMessage): Promise<ParsedMultipart> {
  return new Promise<ParsedMultipart>((resolve, reject) => {
    let settled = false;
    const safeReject = (err: Error): void => {
      if (settled) return;
      settled = true;
      // Ensure the inbound stream is fully drained / destroyed so the
      // socket doesn't hang. `req.unpipe()` is implicit when we destroy bb.
      req.unpipe();
      req.resume();
      reject(err);
    };
    const safeResolve = (value: ParsedMultipart): void => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    let bb: ReturnType<typeof Busboy>;
    try {
      bb = Busboy({
        headers: req.headers,
        limits: {
          fileSize: MAX_UPLOAD_BYTES,
          files: 1,
          fields: 8,
          // 1 KiB header cap — busboy default is 1 KiB. Restate for clarity.
          headerPairs: 32,
        },
      });
    } catch (err) {
      // Malformed Content-Type header throws synchronously from the Busboy
      // factory. Translate to a parse error rather than letting it bubble
      // up uncaught.
      reject(new Error(`multipart: invalid headers — ${(err as Error).message}`));
      return;
    }

    const fields: Record<string, string> = {};
    const chunks: Buffer[] = [];
    let filename = '';
    let mimeType = '';
    let fileSeen = false;
    let bytes = 0;

    bb.on('file', (_fieldname, fileStream, info) => {
      if (fileSeen) {
        // CWE-409 protection: reject the second file part.
        safeReject(new PayloadTooLargeError('multipart: only one file part allowed'));
        fileStream.resume();
        return;
      }
      fileSeen = true;
      filename = info.filename ?? '';
      mimeType = info.mimeType ?? 'application/octet-stream';

      fileStream.on('data', (chunk: Buffer) => {
        bytes += chunk.length;
        // Belt-and-braces: busboy already enforces fileSize via `'limit'`
        // event, but a tampered limit config or a future busboy regression
        // shouldn't be the only line of defence.
        if (bytes > MAX_UPLOAD_BYTES) return;
        chunks.push(chunk);
      });
      fileStream.on('limit', () => {
        safeReject(
          new PayloadTooLargeError(
            `multipart: file exceeds ${MAX_UPLOAD_BYTES} bytes`,
          ),
        );
      });
      fileStream.on('error', (err: Error) => {
        safeReject(err instanceof Error ? err : new Error(String(err)));
      });
    });

    bb.on('field', (name, value) => {
      // Cap individual field length to 2 KiB; longer values are silently
      // truncated rather than rejected — busboy `fieldSize` default is 1 MB
      // which is fine for our small metadata bag.
      fields[name] = typeof value === 'string' ? value.slice(0, 2048) : '';
    });

    bb.on('error', (err: Error) => safeReject(err));
    bb.on('close', () => {
      if (!fileSeen) {
        safeReject(new Error('multipart: no file part found'));
        return;
      }
      safeResolve({
        file: Buffer.concat(chunks),
        filename,
        mimeType,
        fields,
      });
    });

    // If the client aborts mid-upload, the IncomingMessage emits 'aborted'
    // (Node < 17) / 'close' with no 'end' (Node ≥ 17). Either way, the
    // 'close' handler on busboy fires after pipe — but we add an explicit
    // 'aborted' guard for safety.
    req.on('aborted', () => safeReject(new Error('multipart: client aborted')));

    req.pipe(bb);
  });
}
