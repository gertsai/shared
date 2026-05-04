/**
 * Search Service Lifecycle.
 *
 * Mirrors the ingest lifecycle but without a queue — search is fully
 * synchronous (embed query → cosine search → return hits).
 *
 * Both services pull their adapters from the SHARED composition root
 * (`src/composition/infrastructure.ts`). That singleton is built once at
 * module-load time, so search observes the same `MemoryVectorStore` that
 * ingest writes into — which is what makes the end-to-end demo actually
 * return results.
 *
 * In production you'd back the chunk store with Milvus / pgvector / Qdrant
 * and the singleton becomes irrelevant — every process talks to the same
 * remote DB. The shape stays identical: domain and application layers
 * never need to change.
 */
import { resolveExampleController } from '../../lib/example-controller';
import { SearchDocumentsUseCase } from '../../application/SearchDocumentsUseCase';
import { infrastructure } from '../../composition/infrastructure';

import type { SearchServiceContext } from './types';

const controller = resolveExampleController<'v1', 'search', SearchServiceContext>('v1', 'search');

// Same restBasePath rationale as ingest — avoid `v1/search/v1/search/...`.
controller.setRestBasePath('/');

controller.addStartedHandler(async (ctx) => {
  ctx.logger?.info('[v1.search] starting...');

  const useCase = new SearchDocumentsUseCase({
    chunkStore: infrastructure.chunkStore,
    embedder: infrastructure.embedder,
    gate: infrastructure.gate,
  });

  ctx.service.chunkStore = infrastructure.chunkStore;
  ctx.service.embedder = infrastructure.embedder;
  ctx.service.gate = infrastructure.gate;
  ctx.service.useCase = useCase;

  ctx.logger?.info(
    `[v1.search] ready (embedder=${infrastructure.embedder.constructor.name})`,
  );
});

controller.addStoppedHandler(async (ctx) => {
  ctx.logger?.info('[v1.search] stopped.');
});

export { controller };
