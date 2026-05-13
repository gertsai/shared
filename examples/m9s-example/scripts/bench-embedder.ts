// SPDX-License-Identifier: Apache-2.0
/**
 * Wave 8.3 audit Perf#1 — embedder concurrency micro-bench.
 *
 * Measures wall-clock and items/sec for {@link OllamaEmbedder.embed} at
 * concurrency ∈ {1, 4, 8, 16} using a counting fake `RestRequestManager`
 * that simulates a 50ms per-call model latency. The bench is purely
 * relative — it compares serial vs bounded-parallel throughput, not
 * absolute Ollama performance.
 *
 * Expected outcome with `p-limit(N)` + `Promise.all` + 50ms latency per
 * call across a batch of 100 prompts:
 *   - concurrency=1 → ~5000ms total, ~20 items/sec
 *   - concurrency=4 → ~1250ms total, ~80 items/sec
 *   - concurrency=8 → ~625ms total, ~160 items/sec
 *   - concurrency=16 → ~313ms total, ~320 items/sec
 *
 * Run: pnpm --filter @gertsai-examples/m9s-example bench:embedder
 */
import { performance } from 'node:perf_hooks';

import type { RestRequestManager } from '@gertsai/rest-request-manager';
import { OllamaEmbedder } from '../src/infrastructure/ollama-embedder';

const BATCH_SIZE = 100;
const SIMULATED_LATENCY_MS = 50;
const DIMENSIONS = 768;

/**
 * Minimal fake — only the `.request` method is exercised by the embedder.
 * Asserted as `RestRequestManager` via a single explicit narrowing because
 * implementing the full surface (circuit-breaker / rate-limiter / logger /
 * etc.) would balloon the bench. The fake never touches network — it
 * resolves after a setTimeout to simulate a uniform per-call latency.
 */
function makeFakeManager(): RestRequestManager {
  const fake: Pick<RestRequestManager, 'request'> = {
    request: async <T = unknown>(): Promise<{
      readonly status: number;
      readonly headers: Readonly<Record<string, string>>;
      readonly body: T;
    }> => {
      await new Promise<void>((resolve) =>
        setTimeout(resolve, SIMULATED_LATENCY_MS),
      );
      return {
        status: 200,
        headers: {},
        body: { embedding: new Array(DIMENSIONS).fill(0.1) as number[] } as unknown as T,
      };
    },
  };
  return fake as RestRequestManager;
}

async function runBatch(
  concurrency: number,
): Promise<{ readonly totalMs: number; readonly itemsPerSec: number }> {
  process.env['EMBEDDER_CONCURRENCY'] = String(concurrency);
  const embedder = new OllamaEmbedder({
    url: 'http://localhost:11434',
    model: 'bench-stub',
    manager: makeFakeManager(),
  });
  const texts = new Array(BATCH_SIZE).fill('benchmark prompt');
  const t0 = performance.now();
  await embedder.embed(texts);
  const totalMs = performance.now() - t0;
  return { totalMs, itemsPerSec: (BATCH_SIZE * 1000) / totalMs };
}

async function main(): Promise<void> {
  const results: Array<{
    readonly concurrency: number;
    readonly totalMs: string;
    readonly itemsPerSec: string;
  }> = [];
  for (const c of [1, 4, 8, 16] as const) {
    const { totalMs, itemsPerSec } = await runBatch(c);
    results.push({
      concurrency: c,
      totalMs: totalMs.toFixed(1),
      itemsPerSec: itemsPerSec.toFixed(1),
    });
  }
  // eslint-disable-next-line no-console
  console.table(results);
  // eslint-disable-next-line no-console
  console.log(
    `\nBatch size: ${BATCH_SIZE} | Simulated latency: ${SIMULATED_LATENCY_MS}ms/call | Dimensions: ${DIMENSIONS}`,
  );
}

main().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error('bench-embedder failed:', err);
  process.exit(1);
});
