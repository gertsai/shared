// SPDX-License-Identifier: Apache-2.0
/**
 * validateRequest (Stage 5) unit tests.
 *
 * Wave 27 (PRD-065 / RFC-027 PR-2 AC — ≥5 cases per SPEC-021 §Stage 5):
 *   1. Validator returns success=true → ctx returned unchanged
 *   2. Validator returns success=false → throws APIError(BAD_REQUEST__INVALID_PARAMS)
 *   3. Error carries the validation errors array from the validator result
 *   4. Uses getValidator(action.options.params) — legacy format (raw function)
 *   5. TypiaParamsWithSchema format — delegates to params.validate
 *   6. Validator called with the current ctx.params value
 */

import { describe, it, expect, vi } from 'vitest';
import { validateRequest } from '../validate-request';
import { APIError } from '../../../../error';
import { ResponseCode } from '../../../../apiResponse';
import type { PipelineContext, PipelineDeps } from '../../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDepsWithValidator(
  validatorFn: (value: unknown) => { success: boolean; errors?: unknown[] },
): PipelineDeps {
  return {
    action: {
      name: 'test.action',
      rest: undefined,
      path: 'test.action',
      options: {
        params: validatorFn,
      },
    } as unknown as PipelineDeps['action'],
    controller: {},
    service: {} as PipelineDeps['service'],
    logger: undefined,
  };
}

function makeCtxWithParams(params: unknown): PipelineContext {
  return {
    ctx: {} as PipelineContext['ctx'],
    params,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('validateRequest (Stage 5)', () => {
  // Case 1: Validator returns success=true → returns ctx unchanged
  it('returns ctx unchanged when validator returns { success: true }', async () => {
    const validator = vi.fn(() => ({ success: true }));
    const ctx = makeCtxWithParams({ id: '1' });
    const deps = makeDepsWithValidator(validator);

    const result = await validateRequest(ctx, deps);

    expect(result).toBe(ctx);
  });

  // Case 2: Validator returns success=false → throws APIError
  it('throws APIError(BAD_REQUEST__INVALID_PARAMS) when validator returns { success: false }', async () => {
    const validator = vi.fn(() => ({ success: false, errors: [] }));
    const ctx = makeCtxWithParams({ bad: 'value' });
    const deps = makeDepsWithValidator(validator);

    await expect(validateRequest(ctx, deps)).rejects.toThrow(APIError);
  });

  // Case 3: Error carries the validation errors array
  it('thrown APIError carries the errors array from the failed validation result', async () => {
    const validationErrors = [
      { path: '$.name', expected: 'string', value: 42 },
    ];
    const validator = vi.fn(() => ({ success: false, errors: validationErrors }));
    const ctx = makeCtxWithParams({ name: 42 });
    const deps = makeDepsWithValidator(validator);

    let caught: APIError | undefined;
    try {
      await validateRequest(ctx, deps);
    } catch (err) {
      caught = err as APIError;
    }

    expect(caught).toBeInstanceOf(APIError);
    expect(caught!.code).toBe(ResponseCode.BAD_REQUEST__INVALID_PARAMS);
    expect(caught!.data).toEqual(validationErrors);
  });

  // Case 4: Validator is called with ctx.params
  it('calls the validator with ctx.params', async () => {
    const paramsValue = { userId: 'u1', tenantId: 'ten1' };
    const validator = vi.fn(() => ({ success: true }));
    const ctx = makeCtxWithParams(paramsValue);
    const deps = makeDepsWithValidator(validator);

    await validateRequest(ctx, deps);

    expect(validator).toHaveBeenCalledWith(paramsValue);
  });

  // Case 5: TypiaParamsWithSchema format → uses params.validate internally
  it('works with TypiaParamsWithSchema format (validate function is used)', async () => {
    const validateFn = vi.fn(() => ({ success: true }));
    const typiaParamsWithSchema = {
      validate: validateFn,
      numericFields: [],
      booleanFields: [],
      arrayFields: [],
      __typia_params_with_schema__: true,
    };
    const ctx = makeCtxWithParams({ id: '1' });
    const deps: PipelineDeps = {
      action: {
        name: 'test.action',
        rest: undefined,
        path: 'test.action',
        options: {
          params: typiaParamsWithSchema,
        },
      } as unknown as PipelineDeps['action'],
      controller: {},
      service: {} as PipelineDeps['service'],
      logger: undefined,
    };

    const result = await validateRequest(ctx, deps);

    expect(validateFn).toHaveBeenCalledWith(ctx.params);
    expect(result).toBe(ctx);
  });

  // Case 6: APIError response code is exactly BAD_REQUEST__INVALID_PARAMS
  it('throws APIError with code BAD_REQUEST__INVALID_PARAMS (not INTERNAL_ERROR)', async () => {
    const validator = vi.fn(() => ({ success: false, errors: [{ path: '$.x' }] }));
    const ctx = makeCtxWithParams({});
    const deps = makeDepsWithValidator(validator);

    let caught: APIError | undefined;
    try {
      await validateRequest(ctx, deps);
    } catch (err) {
      caught = err as APIError;
    }

    expect(caught?.code).toBe(ResponseCode.BAD_REQUEST__INVALID_PARAMS);
    expect(caught?.code).not.toBe(ResponseCode.INTERNAL_ERROR);
  });
});
