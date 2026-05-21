// SPDX-License-Identifier: Apache-2.0
/**
 * validateResponse (Stage 10) unit tests.
 *
 * Wave 27 (PRD-065 / RFC-027 PR-4 AC — ≥6 cases per SPEC-021 §Stage 10):
 *   1. RESPONSE_VALIDATION === false → no-op pass-through regardless of response validity
 *   2. RESPONSE_VALIDATION === true + valid response → pass-through unchanged
 *   3. RESPONSE_VALIDATION === true + invalid + action strict true → throws APIError(BAD_REQUEST__INVALID_RESPONSE)
 *   4. RESPONSE_VALIDATION === true + invalid + deps.strictResponseValidation true → throws
 *   5. RESPONSE_VALIDATION === true + invalid + neither strict flag → logs error, passes through
 *   6. result.data undefined edge — validator called with undefined, validation result respected
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ResponseCode } from '../../../../apiResponse';
import { APIError } from '../../../../error';
import type { PipelineContext, PipelineDeps } from '../../types';

// ---------------------------------------------------------------------------
// Config mock — vi.hoisted ensures mockConfigState is accessible in vi.mock factory
// ---------------------------------------------------------------------------

const mockConfig = vi.hoisted(() => ({
  RESPONSE_VALIDATION: true as boolean,
}));

// Path resolved from validate-response.ts (stages/): ../../../../config = src/config
vi.mock('../../../../../config', () => ({
  default: mockConfig,
}));

import { validateResponse } from '../validate-response';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeResponseValidator(success: boolean, errors?: unknown[]) {
  return vi.fn().mockReturnValue({ success, errors });
}

function makeDeps(
  validatorResult: { success: boolean; errors?: unknown[] },
  strictFlags?: {
    actionStrict?: boolean;
    depsStrict?: boolean;
  },
): PipelineDeps {
  return {
    action: {
      name: 'test.action',
      rest: undefined,
      path: 'test.action',
      options: {
        auth: 'none',
        strictResponseValidation: strictFlags?.actionStrict,
        response: makeResponseValidator(validatorResult.success, validatorResult.errors),
      },
    } as unknown as PipelineDeps['action'],
    service: {} as PipelineDeps['service'],
    logger: {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      trace: vi.fn(),
      fatal: vi.fn(),
    },
    strictResponseValidation: strictFlags?.depsStrict,
  };
}

function makeCtx(data: unknown = { id: '1' }): PipelineContext {
  return {
    ctx: {} as PipelineContext['ctx'],
    result: { data },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('validateResponse (Stage 10)', () => {
  beforeEach(() => {
    // Default to validation enabled; individual tests override as needed
    mockConfig.RESPONSE_VALIDATION = true;
  });

  // Case 1: RESPONSE_VALIDATION === false → no-op
  it('RESPONSE_VALIDATION=false → returns ctx unchanged, response validator not called', async () => {
    mockConfig.RESPONSE_VALIDATION = false;

    const deps = makeDeps({ success: false, errors: ['bad'] });
    const ctx = makeCtx({ id: '1' });

    const result = await validateResponse(ctx, deps);

    expect(result).toBe(ctx);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect((deps.action.options as any).response).not.toHaveBeenCalled();
  });

  // Case 2: RESPONSE_VALIDATION=true + valid → pass-through
  it('RESPONSE_VALIDATION=true + valid response → returns ctx unchanged, no throw', async () => {
    mockConfig.RESPONSE_VALIDATION = true;

    const deps = makeDeps({ success: true });
    const ctx = makeCtx({ id: '1' });

    const result = await validateResponse(ctx, deps);

    expect(result).toBe(ctx);
    expect(deps.logger?.error).not.toHaveBeenCalled();
  });

  // Case 3: RESPONSE_VALIDATION=true + invalid + action strict → throws APIError
  it('RESPONSE_VALIDATION=true + invalid + action.strictResponseValidation=true → throws APIError(BAD_REQUEST__INVALID_RESPONSE)', async () => {
    mockConfig.RESPONSE_VALIDATION = true;

    const errors = ['field.id is required'];
    const deps = makeDeps({ success: false, errors }, { actionStrict: true });
    const ctx = makeCtx({ bad: 'data' });

    let caught: APIError | undefined;
    try {
      await validateResponse(ctx, deps);
    } catch (err) {
      caught = err as APIError;
    }
    expect(caught).toBeInstanceOf(APIError);
    expect(caught?.code).toBe(ResponseCode.BAD_REQUEST__INVALID_RESPONSE);
  });

  // Case 4: RESPONSE_VALIDATION=true + invalid + deps.strictResponseValidation=true → throws
  it('RESPONSE_VALIDATION=true + invalid + deps.strictResponseValidation=true → throws APIError(BAD_REQUEST__INVALID_RESPONSE)', async () => {
    mockConfig.RESPONSE_VALIDATION = true;

    const deps = makeDeps({ success: false, errors: ['field.name missing'] }, { depsStrict: true });
    const ctx = makeCtx({ partial: true });

    let caught: APIError | undefined;
    try {
      await validateResponse(ctx, deps);
    } catch (err) {
      caught = err as APIError;
    }
    expect(caught).toBeInstanceOf(APIError);
    expect(caught?.code).toBe(ResponseCode.BAD_REQUEST__INVALID_RESPONSE);
  });

  // Case 5: RESPONSE_VALIDATION=true + invalid + neither strict → logs error, passes through
  it('RESPONSE_VALIDATION=true + invalid + no strict flag → logs error via logger.error, returns ctx', async () => {
    mockConfig.RESPONSE_VALIDATION = true;

    const errors = ['something off'];
    const deps = makeDeps({ success: false, errors });
    const ctx = makeCtx({ partial: true });

    const result = await validateResponse(ctx, deps);

    expect(result).toBe(ctx);
    expect(deps.logger?.error).toHaveBeenCalledWith(
      'test.action',
      'Response validation failed',
      errors,
    );
  });

  // Case 6: result.data undefined → validator called with undefined, strict mode throws
  it('result.data undefined + strict mode → throws (validator called with undefined)', async () => {
    mockConfig.RESPONSE_VALIDATION = true;

    const deps = makeDeps({ success: false, errors: ['data required'] }, { actionStrict: true });
    // Construct ctx with result.data === undefined explicitly
    const ctx: PipelineContext = {
      ctx: {} as PipelineContext['ctx'],
      result: { data: undefined as unknown as never },
    };

    let caught: APIError | undefined;
    try {
      await validateResponse(ctx, deps);
    } catch (err) {
      caught = err as APIError;
    }
    expect(caught).toBeInstanceOf(APIError);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect((deps.action.options as any).response).toHaveBeenCalledWith(undefined);
  });
});
