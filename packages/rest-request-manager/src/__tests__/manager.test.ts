// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ConflictError,
  ForbiddenError,
  InternalError,
  NotFoundError,
  RateLimitedError,
  TimeoutError,
  UnauthorizedError,
  UpstreamFailureError,
  ValidationError,
} from '@gertsai/errors';

// Mock the transport before importing the SUT.
const httpCallerMock = vi.fn();
vi.mock('@gertsai/fetch', () => ({
  httpCaller: (...args: unknown[]) => httpCallerMock(...args),
}));

import { RestRequestManager } from '../manager.js';

interface MockResponseInit {
  readonly status?: number;
  readonly ok?: boolean;
  readonly contentType?: string;
  readonly body?: unknown;
  readonly headers?: Record<string, string>;
}

function mockResponse(init: MockResponseInit = {}): unknown {
  const status = init.status ?? 200;
  const ok = init.ok ?? (status >= 200 && status < 300);
  const contentType = init.contentType ?? 'application/json';
  const headerEntries = new Map<string, string>([
    ['content-type', contentType],
    ...Object.entries(init.headers ?? {}),
  ]);
  const headers = {
    get: (name: string): string | null => headerEntries.get(name.toLowerCase()) ?? null,
    forEach: (cb: (value: string, key: string) => void): void => {
      headerEntries.forEach((v, k) => cb(v, k));
    },
  };
  return {
    status,
    ok,
    headers,
    json: async (): Promise<unknown> => init.body,
    text: async (): Promise<string> =>
      typeof init.body === 'string' ? init.body : JSON.stringify(init.body ?? ''),
  };
}

