import { describe, it, expect } from 'vitest';

/**
 * End-to-end placeholder.
 *
 * The example uses single-node, in-memory M9sCacheCacher, so a real broker
 * boot test does NOT require Redis. However, starting a Moleculer broker
 * inside vitest with typia validators requires the `tspc` build step to
 * have produced the transformed code; we therefore mark the e2e suite as
 * skipped to keep the unit-test command fast and dependency-free.
 *
 * To run a true e2e check locally:
 *   1. `pnpm --filter @gertsai-examples/m9s-example run build`
 *   2. `pnpm --filter @gertsai-examples/m9s-example run start`
 *   3. `bash examples/m9s-example/scripts/smoke.sh`
 */
describe.skip('m9s-example e2e (broker.call)', () => {
  it('ingest then search via broker.call', async () => {
    // Side-effect: registers v1.ingest + v1.search controllers.
    await import('../src/services');

    const { ApiController } = await import('@gertsai/api-core');
    const brokerConfig = (await import('../moleculer.config')).default;
    const ApiService = (await import('../src/mol-services/api.service')).default;

    const broker = await ApiController.Start({
      brokerConfig,
      services: [ApiService],
      repl: false,
    });

    try {
      const ingestResp = await broker.call<unknown, { docId: string; text: string }>(
        'v1.ingest.document',
        {
          docId: 'doc-e2e-1',
          text: 'Hexagonal architecture isolates the core from infrastructure. Search returns the most relevant chunks.',
        },
      );
      expect(ingestResp).toBeDefined();

      const searchResp = await broker.call<{ data: { results: unknown[] } }, { query: string }>(
        'v1.search.query',
        { query: 'hexagonal' },
      );
      expect(searchResp).toBeDefined();
    } finally {
      await broker.stop();
    }
  });
});
