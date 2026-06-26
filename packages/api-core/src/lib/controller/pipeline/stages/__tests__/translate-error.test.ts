// SPDX-License-Identifier: Apache-2.0
/**
 * translateError (Stage 12) unit tests.
 *
 * Wave 27 (PRD-065 / RFC-027 PR-1 AC — 4 cases per SPEC-021 §Stage 12):
 *   1. APIError rethrown as-is
 *   2. __ORCHESTRA_ERROR__ === true → APIError.fromJSON
 *   3. generic Error → APIError.fromError
 *   4. unknown → INTERNAL_ERROR
 */

import { describe, it, expect, vi } from 'vitest';
import { translateError } from '../translate-error';
import { APIError } from '../../../../error';
import { ResponseCode } from '../../../../apiResponse';
import type { PipelineContext, PipelineDeps } from '../../types';

// ---------------------------------------------------------------------------
// Minimal fixtures
// ---------------------------------------------------------------------------

function makeCtx(): PipelineContext {
  return { ctx: {} as PipelineContext['ctx'] };
}

function makeDeps(): PipelineDeps {
  return {
    action: {
      name: 'test.action',
      rest: undefined,
      path: 'test.action',
      options: {} as PipelineDeps['action']['options'],
    } as PipelineDeps['action'],
    service: {} as PipelineDeps['service'],
    logger: {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      trace: vi.fn(),
      fatal: vi.fn(),
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('translateError (Stage 12)', () => {
  // Case 1: APIError rethrown as-is
  it('returns an APIError instance unchanged when the thrown value is already an APIError', () => {
    const original = new APIError(ResponseCode.NOT_FOUND);
    const result = translateError(original, makeCtx(), makeDeps());
    expect(result).toBe(original);
  });

  // Case 2: Orchestra cross-service error → APIError.fromJSON
  it('converts an Orchestra error object (__ORCHESTRA_ERROR__ === true) via APIError.fromJSON', () => {
    const orchestraError = {
      __ORCHESTRA_ERROR__: true,
      code: ResponseCode.FORBIDDEN,
      message: 'Forbidden: Insufficient rights',
      data: undefined,
    };

    const result = translateError(orchestraError, makeCtx(), makeDeps());

    expect(result).toBeInstanceOf(APIError);
    const apiError = result as APIError;
    expect(apiError.code).toBe(ResponseCode.FORBIDDEN);
  });

  // Case 3: Generic Error → APIError.fromError
  it('wraps a generic Error via APIError.fromError', () => {
    const generic = new Error('db connection lost');
    const result = translateError(generic, makeCtx(), makeDeps());

    expect(result).toBeInstanceOf(APIError);
    const apiError = result as APIError;
    // fromError defaults to INTERNAL_ERROR for errors without statusCode
    expect(apiError.code).toBe(ResponseCode.INTERNAL_ERROR);
    expect(apiError.message).toContain('db connection lost');
  });

  // Case 4: Unknown value (non-Error) → INTERNAL_ERROR + logger.error
  it('returns a new APIError(INTERNAL_ERROR) for completely unknown thrown values', () => {
    const deps = makeDeps();
    const result = translateError('a raw string error', makeCtx(), deps);

    expect(result).toBeInstanceOf(APIError);
    const apiError = result as APIError;
    expect(apiError.code).toBe(ResponseCode.INTERNAL_ERROR);
    // Should have logged the unknown error
    expect(deps.logger?.error).toHaveBeenCalledWith('Unknown error occurred', 'a raw string error');
  });

  // Edge: null thrown value (also unknown)
  it('returns INTERNAL_ERROR for thrown null', () => {
    const deps = makeDeps();
    const result = translateError(null, makeCtx(), deps);

    expect(result).toBeInstanceOf(APIError);
    const apiError = result as APIError;
    expect(apiError.code).toBe(ResponseCode.INTERNAL_ERROR);
    expect(deps.logger?.error).toHaveBeenCalledWith('Unknown error occurred', null);
  });

  // Case 5 (issue #115): a transport-serialised / dual-package APIError that lost
  // its prototype identity is recognised structurally and rebuilt preserving its
  // ResponseCode — NOT collapsed to INTERNAL_ERROR via the generic `fromError` path.
  it('preserves the ResponseCode of a transport-serialised APIError (issue #115)', () => {
    // Shape an APIError takes after crossing the Moleculer transport boundary:
    // a plain object — not `instanceof APIError`, no `__ORCHESTRA_ERROR__` brand —
    // that still carries `name: 'APIError'` and a valid ResponseCode `code`.
    const serialised = {
      name: 'APIError',
      code: ResponseCode.CONFLICT,
      message: 'Conflict: X already exists',
      data: undefined,
    };

    const result = translateError(serialised, makeCtx(), makeDeps());

    expect(result).toBeInstanceOf(APIError);
    const apiError = result as APIError;
    expect(apiError.code).toBe(ResponseCode.CONFLICT);
    expect(apiError.httpCode).toBe(409);
    // message preserved verbatim — not double-prefixed, not "Internal server error: …"
    expect(apiError.message).toBe('Conflict: X already exists');
  });

  // Case 6 (issue #115): the `__API_ERROR__` brand (emitted by APIError.toJSON) is
  // also accepted as a structural signal even when `name` is absent.
  it('recognises a serialised APIError via the __API_ERROR__ brand (issue #115)', () => {
    const serialised = {
      __API_ERROR__: true,
      code: ResponseCode.CONFLICT,
      message: 'Conflict: duplicate',
    };

    const result = translateError(serialised, makeCtx(), makeDeps());

    expect((result as APIError).code).toBe(ResponseCode.CONFLICT);
  });

  // Case 7 (issue #115 guard): an object that merely has `name: 'APIError'` but an
  // unknown `code` must NOT hijack the path — it falls through to INTERNAL_ERROR.
  it('does not misclassify an object with an invalid code as an APIError (issue #115)', () => {
    const notReally = { name: 'APIError', code: 'not-a-real-code', message: 'x' };

    const result = translateError(notReally, makeCtx(), makeDeps());

    expect((result as APIError).code).toBe(ResponseCode.INTERNAL_ERROR);
  });
});
