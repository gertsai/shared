// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { InternalError } from '../errors/internal.js';
import { appErrorToGrpcStatus } from '../grpc/index.js';
import { appErrorToHttpResponse } from '../http/index.js';

describe('redactDetails (ADR-006 I-14)', () => {
  it('strips password / api_key from /http response, retains user_id', () => {
    const err = new InternalError({
      message: 'leak',
      details: {
        password: 'secret-pwd',
        api_key: 'sk-live-xxx',
        user_id: 'kept',
      },
    });
    const { body } = appErrorToHttpResponse(err);
    expect(body.details!.password).toBe('[REDACTED]');
    expect(body.details!.api_key).toBe('[REDACTED]');
    expect(body.details!.user_id).toBe('kept');
  });

  it('strips token / authorization / cookie / privateKey case-insensitively', () => {
    const err = new InternalError({
      message: 'leak',
      details: {
        Token: 'jwt-x',
        Authorization: 'Bearer x',
        Cookie: 'sid=x',
        privateKey: '-----BEGIN-----',
        plain: 'ok',
      },
    });
    const { body } = appErrorToHttpResponse(err);
    expect(body.details!.Token).toBe('[REDACTED]');
    expect(body.details!.Authorization).toBe('[REDACTED]');
    expect(body.details!.Cookie).toBe('[REDACTED]');
    expect(body.details!.privateKey).toBe('[REDACTED]');
    expect(body.details!.plain).toBe('ok');
  });

  it('strips secrets from /grpc status payload', () => {
    const err = new InternalError({
      message: 'leak',
      details: {
        password: 'p',
        secret: 's',
        connection_string: 'pg://...',
        keep: 'this',
      },
    });
    const status = appErrorToGrpcStatus(err);
    expect(status.details.password).toBe('[REDACTED]');
    expect(status.details.secret).toBe('[REDACTED]');
    expect(status.details.connection_string).toBe('[REDACTED]');
    expect(status.details.keep).toBe('this');
  });

  it('internal toJSON does NOT redact (logs only)', () => {
    const err = new InternalError({
      message: 'leak',
      details: { password: 'raw-pwd', user_id: 'u1' },
    });
    const j = err.toJSON();
    expect(j.details.password).toBe('raw-pwd');
    expect(j.details.user_id).toBe('u1');
  });
});
