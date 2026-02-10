import { describe, expect, it } from 'vitest';

import { ResponseCode } from '../lib/apiResponse/types';
import { mapAuthErrorToResponseCode } from '../moleculer/apiGateService.template.ts';

describe('mapAuthErrorToResponseCode', () => {
  it('maps 401 unauthorized to NOT_AUTHORIZED', () => {
    expect(
      mapAuthErrorToResponseCode({
        statusCode: 401,
        code: 'UNAUTHORIZED',
      }),
    ).toBe(ResponseCode.NOT_AUTHORIZED);
  });

  it('maps 401 key expired to NOT_AUTHORIZED__TOKEN_EXPIRED', () => {
    expect(
      mapAuthErrorToResponseCode({
        statusCode: 401,
        code: 'KEY_EXPIRED',
      }),
    ).toBe(ResponseCode.NOT_AUTHORIZED__TOKEN_EXPIRED);
  });

  it('maps unknown 401 codes to NOT_AUTHORIZED__TOKEN_INVALID', () => {
    expect(
      mapAuthErrorToResponseCode({
        statusCode: 401,
        code: 'INVALID_KEY',
      }),
    ).toBe(ResponseCode.NOT_AUTHORIZED__TOKEN_INVALID);
  });

  it('maps 403 insufficient scopes to INSUFFICIENT_SCOPE', () => {
    expect(
      mapAuthErrorToResponseCode({
        statusCode: 403,
        code: 'INSUFFICIENT_SCOPES',
      }),
    ).toBe(ResponseCode.INSUFFICIENT_SCOPE);
  });

  it('maps other 403 codes to FORBIDDEN__INSUFFICIENT_RIGHTS', () => {
    expect(
      mapAuthErrorToResponseCode({
        statusCode: 403,
        code: 'TENANT_MISMATCH',
      }),
    ).toBe(ResponseCode.FORBIDDEN__INSUFFICIENT_RIGHTS);
  });
});
