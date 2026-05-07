// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { BadGatewayError } from '../errors/bad-gateway.js';
import { InternalError } from '../errors/internal.js';
import { UpstreamFailureError } from '../errors/upstream-failure.js';
import { appErrorToHttpResponse } from '../http/index.js';

describe('Server bucket type collapse (Amendment 1.1.5 / security P1-6)', () => {
  it('UPSTREAM_FAILURE + BAD_GATEWAY + INTERNAL share urn:gertsai:errors:server', () => {
    const internal = appErrorToHttpResponse(
      new InternalError({ message: 'i', details: {} }),
    );
    const upstream = appErrorToHttpResponse(
      new UpstreamFailureError({ message: 'u', details: { upstream: 'svc' } }),
    );
    const bg = appErrorToHttpResponse(
      new BadGatewayError({ message: 'g', details: { upstream: 'cdn' } }),
    );

    expect(internal.body.type).toBe('urn:gertsai:errors:server');
    expect(upstream.body.type).toBe('urn:gertsai:errors:server');
    expect(bg.body.type).toBe('urn:gertsai:errors:server');
  });

  it('preserves distinct status codes despite collapsed type', () => {
    const internal = appErrorToHttpResponse(
      new InternalError({ message: 'i', details: {} }),
    );
    const upstream = appErrorToHttpResponse(
      new UpstreamFailureError({ message: 'u', details: {} }),
    );
    const bg = appErrorToHttpResponse(new BadGatewayError({ message: 'g', details: {} }));
    expect(internal.status).toBe(500);
    expect(upstream.status).toBe(502);
    expect(bg.status).toBe(502);
  });
});