describe('RestRequestManager', () => {
  beforeEach(() => {
    httpCallerMock.mockReset();
  });

  it('GET — convenience method dispatches with method=GET and parses JSON body', async () => {
    httpCallerMock.mockResolvedValueOnce(mockResponse({ body: { id: 1 } }));
    const mgr = new RestRequestManager({ baseUrl: 'https://api.example.com' });
    const r = await mgr.get<{ id: number }>('/users/1');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ id: 1 });
    expect(httpCallerMock).toHaveBeenCalledWith(
      'https://api.example.com/users/1',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('POST — sends JSON body with Content-Type header', async () => {
    httpCallerMock.mockResolvedValueOnce(mockResponse({ status: 201, body: { ok: true } }));
    const mgr = new RestRequestManager();
    const r = await mgr.post<{ name: string }, { ok: boolean }>(
      'https://api.example.com/users',
      { name: 'alice' },
    );
    expect(r.status).toBe(201);
    expect(r.body).toEqual({ ok: true });
    const callArgs = httpCallerMock.mock.calls[0];
    expect(callArgs[1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ name: 'alice' }),
    });
    expect((callArgs[1] as { headers: Record<string, string> }).headers['Content-Type']).toBe(
      'application/json',
    );
  });

  it('PUT and PATCH — convenience methods serialize body and use correct verbs', async () => {
    httpCallerMock.mockResolvedValueOnce(mockResponse({ body: 'put-ok' }));
    httpCallerMock.mockResolvedValueOnce(mockResponse({ body: 'patch-ok' }));
    const mgr = new RestRequestManager();
    await mgr.put<unknown, string>('https://api.example.com/x', { a: 1 });
    await mgr.patch<unknown, string>('https://api.example.com/x', { a: 2 });
    expect(httpCallerMock.mock.calls[0][1].method).toBe('PUT');
    expect(httpCallerMock.mock.calls[1][1].method).toBe('PATCH');
  });

  it('DELETE — convenience method dispatches with method=DELETE', async () => {
    httpCallerMock.mockResolvedValueOnce(mockResponse({ status: 204, body: null }));
    const mgr = new RestRequestManager();
    const r = await mgr.delete<unknown>('https://api.example.com/users/1');
    expect(r.status).toBe(204);
    expect(httpCallerMock.mock.calls[0][1].method).toBe('DELETE');
  });

  it('full request() with all opts — passes baseUrl + headers + custom timeoutMs', async () => {
    httpCallerMock.mockResolvedValueOnce(mockResponse({ body: { ok: true } }));
    const mgr = new RestRequestManager({
      baseUrl: 'https://api.example.com/',
      retry: { maxAttempts: 1 },
    });
    const r = await mgr.request({
      method: 'POST',
      url: '/jobs',
      headers: { 'X-Trace-Id': 'abc' },
      body: { kind: 'sync' },
      timeoutMs: 5_000,
    });
    expect(r.status).toBe(200);
    expect(httpCallerMock).toHaveBeenCalledWith(
      'https://api.example.com/jobs',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'X-Trace-Id': 'abc' }),
      }),
    );
    expect(mgr.getStats().totalRequests).toBe(1);
  });

  it('translates 4xx HTTP statuses into typed AppError subclasses (I-8)', async () => {
    const cases: Array<[number, new (...args: unknown[]) => Error]> = [
      [400, ValidationError],
      [401, UnauthorizedError],
      [403, ForbiddenError],
      [404, NotFoundError],
      [409, ConflictError],
      [429, RateLimitedError],
    ];
    const mgr = new RestRequestManager({ retry: { maxAttempts: 1 } });
    for (const [status, ErrCls] of cases) {
      httpCallerMock.mockResolvedValueOnce(mockResponse({ status, ok: false, body: { msg: 'no' } }));
      // Use a fresh host per case so the circuit breaker default threshold
      // doesn't trip while we walk through multiple non-2xx statuses.
      await expect(mgr.get(`https://h${status}.example.com/x`)).rejects.toBeInstanceOf(ErrCls);
    }
  });

  it('translates 5xx HTTP statuses into typed AppError subclasses (I-8)', async () => {
    const { BadGatewayError } = await import('@gertsai/errors');
    const cases: Array<[number, new (...args: unknown[]) => Error]> = [
      [500, InternalError],
      [502, BadGatewayError],
      [503, UpstreamFailureError],
      [504, UpstreamFailureError],
    ];
    const mgr = new RestRequestManager({ retry: { maxAttempts: 1 } });
    for (const [status, ErrCls] of cases) {
      httpCallerMock.mockResolvedValueOnce(mockResponse({ status, ok: false, body: 'x' }));
      await expect(mgr.get(`https://h${status}.example.com/x`)).rejects.toBeInstanceOf(ErrCls);
    }
  });

  it('AbortError from withTimeout → TimeoutError (Amendment 1.2.8)', async () => {
    httpCallerMock.mockImplementationOnce(
      () =>
        // Never resolves — withTimeout's internal AbortController will fire.
        new Promise(() => {
          /* pending forever */
        }),
    );
    const mgr = new RestRequestManager({
      retry: { maxAttempts: 1, retryable: () => false },
    });
    await expect(
      mgr.request({ method: 'GET', url: 'https://api.example.com/x', timeoutMs: 5 }),
    ).rejects.toBeInstanceOf(TimeoutError);
  });

  it('circuit-breaker — opens for host after consecutive failures and short-circuits', async () => {
    const mgr = new RestRequestManager({
      retry: { maxAttempts: 1, retryable: () => false },
      circuitBreaker: { failureThreshold: 2, resetTimeoutMs: 60_000 },
    });
    httpCallerMock.mockResolvedValue(mockResponse({ status: 500, ok: false, body: 'boom' }));

    // Two failures → circuit opens for host
    await expect(mgr.get('https://hot.example.com/a')).rejects.toBeInstanceOf(InternalError);
    await expect(mgr.get('https://hot.example.com/b')).rejects.toBeInstanceOf(InternalError);

    // Third call must short-circuit BEFORE httpCaller is invoked
    httpCallerMock.mockClear();
    await expect(mgr.get('https://hot.example.com/c')).rejects.toBeInstanceOf(UpstreamFailureError);
    expect(httpCallerMock).not.toHaveBeenCalled();
    expect(mgr.getStats().circuitOpens).toBeGreaterThanOrEqual(1);
  });
});
