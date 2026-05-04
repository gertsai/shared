import { ApiController } from '@gertsai/api-core';
import { UserType, defaultSession } from '@gertsai/core';

import { IngestDocumentUseCase } from '../application/IngestDocumentUseCase';
import { SearchDocumentsUseCase } from '../application/SearchDocumentsUseCase';

import { MemoryDocumentStore } from '../adapters/outbound/memory-document.store';
import { MemoryVectorStore } from '../adapters/outbound/memory-vector.store';
import { MockEmbedder } from '../adapters/outbound/mock-embedder';
import { AllowAllPermissionGate } from '../adapters/outbound/allow-all-permission.gate';
// Note: openfga-permission.gate is intentionally NOT imported by default.
// Swap the gate construction below to enable real OpenFGA enforcement.
// import { OpenFgaPermissionGate } from '../adapters/outbound/openfga-permission.gate';

import type { DocumentsServiceContext } from '../adapters/inbound/types';

/**
 * Composition root.
 *
 * This is the ONLY module that knows about both the application use cases
 * and the concrete adapters. Inbound adapters (in adapters/inbound/) only
 * see ports through `ctx.service.<useCase>`.
 *
 * Side-effect imports below register actions with the global ApiController
 * registry. They MUST run after `ApiController.configure(...)` so that
 * action handlers see the configured session factory.
 */
export function registerServices(): void {
  // -------------------------------------------------------------------------
  // 1. Configure ApiController (session factory, queue config, etc.)
  // -------------------------------------------------------------------------
  ApiController.configure({
    sessionFactory: ((user_uuid: string, user_type: UserType) =>
      defaultSession(user_uuid, user_type, 'api', '0.0.1')) as unknown as ReturnType<
      typeof Object
    > as never,
    strictResponseValidation: process.env.NODE_ENV === 'development',
  });

  // -------------------------------------------------------------------------
  // 2. Side-effect imports trigger controller.register(...) for each action.
  //    These imports MUST come after ApiController.configure() above.
  // -------------------------------------------------------------------------
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('../adapters/inbound/moleculer-ingest.adapter');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('../adapters/inbound/moleculer-search.adapter');

  // -------------------------------------------------------------------------
  // 3. Wire concrete adapters and use cases, then attach them to the
  //    `v1.documents` service via addStartedHandler.
  //    All construction lives here so swapping adapters is a one-file edit.
  // -------------------------------------------------------------------------
  const documentsController = ApiController.resolveController<
    'v1',
    'documents',
    DocumentsServiceContext
  >('v1', 'documents');

  documentsController.addStartedHandler((lifecycle) => {
    const docStore = new MemoryDocumentStore();
    const chunkStore = new MemoryVectorStore();
    const embedder = new MockEmbedder(384);
    const gate = new AllowAllPermissionGate(lifecycle.logger ?? console);

    const ingestUseCase = new IngestDocumentUseCase({ docStore, chunkStore, embedder, gate });
    const searchUseCase = new SearchDocumentsUseCase({ chunkStore, embedder, gate });

    lifecycle.service.ingestUseCase = ingestUseCase;
    lifecycle.service.searchUseCase = searchUseCase;

    lifecycle.logger?.info(
      '[m9s-example] documents service started — adapters wired (memory store, mock embedder, allow-all gate)',
    );
  });
}
