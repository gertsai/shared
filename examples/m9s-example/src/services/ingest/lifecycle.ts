/**
 * Ingest Service Lifecycle.
 *
 * Mirrors `apps/pipeline/src/services/ingest/lifecycle.ts` shape:
 *
 *   - On service started: build outbound adapters (memory stores, mock
 *     embedder, allow-all gate), wire them into `IngestDocumentUseCase`,
 *     and stash everything on `ctx.service` so action handlers (and the
 *     queue worker registered in `src/queues/`) can reach them via the
 *     typed `IngestServiceContext` generic.
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
 *
 * This file is the single composition root for the ingest domain — the only
 * place that knows about both ports and concrete adapters.
 */
import { resolveExampleController } from '../../lib/example-controller';
import { IngestDocumentUseCase } from '../../application/IngestDocumentUseCase';
import { MemoryDocumentStore } from '../../infrastructure/memory-document.store';
import { MemoryVectorStore } from '../../infrastructure/memory-vector.store';
import { MockEmbedder } from '../../infrastructure/mock-embedder';
import { AllowAllPermissionGate } from '../../infrastructure/allow-all-permission.gate';
// Note: openfga-permission.gate is intentionally NOT imported by default.
// Swap the gate construction below to enable real OpenFGA enforcement.
// import { OpenFgaPermissionGate } from '../../infrastructure/openfga-permission.gate';

import type { IngestServiceContext } from './types';

const controller = resolveExampleController<'v1', 'ingest', IngestServiceContext>('v1', 'ingest');

// REST routes are already prefixed by the api-gateway route (`/api/v1`);
// instructing the controller to use '/' avoids the `v1/ingest/v1/ingest/...`
// duplication that autoAliases would otherwise produce.
controller.setRestBasePath('/');

controller.addStartedHandler(async (ctx) => {
  ctx.logger?.info('[v1.ingest] starting...');

  // 1. Concrete outbound adapters (swap any of these for production impls).
  const docStore = new MemoryDocumentStore();
  const chunkStore = new MemoryVectorStore();
  const embedder = new MockEmbedder(384);
  const gate = new AllowAllPermissionGate(ctx.logger ?? console);

  // 2. Use case wires the adapters together — pure application logic.
  const useCase = new IngestDocumentUseCase({ docStore, chunkStore, embedder, gate });

  // 3. Stash everything on the typed service context. Queue handles are
  //    contributed by api-core (service.addJob, service.getQueue) when
  //    ApiController.configure({queue}) was called in services/index.ts.
  ctx.service.docStore = docStore;
  ctx.service.chunkStore = chunkStore;
  ctx.service.embedder = embedder;
  ctx.service.gate = gate;
  ctx.service.useCase = useCase;

  ctx.logger?.info(`[v1.ingest] ready (embedder dims=${embedder.dimensions})`);
});

controller.addStoppedHandler(async (ctx) => {
  ctx.logger?.info('[v1.ingest] stopped.');
  // Queue cleanup is api-core's responsibility — nothing to do here.
});

export { controller };
