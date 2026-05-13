// SPDX-License-Identifier: Apache-2.0
/**
 * Wave 8.2 audit Tests#2 — embedder retry semantics end-to-end.
 *
 * `embedder-hardening.test.ts` stubs `RestRequestManager.prototype.request`,
 * which bypasses the manager-internal retry / withTimeout / circuit-breaker
 * layers. This file stubs `@gertsai/fetch.httpCaller` instead so the FULL
 * pipeline runs:
 *
 *   OllamaEmbedder.embed()
 *     → getManager(hostname).request()
 *       → retry()         ← exercised here
 *         → withTimeout()
 *           → httpCaller() ← stubbed
 *
 * If a future refactor removes `retry: { maxAttempts: 3, ... }` from
 * `ollama-embedder.ts`'s `getManager()` call, this test will fail —
 * preventing a silent regression where transient upstream failures
 * stop being retried.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the transport BEFORE importing the SUT — vi.mock hoists, so the
// embedder's transitive `@gertsai/fetch` import gets the stubbed version.
const httpCallerMock = vi.fn();
vi.mock('@gertsai/fetch', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  return {
    ...original,
    httpCaller: (...args: unknown[]) => httpCallerMock(...args),
  };
});

import {
  OllamaEmbedder,
  __resetOllamaManagerForTests,
} from '../src/infrastructure/ollama-embedder.js';

interface MockResponseInit {
  readonly status?: number;
  readonly ok?: boolean;
  readonly body?: unknown;
}

function mockResponse(init: MockResponseInit = {}): unknown {
  const status = init.status ?? 200;
  const ok = init.ok ?? (status >= 200 && status < 300);
  const headerEntries = new Map<string, string>([['content-type', 'application/json']]);
  return {
    status,
    ok,
    headers: {
      get: (name: string): string | null => headerEntries.get(name.toLowerCase()) ?? null,
      forEach: (cb: (value: string, key: string) => void): void => {
        headerEntries.forEach((v, k) => cb(v, k));
      },
    },
    json: async (): Promise<unknown> => init.body ?? {},
    text: async (): Promise<string> => JSON.stringify(init.body ?? {}),
  };
}

describe('Wave 8.2 — OllamaEmbedder retry semantics (audit Tests#2)', () => {
  beforeEach(() => {
    httpCallerMock.mockReset();
    __resetOllamaManagerForTests();
  });
  afterEach(() => {
    __resetOllamaManagerForTests();
  });

  it('retries on transient transport errors and succeeds on the third attempt', async () => {
    // The manager's retry layer wraps the httpCaller invocation. It re-runs
    // the function when it throws — so simulate transient transport failures
    // (e.g. `fetch failed: connection refused`) followed by a success. Note:
    // non-2xx HTTP responses are NOT retried by this layer; they go through
    // `translateHttpStatus` AFTER the retry block. The contract being guarded
    // here is "transport-level failures get N attempts before surfacing".
    const transportError = new Error('fetch failed: connect ECONNREFUSED');
    httpCallerMock
      .mockRejectedValueOnce(transportError)
      .mockRejectedValueOnce(transportError)
      .mockResolvedValueOnce(mockResponse({ body: { embedding: [0.1, 0.2, 0.3] } }));

    const embedder = new OllamaEmbedder({
      url: 'http://localhost:11434',
      model: 'nomic-embed-text',
      timeoutMs: 1_000,
    });

    const [vector] = await embedder.embed(['hello']);

    expect(vector).toEqual([0.1, 0.2, 0.3]);
    // 2 rejections + 1 success = 3 attempts. Regression guard: if
    // `retry: { maxAttempts: 3, ... }` is removed from getManager(),
    // this assertion fails because attempts would drop to 1.
    expect(httpCallerMock).toHaveBeenCalledTimes(3);
  });

  it('surfaces non-2xx HTTP responses without retry (regression guard)', async () => {
    // Documents the asymmetry: 5xx is translated to UpstreamFailureError
    // but NOT retried (translation happens outside the retry block in the
    // manager). If retry behaviour on 5xx is desired in the future, it
    // requires a custom `retry.retryable` predicate or moving translation
    // inside the retry callback.
    httpCallerMock.mockResolvedValueOnce(mockResponse({ status: 503, ok: false, body: 'down' }));

    const embedder = new OllamaEmbedder({
      url: 'http://localhost:11434',
      model: 'nomic-embed-text',
      timeoutMs: 1_000,
    });
    await expect(embedder.embed(['x'])).rejects.toThrow(/failed.*UPSTREAM_FAILURE/);
    expect(httpCallerMock).toHaveBeenCalledTimes(1);
  });

  it('forwards SSRF allowedHostnames to httpCaller (audit Sec#1 regression guard)', async () => {
    httpCallerMock.mockResolvedValueOnce(mockResponse({ body: { embedding: [0.4] } }));

    const embedder = new OllamaEmbedder({
      url: 'http://10.20.30.40:11434',
      model: 'nomic-embed-text',
      timeoutMs: 1_000,
    });
    await embedder.embed(['x']);

    const callArgs = httpCallerMock.mock.calls[0];
    expect(callArgs).toBeDefined();
    const init = callArgs?.[1] as Record<string, unknown>;
    expect(init['security']).toMatchObject({
      ssrfProtection: true,
      allowLocalhost: true,
      allowPrivateNetworks: true,
      allowedHostnames: ['10.20.30.40'],
    });
  });

  it('rejects invalid URL in constructor before any network call', () => {
    expect(
      () =>
        new OllamaEmbedder({
          url: 'not-a-url',
          model: 'nomic-embed-text',
        }),
    ).toThrow(/invalid url/i);
    expect(httpCallerMock).not.toHaveBeenCalled();
  });

  it('rejects non-http(s) protocol in constructor', () => {
    expect(
      () =>
        new OllamaEmbedder({
          url: 'file:///etc/passwd',
          model: 'nomic-embed-text',
        }),
    ).toThrow(/unsupported protocol/i);
  });

  it('short-circuits on empty texts array (audit Logic#1)', async () => {
    const embedder = new OllamaEmbedder({
      url: 'http://localhost:11434',
      model: 'nomic-embed-text',
    });
    const out = await embedder.embed([]);
    expect(out).toEqual([]);
    expect(httpCallerMock).not.toHaveBeenCalled();
  });
});
