/**
 * m9s-example — main entry point.
 *
 * Mirrors `apps/pipeline/src/index.ts` shape:
 *
 *   1. Side-effect import `./services` — each domain folder registers its
 *      controller in `ApiController._controllers` and attaches lifecycle
 *      handlers as a side effect.
 *   2. Parse env-driven launch params (SERVICES, WORKERS_ENABLED, WORKERS,
 *      --repl) — same shape as pipeline so deployment commands transfer.
 *   3. Call `ApiController.Start({ brokerConfig, services, repl,
 *      enabledServices, workersEnabled, enabledWorkers })` — the launcher
 *      creates the broker, generates a Moleculer service schema for every
 *      registered controller, and starts everything.
 *
 * NO direct `new ServiceBroker(...)` — `ApiController.Start` owns broker
 * construction so the lifecycle handlers fire before any action runs.
 *
 * Run examples:
 *
 *   pnpm --filter @gertsai-examples/m9s-example run start
 *
 *   # Only ingest service, no workers (producer-only / API Gateway mode):
 *   WORKERS_ENABLED=false SERVICES=ingest pnpm start
 *
 *   # All services, BullMQ-backed queue with 8 workers:
 *   REDIS_URL=redis://localhost:6379 WORKER_CONCURRENCY=8 pnpm start
 *
 *   # Interactive REPL:
 *   pnpm start -- --repl
 *
 * Then try:
 *   curl -X POST http://localhost:3000/api/v1/ingest/document \
 *        -H 'content-type: application/json' \
 *        -d '{"docId":"d1","text":"Hexagonal architecture isolates the core."}'
 *
 *   curl -X POST http://localhost:3000/api/v1/search/query \
 *        -H 'content-type: application/json' \
 *        -d '{"query":"hexagonal"}'
 */

// 1. Side-effect: register all domain controllers + lifecycle handlers.
import './services';

import { ApiController, createOpenApiService } from '@gertsai/api-core/moleculer';

import config from '../project.config';
import brokerConfig from '../moleculer.config';
import { createAppLogger } from './shared/logger';
import ApiService from './mol-services/api.service';
// Wave 9 PRD-015 / SPEC-019: hand-curated OpenAPI 3.1 spec wired into
// the broker as a Moleculer service via `createOpenApiService(schema)`.
// The service registers `GET /schema.json` + `GET /schema.local.json`
// + a broker-callable `schema` action (for `aggregateSchema()` merges
// across multi-node deployments). HTTP route exposure is bound by the
// api-gateway route whitelist (api.service.ts) — currently `v1.**`,
// so the openapi (`v2`) service is reachable via broker.call but not
// auto-aliased on `/openapi/schema.json` yet. Full HTTP wiring lands
// alongside Teammate B's `m9s-example-api-types` generator package in
// the same wave; this teammate's slice ships the broker-side service +
// the canonical schema source so the wiring contract is stable.
import { buildOpenApiSchema } from './openapi';
// Sprint 3.1 §W-7: the `ingest.process` workflow is now registered onto
// the `v1.ingest` controller via `setWorkflows(...)` in
// `services/ingest/lifecycle.ts` (api-core attaches it to the synthesized
// Moleculer schema before broker.start). The previous standalone
// `IngestWorkflowService` (`wf-ingest`) is gone — workflows are no longer
// a separate Moleculer service in this example. The runtime workflow
// name moved from `wf-ingest.ingest.process` to `v1.ingest.process`.
//
// Plain Moleculer service hosting `@moleculer/channels` subscribers
// (cross-service reliable events). Loaded unconditionally; the channels
// middleware (gated on REDIS_URL in moleculer.config.ts) is what makes
// the handlers active. Without REDIS_URL the service registers but no
// Redis Streams consumer-groups are created.
import DocumentEventsChannelService from './services/channels/document-events.channel';

// Module-scoped logger (Wave 8.1) — `module: 'm9s-example'` baseContext
// carries through every emitted line, replacing the legacy `[m9s-example]`
// string prefix. Redaction is default-on per logger-factory I-17.
const log = createAppLogger('m9s-example');

// =============================================================================
// Env parsing helpers — mirror apps/pipeline/src/index.ts
// =============================================================================

/**
 * Parse SERVICES env var into full service names.
 * Short names (e.g. "ingest") are auto-prefixed with API_VERSION.
 */
function parseServicesEnv(): string[] | undefined {
  const raw = process.env.SERVICES;
  if (!raw) return undefined;
  const parts = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0) return undefined;
  return parts.map((name) => (name.includes('.') ? name : `${config.API_VERSION}.${name}`));
}

/**
 * Parse WORKERS env var into worker queue names. `undefined` = all workers.
 */
function parseWorkersEnv(): string[] | undefined {
  const raw = process.env.WORKERS;
  if (!raw) return undefined;
  const parts = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : undefined;
}

// =============================================================================
// Main
// =============================================================================

async function main(): Promise<void> {
  const enabledServices = parseServicesEnv();
  const workersEnabled = config.WORKERS_ENABLED;
  const enabledWorkers = parseWorkersEnv();
  const replEnabled = process.argv.includes('--repl');

  log.info('starting', {
    appVersion: config.APP_VERSION,
    namespace: config.MOLECULER_NAMESPACE,
    port: config.WEB_SERVER_PORT,
  });

  if (enabledServices) {
    log.info('loading services', { services: enabledServices });
  } else {
    log.info('loading all services');
  }

  if (!workersEnabled) {
    log.info('workers disabled', { reason: 'API Gateway / producer-only mode' });
  } else if (enabledWorkers) {
    log.info('workers enabled', {
      workers: enabledWorkers,
      concurrency: config.WORKER_CONCURRENCY,
    });
  } else {
    log.info('workers enabled', { concurrency: config.WORKER_CONCURRENCY });
  }

  // Wave 9: build the hand-curated OpenAPI 3.1 document and pass it to
  // `createOpenApiService(schema)`. The schema literal is structurally
  // compatible with `OpenApiV3_1.IDocument` (from `@samchon/openapi`,
  // transitively required via `@gertsai/api-core`); we deliberately
  // do not import the type here to avoid pulling a transitive dep
  // into the m9s-example surface.
  const openApiService = createOpenApiService(
    buildOpenApiSchema() as Parameters<typeof createOpenApiService>[0],
  );

  await ApiController.Start({
    brokerConfig,
    services: [ApiService, DocumentEventsChannelService, openApiService],
    repl: replEnabled,
    workersEnabled,
    ...(enabledServices !== undefined && { enabledServices }),
    ...(enabledWorkers !== undefined && { enabledWorkers }),
  });
}

// Only run when executed directly. Allows tests to import this file
// without triggering broker startup as a side effect.
if (require.main === module) {
  main().catch((err: unknown) => {
    log.error('startup failed', { err });
    process.exit(1);
  });
}

export { main };
