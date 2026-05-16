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

  // Wave 8.2 audit Tests#3 — regression guard for the Wave 8.1 SSRF
  // plumbing in `manager.invoke()`. If a refactor removed the
  // `...(this.opts.security !== undefined && { security: this.opts.security })`
  // spread, OllamaEmbedder would silently lose its `allowLocalhost: true`
  // override and real-infra tests would break with `SSRF blocked`.
  describe('security pass-through (Wave 8.1 SSRF plumbing)', () => {
    it('forwards `security` opt verbatim to httpCaller when set', async () => {
      httpCallerMock.mockResolvedValueOnce(mockResponse({ body: { ok: true } }));
      const mgr = new RestRequestManager({
        security: {
          ssrfProtection: true,
          allowLocalhost: true,
          allowPrivateNetworks: true,
          allowedHostnames: ['localhost'],
        },
      });
      await mgr.get('http://localhost:11434/probe');
      expect(httpCallerMock).toHaveBeenCalledWith(
        'http://localhost:11434/probe',
        expect.objectContaining({
          security: {
            ssrfProtection: true,
            allowLocalhost: true,
            allowPrivateNetworks: true,
            allowedHostnames: ['localhost'],
          },
        }),
      );
    });

    it('omits `security` from httpCaller init when not configured (default-safe)', async () => {
      httpCallerMock.mockResolvedValueOnce(mockResponse({ body: { ok: true } }));
      const mgr = new RestRequestManager();
      await mgr.get('https://api.example.com/health');
      const callInit = httpCallerMock.mock.calls[0]?.[1] as Record<string, unknown>;
      expect(callInit).toBeDefined();
      expect('security' in callInit).toBe(false);
    });

    it('partial `security` opts pass through (e.g. only blockedHostnames)', async () => {
      httpCallerMock.mockResolvedValueOnce(mockResponse({ body: { ok: true } }));
      const mgr = new RestRequestManager({
        security: { blockedHostnames: ['evil.example.com'] },
      });
      await mgr.get('https://safe.example.com/x');
      expect(httpCallerMock).toHaveBeenCalledWith(
        'https://safe.example.com/x',
        expect.objectContaining({
          security: { blockedHostnames: ['evil.example.com'] },
        }),
      );
    });
  });

  describe('logger (PRD-034 FR-002 — local `RestRequestLogger` shape)', () => {
    it('accepts a structural logger with only {debug,warn,error}', async () => {
      const calls: Array<{ level: string; msg: string }> = [];
      const logger = {
        debug: (msg: string) => calls.push({ level: 'debug', msg }),
        warn: (msg: string) => calls.push({ level: 'warn', msg }),
        error: (msg: string) => calls.push({ level: 'error', msg }),
      };
      httpCallerMock.mockResolvedValueOnce(mockResponse({ body: { ok: true } }));
      const mgr = new RestRequestManager({ logger });
      await mgr.get('https://example.com/x');
      // At minimum the dispatch + success debug lines must fire.
      expect(calls.filter((c) => c.level === 'debug').length).toBeGreaterThanOrEqual(2);
    });

    it('accepts a richer logger (extra methods are ignored, structural fit)', async () => {
      const logger = {
        trace: () => {},
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
        fatal: () => {},
        child: () => logger,
        setLevel: () => {},
        getLevel: () => 'info' as const,
      };
      httpCallerMock.mockResolvedValueOnce(mockResponse({ body: { ok: true } }));
      // Structural typing means a `@gertsai/logger-factory.Logger` shape
      // still satisfies `RestRequestLogger`.
      const mgr = new RestRequestManager({ logger });
      await expect(mgr.get('https://example.com/x')).resolves.toBeDefined();
    });
  });
});
