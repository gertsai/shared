/**
 * Ingest queue barrel.
 *
 * Side-effect import of `ingest-chunk.worker` registers the BullMQ worker
 * with `ApiController` at module-load time — same pattern as
 * `apps/pipeline/src/services/ingest/src/queues/index.ts`.
 */

// Side-effect: registers the worker with controller.registerWorker(...)
import './ingest-chunk.worker';

// Public surface — names + types used by action handlers.
export {
  INGEST_QUEUE_NAME,
  JOB_PROCESS_DOCUMENT,
  type ProcessDocumentJobData,
  type ProcessDocumentJobResult,
} from './ingest-chunk.worker';
