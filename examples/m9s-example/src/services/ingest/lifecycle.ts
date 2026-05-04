/**
 * Ingest Service Lifecycle.
 *
 * Mirrors `apps/pipeline/src/services/ingest/lifecycle.ts`:
 *
 *   - On service started: build outbound adapters (memory stores, mock
 *     embedder, allow-all gate), wire them into `IngestDocumentUseCase`,
 *     initialise the queue (BullMQ or inline fallback), and stash all of
 *     it on `ctx.service` so action handlers can pull it out via the
 *     typed `IngestServiceContext` generic.
 *
 *   - On service stopped: close the queue (idempotent for inline mode).
 *
 * This file is the SINGLE place that knows about both ports and concrete
 * adapters — the action handlers see only abstractions through `service.*`.
 */
import config from '../../../project.config';
import { resolveExampleController } from '../../lib/example-controller';
import { IngestDocumentUseCase } from '../../application/IngestDocumentUseCase';
import { MemoryDocumentStore } from '../../infrastructure/memory-document.store';
import { MemoryVectorStore } from '../../infrastructure/memory-vector.store';
import { MockEmbedder } from '../../infrastructure/mock-embedder';
import { AllowAllPermissionGate } from '../../infrastructure/allow-all-permission.gate';
// Note: openfga-permission.gate is intentionally NOT imported by default.
// Swap the gate construction below to enable real OpenFGA enforcement.
// import { OpenFgaPermissionGate } from '../../infrastructure/openfga-permission.gate';

import { initIngestQueue, closeIngestQueue } from './src/queues';
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

  // 3. Queue (BullMQ when REDIS_URL set, inline synchronous otherwise).
  //    `workerEnabled` mirrors pipeline's WORKERS_ENABLED contract — when
  //    false, the queue is producer-only (jobs are added but no worker is
  //    started in this process — useful for API-gateway nodes).
  const queue = await initIngestQueue({
    useCase,
    logger: ctx.logger,
    concurrency: config.WORKER_CONCURRENCY,
    workerEnabled: config.WORKERS_ENABLED,
  });

  // 4. Stash everything on the typed service context.
  ctx.service.docStore = docStore;
  ctx.service.chunkStore = chunkStore;
  ctx.service.embedder = embedder;
  ctx.service.gate = gate;
  ctx.service.useCase = useCase;
  ctx.service.queue = queue;

  ctx.logger?.info(
    `[v1.ingest] ready (queue mode=${queue.mode}, ` +
      `worker=${config.WORKERS_ENABLED ? `on×${config.WORKER_CONCURRENCY}` : 'off'}, ` +
      `embedder dims=${embedder.dimensions})`,
  );
});

controller.addStoppedHandler(async (ctx) => {
  ctx.logger?.info('[v1.ingest] stopping...');
  await closeIngestQueue(ctx.service.queue);
  ctx.logger?.info('[v1.ingest] stopped.');
});

export { controller };
