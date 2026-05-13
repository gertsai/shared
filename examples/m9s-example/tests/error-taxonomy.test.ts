// SPDX-License-Identifier: Apache-2.0
/**
 * Wave 8.1 / PRD-013 — Error-taxonomy migration tests.
 *
 * Asserts the canonical contract of the m9s-example error facade after
 * the legacy `PermissionDeniedError` class was deleted in favour of the
 * `@gertsai/errors` taxonomy. Wave 8.3 split the facade into two modules:
 *   - `src/shared/errors.ts` — neutral kernel (re-exports + `permissionDenied`)
 *   - `src/composition/errors.ts` — HTTP-boundary scrubber (`appErrorToHttpResponse`)
 *
 * What's covered:
 *   1. `permissionDenied()` returns a `ForbiddenError` with the legacy
 *      message + details shape preserved (audit/log greps keep matching).
 *   2. `appErrorToHttpResponse()` emits an RFC 9457 ProblemDetails shape
 *      with `status: 403` and `type: 'urn:gertsai:errors:permission'`.
 *   3. The discriminated `ErrorKind` union narrows correctly behind
 *      `isAppError` + `kind === ErrorKind.FORBIDDEN`.
 *   4. Inbound adapters can keep using `instanceof ForbiddenError` to
 *      catch permission errors (regression check for the action/worker
 *      catch blocks).
 */
import { describe, it, expect } from 'vitest';

import {
  permissionDenied,
  ForbiddenError,
  ErrorKind,
  isAppError,
} from '../src/shared/errors.js';
import { appErrorToHttpResponse } from '../src/composition/errors.js';

describe('m9s-example error taxonomy (Wave 8.1)', () => {
  it('permissionDenied() returns a ForbiddenError with legacy message + details shape', () => {
    const err = permissionDenied('alice', 'ingest', 'doc-123');

    expect(err).toBeInstanceOf(ForbiddenError);
    expect(isAppError(err)).toBe(true);
    expect(err.kind).toBe(ErrorKind.FORBIDDEN);
    expect(err.message).toBe("User 'alice' is not allowed to 'ingest' on 'doc-123'");
    expect(err.details).toEqual({
      userId: 'alice',
      action: 'ingest',
      resource: 'doc-123',
    });
  });

  it('appErrorToHttpResponse() emits RFC 9457 ProblemDetails with userId scrubbed (Wave 8.2 Sec#3)', () => {
    const err = permissionDenied('alice', 'ingest', 'doc-123');
    const { status, body } = appErrorToHttpResponse(err);

    expect(status).toBe(403);
    expect(body.type).toBe('urn:gertsai:errors:permission');
    expect(body.status).toBe(403);
    expect(body.title).toBe(err.message);
    // Wave 8.2 audit Sec#3 (CWE-209): `userId` is stripped from the HTTP
    // boundary `details` to prevent user enumeration via 403 responses;
    // `action` and `resource` remain (operational signal, not PII).
    expect(body.details).toEqual({
      action: 'ingest',
      resource: 'doc-123',
    });
    expect(body.details).not.toHaveProperty('userId');
    // The server-side AppError still carries the full payload — only the
    // HTTP body is scrubbed. Logs / cause chain remain unredacted by
    // intent (they go through logger redaction independently).
    expect(err.details).toEqual({
      userId: 'alice',
      action: 'ingest',
      resource: 'doc-123',
    });
  });

  it('discriminated union narrows via isAppError + kind === FORBIDDEN', () => {
    const err: unknown = permissionDenied('alice', 'ingest', 'doc-123');

    if (isAppError(err) && err.kind === ErrorKind.FORBIDDEN) {
      // Narrowed: `err.details` is the ForbiddenError detail shape, which in
      // our usage includes `{ userId, action, resource }`. The cast is just a
      // type hint for the closed `details` payload — runtime behaviour is
      // already covered by the first test.
      const d = err.details as { userId: string; action: string; resource: string };
      expect(d.userId).toBe('alice');
      expect(d.action).toBe('ingest');
      expect(d.resource).toBe('doc-123');
    } else {
      // If narrowing fails, fail loudly — the taxonomy contract is broken.
      throw new Error('expected ForbiddenError to narrow via isAppError + kind');
    }
  });

  it('inbound adapters can still catch via instanceof ForbiddenError', () => {
    const caught = (() => {
      try {
        throw permissionDenied('u', 'a', 'r');
      } catch (e) {
        return e instanceof ForbiddenError;
      }
    })();

    expect(caught).toBe(true);
  });
});
