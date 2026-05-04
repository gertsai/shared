/**
 * Search Service Lifecycle.
 *
 * Mirrors the ingest lifecycle but without a queue — search is fully
 * synchronous (embed query → cosine search → return hits).
 *
 * NOTE: In a real app the search service would share the chunk store
 * (vector DB) with the ingest service. We deliberately give each service
 * its OWN MemoryVectorStore here so the example is self-contained per
 * service. To share state across services, hoist the store construction
 * out into a `composition root` shared by both lifecycles.
 *
 * For an end-to-end ingest→search round-trip in the example, point both
 * services at the same external vector DB (Milvus, pgvector, ...) by
 * swapping `MemoryVectorStore` for the appropriate adapter — domain and
 * application layers don't need to change.
 */
import { resolveExampleController } from '../../lib/example-controller';
import { SearchDocumentsUseCase } from '../../application/SearchDocumentsUseCase';
import { MemoryVectorStore } from '../../infrastructure/memory-vector.store';
import { MockEmbedder } from '../../infrastructure/mock-embedder';
import { AllowAllPermissionGate } from '../../infrastructure/allow-all-permission.gate';

import type { SearchServiceContext } from './types';

const controller = resolveExampleController<'v1', 'search', SearchServiceContext>('v1', 'search');

// Same restBasePath rationale as ingest — avoid `v1/search/v1/search/...`.
controller.setRestBasePath('/');

controller.addStartedHandler(async (ctx) => {
  ctx.logger?.info('[v1.search] starting...');

  const chunkStore = new MemoryVectorStore();
  const embedder = new MockEmbedder(384);
  const gate = new AllowAllPermissionGate(ctx.logger ?? console);

  const useCase = new SearchDocumentsUseCase({ chunkStore, embedder, gate });

  ctx.service.chunkStore = chunkStore;
  ctx.service.embedder = embedder;
  ctx.service.gate = gate;
  ctx.service.useCase = useCase;

  ctx.logger?.info('[v1.search] ready.');
});

controller.addStoppedHandler(async (ctx) => {
  ctx.logger?.info('[v1.search] stopped.');
});

export { controller };
