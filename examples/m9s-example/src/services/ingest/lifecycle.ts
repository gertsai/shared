/**
 * Ingest Service Lifecycle.
 *
 * Mirrors `apps/pipeline/src/services/ingest/lifecycle.ts` shape:
 *
 *   - On service started: read the SHARED infrastructure singleton
 *     (`src/composition/infrastructure.ts`), wire it into a fresh
 *     `IngestDocumentUseCase`, and stash everything on `ctx.service` so
 *     action handlers (and the queue worker registered in `src/queues/`)
 *     can reach them via the typed `IngestServiceContext` generic.
 *
 *   - The shared infrastructure is built ONCE at module-load time (in the
 *     composition root) so this lifecycle and the search lifecycle observe
 *     the same `MemoryDocumentStore` / `MemoryVectorStore` / `IEmbedder`
 *     instances. That's what lets a write here become a search hit there
 *     without a network-attached vector DB.
 *
 *   - Queue lifecycle is OWNED by api-core: `ApiController.configure({queue})`
 *     in `services/index.ts` provides the BullMQ connection; api-core's
 *     `started()` handler creates the BullMQ Queue + Worker for every
 *     `controller.registerWorker(...)` registration in this service.
 *     We don't manage `bullmq` directly — the only thing we do here is
 *     populate the application-layer dependencies.
 *
 *   - On service stopped: nothing to tear down — api-core closes the BullMQ
 *     Queue/Worker handles for us.
 */
import { resolveExampleController } from '../../lib/example-controller';
import { IngestDocumentUseCase } from '../../application/IngestDocumentUseCase';
import { infrastructure } from '../../composition/infrastructure';
// Note: openfga-permission.gate is intentionally NOT imported by default.
// Swap the gate construction in src/composition/infrastructure.ts to enable
// real OpenFGA enforcement.
// import { OpenFgaPermissionGate } from '../../infrastructure/openfga-permission.gate';

import type { IngestServiceContext } from './types';

const controller = resolveExampleController<'v1', 'ingest', IngestServiceContext>('v1', 'ingest');

// REST routes are already prefixed by the api-gateway route (`/api/v1`);
// instructing the controller to use '/' avoids the `v1/ingest/v1/ingest/...`
// duplication that autoAliases would otherwise produce.
controller.setRestBasePath('/');

controller.addStartedHandler(async (ctx) => {
  ctx.logger?.info('[v1.ingest] starting...');

  // Use case wires the (shared) adapters — pure application logic.
  const useCase = new IngestDocumentUseCase(infrastructure);

  // Stash everything on the typed service context. The references on
  // ctx.service are the SAME instances the search lifecycle hands out,
  // so search-after-ingest sees the freshly written chunks.
  ctx.service.docStore = infrastructure.docStore;
  ctx.service.chunkStore = infrastructure.chunkStore;
  ctx.service.embedder = infrastructure.embedder;
  ctx.service.gate = infrastructure.gate;
  ctx.service.useCase = useCase;

  ctx.logger?.info(
    `[v1.ingest] ready (embedder=${infrastructure.embedder.constructor.name}, ` +
      `dims=${infrastructure.embedder.dimensions})`,
  );
});

controller.addStoppedHandler(async (ctx) => {
  ctx.logger?.info('[v1.ingest] stopped.');
  // Queue cleanup is api-core's responsibility — nothing to do here.
});

export { controller };
