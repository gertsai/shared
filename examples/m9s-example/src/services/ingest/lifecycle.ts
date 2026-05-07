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
import { setWorkflows } from '@gertsai/api-core/moleculer';

import { resolveExampleController } from '../../lib/example-controller';
import { IngestDocumentUseCase } from '../../application/IngestDocumentUseCase';
import { createIngestProcessWorkflow } from '../../application/IngestProcessWorkflow';
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

// ---------------------------------------------------------------------------
// Workflow registration (Sprint 3.1 §W-7).
//
// Previously: `IngestWorkflowService` was a separate Moleculer service
// (`wf-ingest`) hand-rolled in `services/workflows/ingest-process.workflow.ts`
// and added to `ApiController.Start({ services: [...] })`. That worked but
// coupled the workflow body to Moleculer (handler took a `Context`).
//
// Now: the workflow is a pure `WorkflowDefinition` from the application
// layer. `setWorkflows()` adapts it to the Moleculer-flavoured schema and
// stores it in the controller's pending-workflows map; api-core's
// `_attachWorkflowsToServices()` mutates the synthesized service schema
// (in `generateServiceSchema()`, BEFORE `broker.start()`) to add the
// `workflows: {...}` block that `@moleculer/workflows` middleware reads
// during `serviceCreated`.
//
// Naming: `@moleculer/workflows` builds the runtime workflow name as
// `<svc.fullName>.<wf.name>`. The synthesized service is `v1.ingest`,
// the registration key here is `'process'`, so the runtime name becomes
// `v1.ingest.process`. The matching `start-workflow.action.ts` calls
// `broker.wf.run('v1.ingest.process', ...)`.
//
// Use-case dependency: `createIngestProcessWorkflow` accepts the
// `IngestDocumentUseCase` directly, but the use case needs to be a
// stable reference that observes the SAME shared infrastructure as the
// `addStartedHandler` below. Constructing it here at module-load time
// is safe because `infrastructure` is a module-load singleton (see
// `src/composition/infrastructure.ts`). The lifecycle handler reuses
// the same instance via closure.
//
// Sprint 3.0.1 audit F-CR-3 asked: "should this move into addStartedHandler
// for test-isolation symmetry with the rest of the file?" The answer is
// **no, by design**: module-load registration is a HARD runtime
// requirement. `@moleculer/workflows` middleware reads `schema.workflows`
// at `broker.createService(schema)` time (during the synchronous service-
// creation path in `ApiController.Start({services})`) — which fires
// BEFORE any `addStartedHandler` callback runs. If `setWorkflows` were
// deferred into `addStartedHandler`, the middleware would see an empty
// workflows block and `broker.wf.run('v1.ingest.process', ...)` would
// throw at runtime (per Sprint 3.1 EVID-005 timing analysis).
//
// The test-isolation cost is small: `vi.mock` of infrastructure already
// runs before this module is imported (vitest hoists `vi.mock` calls
// above imports). For tests that need to substitute the use case
// itself, use `setAuthProvider`-style controller hooks rather than
// re-mocking this module-load side effect.
// ---------------------------------------------------------------------------
const ingestUseCase = new IngestDocumentUseCase(infrastructure);

// TODO Sprint 3.0.1: drop the `as unknown as Parameters<...>` cast once F-3
// (type-system-worker) lands `class ApiController implements
// ApiControllerInternalHook`. Until then, the cast bridges the structural-
// vs-nominal gap between `ApiController`'s `_registerWorkflow` method and
// the `ApiControllerInternalHook` contract that `setWorkflows` requires.
setWorkflows(controller as unknown as Parameters<typeof setWorkflows>[0], {
  process: createIngestProcessWorkflow({ useCase: ingestUseCase }),
});

controller.addStartedHandler(async (ctx) => {
  ctx.logger?.info('[v1.ingest] starting...');

  // Stash everything on the typed service context. The references on
  // ctx.service are the SAME instances the search lifecycle hands out,
  // so search-after-ingest sees the freshly written chunks.
  ctx.service.docStore = infrastructure.docStore;
  ctx.service.chunkStore = infrastructure.chunkStore;
  ctx.service.embedder = infrastructure.embedder;
  ctx.service.gate = infrastructure.gate;
  ctx.service.useCase = ingestUseCase;

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
