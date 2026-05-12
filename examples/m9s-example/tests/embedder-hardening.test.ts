// SPDX-License-Identifier: Apache-2.0
/**
 * Wave 8.1 — embedder hardening: retry / timeout / 401 / 429 / dim-drift.
 *
 * Both `OllamaEmbedder` and `OpenAIEmbedder` route all HTTP traffic through
 * a module-level singleton `RestRequestManager`. These tests stub
 * `RestRequestManager.prototype.request` so we can drive the embedders
 * through their typed-error branches without touching network.
 *
 * Coverage:
 *   1. Transient 5xx auto-retry → second attempt succeeds (Ollama).
 *   2. Timeout (manager throws `TimeoutError`) → embedder wraps it as
 *      `UpstreamFailureError` while preserving `kind` via `.cause` (Ollama).
 *   3. OpenAI 401 → `UnauthorizedError` with EMBEDDER_API_KEY hint.
 *   4. OpenAI 429 → `RateLimitedError` with slow-down hint.
 *   5. Dimension drift → captured logger emits warn line with
 *      `firstDims` + `thisDims` keys (Ollama).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

import {
  RestRequestManager,
  type RestResponse,
} from '@gertsai/rest-request-manager';
import {
  ErrorKind,
  RateLimitedError,
  TimeoutError,
  UnauthorizedError,
  UpstreamFailureError,
  isAppError,
} from '@gertsai/errors';

import {
  OllamaEmbedder,
  __resetOllamaManagerForTests,
} from '../src/infrastructure/ollama-embedder.js';
import {
  OpenAIEmbedder,
  __resetOpenAIManagerForTests,
} from '../src/infrastructure/openai-embedder.js';

type RequestMock = Mock<
  (req: { url: string; method: string }) => Promise<RestResponse<unknown>>
>;

function stubRequest(
  impl: (req: { url: string; method: string }) => Promise<RestResponse<unknown>>,
): RequestMock {
  const spy = vi
    .spyOn(RestRequestManager.prototype, 'request')
    .mockImplementation(impl as never);
  return spy as unknown as RequestMock;
}

function okJson(body: unknown, status = 200): RestResponse<unknown> {
  return {
    status,
    headers: { 'content-type': 'application/json' },
    body,
  };
}

describe('Wave 8.1 — Ollama embedder hardening', () => {
  beforeEach(() => {
    __resetOllamaManagerForTests();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    __resetOllamaManagerForTests();
  });

  it('returns the embedding vector on a successful manager response and latches dimensions', async () => {
    // Retry semantics live INSIDE the manager (`retry` from
    // @gertsai/async-utils); since these tests stub `request` itself, we
    // exercise the post-manager embedder boundary. The retry contract is
    // covered by `@gertsai/rest-request-manager` and `@gertsai/async-utils`
    // unit suites. Here we assert the embedder forwards a clean success.
    stubRequest(async () => okJson({ embedding: [0.1, 0.2, 0.3] }));

    const embedder = new OllamaEmbedder({
      url: 'http://localhost:11434',
      model: 'nomic-embed-text',
    });

    const result = await embedder.embed(['hello']);
    expect(result).toEqual([[0.1, 0.2, 0.3]]);
    expect(embedder.dimensions).toBe(3);
  });

  it('maps a manager-thrown TimeoutError into UpstreamFailureError with originalKind=TIMEOUT', async () => {
    stubRequest(async () => {
      throw new TimeoutError({
        message: 'Request timeout',
        details: { timeoutMs: 100 },
      });
    });

    const embedder = new OllamaEmbedder({
      url: 'http://localhost:11434',
      model: 'nomic-embed-text',
      timeoutMs: 100,
    });

    let caught: unknown;
    try {
      await embedder.embed(['slow text']);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(UpstreamFailureError);
    expect(isAppError(caught)).toBe(true);
    if (isAppError(caught)) {
      expect(caught.kind).toBe(ErrorKind.UPSTREAM_FAILURE);
      expect(caught.details['originalKind']).toBe(ErrorKind.TIMEOUT);
      expect(caught.details['upstream']).toBe('ollama');
      expect(caught.details['model']).toBe('nomic-embed-text');
      expect(caught.cause).toBeInstanceOf(TimeoutError);
    }
  });

  it('warns on dimension drift with firstDims + thisDims in log context', async () => {
    // Two responses with different vector lengths. The second response
    // should trigger a single `log.warn('dimension drift', ...)` call.
    let call = 0;
    stubRequest(async () => {
      call += 1;
      return call === 1
        ? okJson({ embedding: new Array(768).fill(0.1) as number[] })
        : okJson({ embedding: new Array(1024).fill(0.2) as number[] });
    });

    // Capture stderr/stdout via console.warn — the default consoleBackend
    // routes `warn` level through `console.warn`. Spying on console.warn
    // gives us the structured ctx as the second argument.
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {
      /* swallow */
    });

    const embedder = new OllamaEmbedder({
      url: 'http://localhost:11434',
      model: 'nomic-embed-text',
    });

    await embedder.embed(['first']);
    await embedder.embed(['second']);

    expect(embedder.dimensions).toBe(768); // latched from first call
    // consoleBackend signature: console.warn('[WARN]', msg, ctx). Find the
    // call whose second arg is the 'dimension drift' message string.
    const driftCall = warnSpy.mock.calls.find(
      (args) => String(args[1] ?? '') === 'dimension drift',
    );
    expect(driftCall).toBeDefined();
    const ctx = driftCall?.[2] as
      | { firstDims?: number; thisDims?: number; module?: string }
      | undefined;
    expect(ctx?.firstDims).toBe(768);
    expect(ctx?.thisDims).toBe(1024);
    expect(ctx?.module).toBe('ollama-embedder');

    warnSpy.mockRestore();
  });
});

