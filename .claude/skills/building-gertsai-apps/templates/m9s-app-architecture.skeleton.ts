// @ts-nocheck — TEMPLATE skeleton: copy into your @gertsai/Moleculer app and adapt the TODOs.
// Imports (@gertsai/*, app-relative paths) resolve only inside a consuming app, not in this repo.
// Some skeletons concatenate several files under "// ===== FILE: <path> =====" banners — split on paste.
// Delete this header once pasted into a real, typed project.
// =============================================================================
// src/index.ts — entry point. NEVER `new ServiceBroker()`.
// =============================================================================
import { initObservability, shutdownObservability } from './observability';
initObservability(); // no-op unless OTEL_EXPORTER_OTLP_ENDPOINT set

import './services'; // side-effect: register all controllers + lifecycle handlers

import { ApiController } from '@gertsai/api-core/moleculer';
import config from '../project.config';
import brokerConfig from '../moleculer.config';
import { createAppLogger } from './shared/logger';
import ApiService from './mol-services/api.service';

const log = createAppLogger('my-app');

async function main(): Promise<void> {
  await ApiController.Start({
    brokerConfig,
    services: [ApiService /* , ...plain moleculer services */],
    repl: process.argv.includes('--repl'),
    workersEnabled: config.WORKERS_ENABLED,
    // ...(enabledServices && { enabledServices }),   // from SERVICES env
    // ...(enabledWorkers && { enabledWorkers }),      // from WORKERS env
  });
}

if (require.main === module) {
  // install SIGTERM/SIGINT handlers that flush OTel then re-raise, then:
  main().catch((err: unknown) => { log.error('startup failed', { err }); process.exit(1); });
}
export { main };

// =============================================================================
// src/services/index.ts — configure ONCE, then side-effect import each service.
// =============================================================================
import IORedis from 'ioredis';
import { ApiController, type BullMQConnectionOptions } from '@gertsai/api-core/moleculer';
import { defaultSession, UserType } from '@gertsai/core';
import config from '../../project.config';

const queueConfig: BullMQConnectionOptions | undefined = config.REDIS_URL
  ? {
      connection: new IORedis(config.REDIS_URL, {
        maxRetriesPerRequest: null,   // required by BullMQ
        enableReadyCheck: false,
      }) as unknown as BullMQConnectionOptions['connection'],
      defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 1_000 } },
    }
  : undefined;

// MUST run before any service import — seeds the static registry.
ApiController.configure({
  sessionFactory: ((uid: string, type: UserType) =>
    defaultSession(uid, type, 'api', config.APP_VERSION)) as never,
  ...(queueConfig && { queue: queueConfig }),
  strictResponseValidation: process.env.NODE_ENV === 'development',
});

import './ingest'; // TODO: side-effect imports register controllers + workers
// import './search';

// =============================================================================
// src/composition/infrastructure.ts — composition root (module-load singleton).
// =============================================================================
import { InMemoryStorageProvider } from '@gertsai/entity-storage';
import { Session } from '@gertsai/session';
import type { IDocumentStore } from '../domain/ports/IDocumentStore';
import type { IEmbedder } from '../domain/ports/IEmbedder';
// import { DocumentRepository } from '../infrastructure/document.repository';

export interface SharedInfrastructure {
  readonly docStore: IDocumentStore;
  readonly embedder: IEmbedder;
  // TODO: add other outbound ports (chunkStore, gate, ...)
}

export function buildInfrastructure(): SharedInfrastructure {
  // TODO: env-driven switch over concrete adapters; return PORT types only.
  const docStore = /* new DocumentRepository(new InMemoryStorageProvider(), session) */ {} as IDocumentStore;
  const embedder = /* new MockEmbedder(384) */ {} as IEmbedder;
  return { docStore, embedder };
}

// One instance shared by every service → write-through-one visible to query-through-other.
export const infrastructure: SharedInfrastructure = buildInfrastructure();

// =============================================================================
// src/services/ingest/types.ts — typed service context.
// =============================================================================
import type { ServiceContextBase } from '@gertsai/api-core/moleculer';

export interface IngestServiceContext extends ServiceContextBase {
  docStore: import('../../domain/ports/IDocumentStore').IDocumentStore;
  useCase: import('../../application/IngestDocumentUseCase').IngestDocumentUseCase;
  // addJob / getQueue are injected by api-core when queue is configured — do NOT declare.
}

// =============================================================================
// src/services/ingest/lifecycle.ts — resolve typed controller, stash deps.
// =============================================================================
import { resolveExampleController } from '../../lib/example-controller';
import { IngestDocumentUseCase } from '../../application/IngestDocumentUseCase';
import { infrastructure } from '../../composition/infrastructure';
import type { IngestServiceContext } from './types';

const controller = resolveExampleController<'v1', 'ingest', IngestServiceContext>('v1', 'ingest');
controller.setRestBasePath('/'); // api-gateway already prefixes /api/v1

const ingestUseCase = new IngestDocumentUseCase(infrastructure); // module-load: stable ref

controller.addStartedHandler(async (ctx) => {
  ctx.service.docStore = infrastructure.docStore; // SAME singleton across services
  ctx.service.useCase = ingestUseCase;
});
controller.addStoppedHandler(async (ctx) => {
  (ctx.service as { _destroyed?: boolean })._destroyed = true;
});
export { controller };

// =============================================================================
// src/services/ingest/src/actions/ingest-document.action.ts — pure transport.
// =============================================================================
import { APIError, ResponseCode } from '@gertsai/api-core/contracts';
import { defineAction } from '@gertsai/api-core/moleculer';
import { isAppError } from '@gertsai/errors';
import typia from 'typia';
import { appErrorToHttpResponse } from '../../../../shared/error-scrubber';

export const ingestDocument = defineAction(controller.register('document', {
  auth: 'none', // TODO: 'required' once a real auth middleware is wired
  rest: 'POST /ingest/document',
  params: typia.createValidate</* IngestDocumentRequest */ unknown>(),
  response: typia.createValidate</* IngestDocumentResponse */ unknown>(),
  responseCode: ResponseCode.SUCCESS_CREATED,
  responseMessage: 'Accepted',
  async handler({ params, ctx, service, logger, respond, addJob }) {
    try {
      // TODO: assertAuthenticated(session) / assertSessionInTenant(...) BEFORE branching.
      // TODO: if (QUEUE_ENABLED) await addJob(QUEUE, JOB, payload); else service.useCase.execute(...)
      return respond(/* result */ {} as never, 'Accepted', ResponseCode.SUCCESS_CREATED);
    } catch (err) {
      if (isAppError(err)) {
        const { body } = appErrorToHttpResponse(err); // scrub PII before the wire
        throw new APIError(ResponseCode.INTERNAL_ERROR, body.details as never, body.title);
      }
      throw err; // let the framework default handler take unknowns
    }
  },
}));
