// SPDX-License-Identifier: Apache-2.0
/**
 * Real-infrastructure e2e — m9s-example with REAL Ollama embedder.
 *
 * Sprint 3.10 Addendum 2 closes the second explicit limitation from the
 * post-commit retrospective: "No external infra (no real Postgres, OpenAI,
 * NATS, Redis) — in-memory cacher + mock embedder". This suite swaps the
 * default `MockEmbedder` for a REAL Ollama HTTP call (`nomic-embed-text`)
 * and verifies the canonical Wave 5 stack composes through to real
 * external dependencies — not just mocks.
 *
 * Pre-requisites for this suite to run (verified at boot):
 *   1. Ollama daemon listening on `http://localhost:11434` (overridable
 *      via `EMBEDDER_URL`).
 *   2. Embedding model `nomic-embed-text` pulled (`ollama pull nomic-embed-text`).
 *   3. Phase B `pnpm build` already produced m9s-example dist/ (typia
 *      validators inlined — see e2e.test.ts comment for rationale).
 *
 * Skip behavior: by default the suite is SKIPPED unless either:
 *   - `OLLAMA_E2E=1` env var set, OR
 *   - Ollama tags endpoint responds within 1s (auto-detected).
 * Skipped output reads "Ollama unavailable" so CI doesn't show a red
 * herring.
 *
 * Why env-gated: CI runners without Ollama installed should not block
 * release. Local development + manual release-readiness sweeps run with
 * Ollama and exercise this path explicitly.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'node:module';
import type { Middleware } from 'moleculer';

const requireFromHere = createRequire(import.meta.url);

// ---------------------------------------------------------------------------
// Probe Ollama before the suite registers — avoids spinning up the broker
// when external infra is missing.
// ---------------------------------------------------------------------------
const OLLAMA_URL = process.env['EMBEDDER_URL'] ?? 'http://localhost:11434';
const FORCE = process.env['OLLAMA_E2E'] === '1';

async function ollamaAlive(): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 1000);
    const resp = await fetch(`${OLLAMA_URL}/api/tags`, {
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!resp.ok) return false;
    const body = (await resp.json()) as {
      models?: Array<{ name?: string }>;
    };
    return (body.models ?? []).some((m) =>
      String(m.name ?? '').startsWith('nomic-embed-text'),
    );
  } catch {
    return false;
  }
}

const ollamaReady = FORCE || (await ollamaAlive());

const maybe = ollamaReady ? describe : describe.skip;

maybe(
  'm9s-example real-infra e2e (Ollama embedder + Wave 5 broker)',
  () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let broker: any;

    beforeAll(async () => {
      // Configure m9s to use REAL Ollama BEFORE any module loads. Setting
      // these env vars here is fine because the action handlers read them
      // lazily (via `config` from project.config.ts) at action execution
      // time — but project.config.ts is module-scoped, evaluated once on
      // first import, so we MUST set env BEFORE the requires below.
      process.env['EMBEDDER_PROVIDER'] = 'ollama';
      process.env['EMBEDDER_URL'] = OLLAMA_URL;
      process.env['EMBEDDER_MODEL'] = 'nomic-embed-text';

      // Side-effect: register controllers (typia validators inlined in dist).
      requireFromHere('../dist/src/services/index.js');

      const { ApiController } = requireFromHere(
        '@gertsai/api-core/moleculer',
      ) as typeof import('@gertsai/api-core/moleculer');
      const brokerConfigDefault = requireFromHere('../dist/moleculer.config.js')
        .default as import('moleculer').BrokerOptions;
      const ApiService = requireFromHere(
        '../dist/src/mol-services/api.service.js',
      ).default;

      const brokerConfig = {
        ...brokerConfigDefault,
        // Keep production Wave 5 middleware — this is real-infra e2e, not
        // session-injection scenarios. The default chain (HeaderStrategy +
        // mode='optional') runs as in production.
        middlewares: brokerConfigDefault.middlewares as Middleware[],
        logger: {
          type: 'Console',
          options: { level: 'error' },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
      };

      broker = await ApiController.Start({
        brokerConfig,
        services: [ApiService],
        repl: false,
      });
    }, 60_000);

    afterAll(async () => {
      if (broker !== undefined) {
        await broker.stop();
      }
    });

    it('ingests a document with real Ollama nomic-embed-text vectors', async () => {
      const input = {
        docId: 'real-doc-1',
        text:
          'Wave 5 stack composes RequestContext per request. ' +
          'Hexagonal architecture isolates the core from infrastructure. ' +
          'Ollama provides local embeddings without external API calls.',
        userId: 'user-real-1',
      };

      const resp = await broker.call('v1.ingest.document', input, {
        meta: { headers: { 'x-tenant-id': 'tenant-real' } },
      });

      expect(resp).toBeDefined();
      const data = (
        resp as {
          data?: { docId?: string; chunkCount?: number; mode?: string };
        }
      ).data;
      expect(data?.docId).toBe('real-doc-1');
      expect(data?.mode).toBe('inline');
      // Real embedder produced ≥1 chunk (text > minimum chunk size).
      expect(typeof data?.chunkCount).toBe('number');
      expect(data!.chunkCount!).toBeGreaterThan(0);
    }, 60_000);

    it('searches the corpus and returns the ingested document via real cosine sim', async () => {
      // Step 1: ingest a document with distinctive text.
      const ingestInput = {
        docId: 'real-doc-search-target',
        text:
          'A canonical reference application demonstrating Wave 5 ' +
          'middleware composition: tenant resolver, session middleware, ' +
          'and session-guard assertions all wired through the broker.',
        userId: 'user-real-search',
      };
      const ingestResp = await broker.call('v1.ingest.document', ingestInput, {
        meta: { headers: { 'x-tenant-id': 'tenant-real' } },
      });
      expect(ingestResp).toBeDefined();

      // Step 2: search with a semantically similar query.
      const searchResp = await broker.call(
        'v1.search.query',
        {
          query: 'canonical reference Wave 5 middleware composition',
          topK: 3,
        },
        { meta: { headers: { 'x-tenant-id': 'tenant-real' } } },
      );

      expect(searchResp).toBeDefined();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const results = ((searchResp as any).data?.results ?? []) as Array<{
        docId?: string;
        score?: number;
      }>;
      expect(results.length).toBeGreaterThan(0);
      // Top hit should be the ingested doc (high cosine similarity for the
      // semantically-overlapping query).
      const topDocIds = results.map((r) => r.docId);
      expect(topDocIds).toContain('real-doc-search-target');
      // Sanity: scores are real numbers in [-1, 1] cosine range.
      for (const r of results) {
        expect(typeof r.score).toBe('number');
        expect(r.score!).toBeGreaterThanOrEqual(-1);
        expect(r.score!).toBeLessThanOrEqual(1.000001); // tolerate float rounding
      }
    }, 60_000);

    it('handles short text via real embedder (boundary case)', async () => {
      const input = {
        docId: 'real-doc-short',
        text: 'Brief.',
        userId: 'user-real-short',
      };

      // Should succeed even on minimal-but-non-empty text — real embedder
      // produces a single chunk vector.
      const resp = await broker.call('v1.ingest.document', input, {
        meta: { headers: { 'x-tenant-id': 'tenant-real' } },
      });
      expect(resp).toBeDefined();
      const data = (resp as { data?: { chunkCount?: number } }).data;
      expect(data?.chunkCount).toBeGreaterThanOrEqual(1);
    }, 30_000);
  },
);

if (!ollamaReady) {
  // eslint-disable-next-line no-console
  console.log(
    '[real-infra.test] Ollama unavailable at',
    OLLAMA_URL,
    '— skipping real-infra suite. Set OLLAMA_E2E=1 to force, or pull `nomic-embed-text` via `ollama pull nomic-embed-text`.',
  );
}