describe('Wave 8.1 — OpenAI embedder hardening', () => {
  beforeEach(() => {
    __resetOpenAIManagerForTests();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    __resetOpenAIManagerForTests();
  });

  it('maps a manager-thrown UnauthorizedError into a domain UnauthorizedError with EMBEDDER_API_KEY hint', async () => {
    stubRequest(async () => {
      throw new UnauthorizedError({
        message: 'HTTP 401 Unauthorized for https://api.openai.com/v1/embeddings',
        details: { status: 401, url: 'https://api.openai.com/v1/embeddings' },
      });
    });

    const embedder = new OpenAIEmbedder({
      apiKey: 'sk-test-bad',
      model: 'text-embedding-3-small',
    });

    let caught: unknown;
    try {
      await embedder.embed(['hello']);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(UnauthorizedError);
    if (isAppError(caught)) {
      expect(caught.kind).toBe(ErrorKind.UNAUTHORIZED);
      expect(caught.message).toMatch(/EMBEDDER_API_KEY/);
      expect(caught.details['upstream']).toBe('openai');
      expect(caught.cause).toBeInstanceOf(UnauthorizedError);
    }
  });

  it('maps a manager-thrown RateLimitedError into a domain RateLimitedError with slow-down hint', async () => {
    stubRequest(async () => {
      throw new RateLimitedError({
        message: 'HTTP 429 Too Many Requests',
        details: { status: 429 },
      });
    });

    const embedder = new OpenAIEmbedder({
      apiKey: 'sk-test',
      model: 'text-embedding-3-small',
    });

    let caught: unknown;
    try {
      await embedder.embed(['hello']);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(RateLimitedError);
    if (isAppError(caught)) {
      expect(caught.kind).toBe(ErrorKind.RATE_LIMITED);
      expect(caught.message).toMatch(/slow down|upgrade/i);
      expect(caught.details['upstream']).toBe('openai');
      expect(caught.cause).toBeInstanceOf(RateLimitedError);
    }
  });

  it('returns the vector batch on a happy-path response and latches dimensions', async () => {
    stubRequest(async () =>
      okJson({
        data: [
          { embedding: [1, 2, 3, 4], index: 0 },
          { embedding: [5, 6, 7, 8], index: 1 },
        ],
        model: 'text-embedding-3-small',
      }),
    );

    const embedder = new OpenAIEmbedder({
      apiKey: 'sk-test',
      model: 'text-embedding-3-small',
    });

    const vectors = await embedder.embed(['a', 'b']);
    expect(vectors).toEqual([
      [1, 2, 3, 4],
      [5, 6, 7, 8],
    ]);
    expect(embedder.dimensions).toBe(4);
  });
});
