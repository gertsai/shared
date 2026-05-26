// SPDX-License-Identifier: Apache-2.0
/**
 * Wave 37 — llm-costs event emission tests (FR-D6, Group 3).
 *
 * Coverage:
 *   1. openai-embedder: mock HTTP response with `usage.prompt_tokens: 100`,
 *      verify log emits {event:'llm.cost', tenantId, model, tokens>0,
 *      usdCost>0, timestamp} for text-embedding-3-small (in catalogue).
 *   2. openai-embedder: when usage absent from response, tokens=0 emitted
 *      (best-effort, no throw).
 *   3. ollama-embedder: mock HTTP response, verify symbolic cost event
 *      {event:'llm.cost', usdCost:0, tokens>0, estimated:true, tenantId}.
 *   4. ollama-embedder: token estimate grows with batch text length.
 *   5. Shape consistency: both emitters produce the same required field set
 *      so a single downstream consumer can handle both providers.
 *
 * Pattern: stub RestRequestManager.prototype.request (same as
 * embedder-hardening.test.ts) + spy on console.log to capture log output
 * from createAppLogger's consoleBackend (info routes to console.log with
 * signature: console.log('[INFO]', msg, ctx)).
 *
 * Wave 37.C note: tenantId is REQUIRED (branded TenantId) on both
 * embedder constructors — supply asTenantId('…') in all test fixtures.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  RestRequestManager,
  type RestResponse,
} from '@gertsai/rest-request-manager';
import { asTenantId } from '@gertsai/tenant';

import {
  OllamaEmbedder,
  __resetOllamaManagerForTests,
} from '../src/infrastructure/ollama-embedder.js';
import {
  OpenAIEmbedder,
  __resetOpenAIManagerForTests,
} from '../src/infrastructure/openai-embedder.js';

function okJson(body: unknown, status = 200): RestResponse<unknown> {
  return {
    status,
    headers: { 'content-type': 'application/json' },
    body,
  };
}

function stubRequest(
  impl: (req: { url: string; method: string }) => Promise<RestResponse<unknown>>,
): void {
  vi.spyOn(RestRequestManager.prototype, 'request').mockImplementation(
    impl as never,
  );
}

/**
 * Capture all console.log calls while `fn` executes.
 * consoleBackend routes `info` → console.log('[INFO]', message, ctx).
 */
async function captureLogCalls(
  fn: () => Promise<unknown>,
): Promise<Array<{ level: string; msg: string; ctx: Record<string, unknown> }>> {
  const calls: Array<{ level: string; msg: string; ctx: Record<string, unknown> }> = [];
  const spy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    const level = String(args[0] ?? '');
    const msg = String(args[1] ?? '');
    const ctx = (args[2] ?? {}) as Record<string, unknown>;
    calls.push({ level, msg, ctx });
  });
  try {
    await fn();
  } finally {
    spy.mockRestore();
  }
  return calls;
}

// ---- OpenAI embedder cost events ----

describe('Wave 37.C — OpenAI embedder cost event emission (FR-D6 Group 3)', () => {
  beforeEach(() => {
    __resetOpenAIManagerForTests();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    __resetOpenAIManagerForTests();
  });

  it('emits llm.cost event with usdCost>0 and correct token count from usage.prompt_tokens', async () => {
    stubRequest(async () =>
      okJson({
        data: [{ embedding: [0.1, 0.2, 0.3], index: 0 }],
        model: 'text-embedding-3-small',
        usage: { prompt_tokens: 100, total_tokens: 100 },
      }),
    );

    const embedder = new OpenAIEmbedder({
      apiKey: 'sk-test',
      model: 'text-embedding-3-small',
      tenantId: asTenantId('tenant-acme'),
    });

    const logs = await captureLogCalls(() => embedder.embed(['hello world']));

    const costLog = logs.find((l) => l.msg === 'llm.cost');
    expect(costLog).toBeDefined();

    const ctx = costLog!.ctx;
    expect(ctx['event']).toBe('llm.cost');
    expect(ctx['model']).toBe('text-embedding-3-small');
    expect(ctx['tokens']).toBe(100);
    expect(typeof ctx['usdCost']).toBe('number');
    expect(ctx['usdCost']).toBeGreaterThan(0);
    expect(typeof ctx['timestamp']).toBe('string');
    expect(ctx['tenantId']).toBe('tenant-acme');
  });

  it('emits llm.cost event with tokens=0 when usage is absent from response', async () => {
    stubRequest(async () =>
      okJson({
        data: [{ embedding: [0.1, 0.2, 0.3], index: 0 }],
        model: 'text-embedding-3-small',
        // usage deliberately absent
      }),
    );

    const embedder = new OpenAIEmbedder({
      apiKey: 'sk-test',
      model: 'text-embedding-3-small',
      tenantId: asTenantId('tenant-beta'),
    });

    const logs = await captureLogCalls(() => embedder.embed(['text']));

    const costLog = logs.find((l) => l.msg === 'llm.cost');
    expect(costLog).toBeDefined();
    expect(costLog!.ctx['tokens']).toBe(0);
    expect(costLog!.ctx['tenantId']).toBe('tenant-beta');
    expect(costLog!.ctx).toHaveProperty('event');
    expect(costLog!.ctx).toHaveProperty('timestamp');
  });
});

// ---- Ollama embedder cost events ----

describe('Wave 37.C — Ollama embedder cost event emission (FR-D6 Group 3)', () => {
  beforeEach(() => {
    __resetOllamaManagerForTests();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    __resetOllamaManagerForTests();
  });

  it('emits symbolic llm.cost event with usdCost=0 and estimated token count', async () => {
    const text = 'hello world';
    const expectedTokens = Math.ceil(text.length / 4);

    stubRequest(async () => okJson({ embedding: [0.1, 0.2, 0.3] }));

    const embedder = new OllamaEmbedder({
      url: 'http://localhost:11434',
      model: 'nomic-embed-text',
      tenantId: asTenantId('tenant-beta'),
    });

    const logs = await captureLogCalls(() => embedder.embed([text]));

    const costLog = logs.find((l) => l.msg === 'llm.cost');
    expect(costLog).toBeDefined();

    const ctx = costLog!.ctx;
    expect(ctx['event']).toBe('llm.cost');
    expect(ctx['model']).toBe('nomic-embed-text');
    expect(ctx['usdCost']).toBe(0);
    expect(ctx['tokens']).toBe(expectedTokens);
    expect(ctx['tokens']).toBeGreaterThan(0);
    expect(typeof ctx['timestamp']).toBe('string');
    expect(ctx['tenantId']).toBe('tenant-beta');
    expect(ctx['estimated']).toBe(true);
  });

  it('token estimate grows with text batch length', async () => {
    const texts = ['short', 'a longer piece of text that has more tokens'];
    const expectedTokens = texts.reduce(
      (sum, t) => sum + Math.ceil(t.length / 4),
      0,
    );

    let callCount = 0;
    stubRequest(async () => {
      callCount++;
      return okJson({ embedding: new Array(3).fill(0.1) as number[] });
    });

    const embedder = new OllamaEmbedder({
      url: 'http://localhost:11434',
      model: 'nomic-embed-text',
      tenantId: asTenantId('tenant-gamma'),
    });

    const logs = await captureLogCalls(() => embedder.embed(texts));

    expect(callCount).toBe(2);

    const costLog = logs.find((l) => l.msg === 'llm.cost');
    expect(costLog).toBeDefined();
    expect(costLog!.ctx['tokens']).toBe(expectedTokens);
    expect(costLog!.ctx['usdCost']).toBe(0);
  });
});

// ---- Shape consistency across providers ----

describe('Wave 37.C — cost event shape consistency (FR-D6 Group 3)', () => {
  beforeEach(() => {
    __resetOpenAIManagerForTests();
    __resetOllamaManagerForTests();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    __resetOpenAIManagerForTests();
    __resetOllamaManagerForTests();
  });

  it('both OpenAI and Ollama emitters produce the same required field set', async () => {
    const REQUIRED_FIELDS = ['event', 'model', 'tokens', 'usdCost', 'timestamp'] as const;

    // OpenAI log
    stubRequest(async () =>
      okJson({
        data: [{ embedding: [0.1], index: 0 }],
        model: 'text-embedding-3-small',
        usage: { prompt_tokens: 20, total_tokens: 20 },
      }),
    );
    const openAIEmbedder = new OpenAIEmbedder({
      apiKey: 'sk-test',
      model: 'text-embedding-3-small',
      tenantId: asTenantId('tenant-shape-test'),
    });
    const openAILogs = await captureLogCalls(() => openAIEmbedder.embed(['x']));
    const openAICostCtx = openAILogs.find((l) => l.msg === 'llm.cost')!.ctx;

    vi.restoreAllMocks();
    __resetOllamaManagerForTests();

    // Ollama log
    stubRequest(async () => okJson({ embedding: [0.1] }));
    const ollamaEmbedder = new OllamaEmbedder({
      url: 'http://localhost:11434',
      model: 'nomic-embed-text',
      tenantId: asTenantId('tenant-shape-test'),
    });
    const ollamaLogs = await captureLogCalls(() => ollamaEmbedder.embed(['x']));
    const ollamaCostCtx = ollamaLogs.find((l) => l.msg === 'llm.cost')!.ctx;

    for (const field of REQUIRED_FIELDS) {
      expect(openAICostCtx, `OpenAI cost ctx missing field: ${field}`).toHaveProperty(field);
      expect(ollamaCostCtx, `Ollama cost ctx missing field: ${field}`).toHaveProperty(field);
    }
  });
});
