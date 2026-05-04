/**
 * Document-events channels service.
 *
 * Subscribes to `@moleculer/channels` topics for cross-service events
 * with at-least-once delivery semantics. Mirrors the pipeline pattern of
 * a thin Moleculer service that owns ONLY channel handlers — no actions,
 * no lifecycle wiring of business logic, just side-effects on durable
 * messages produced elsewhere in the system.
 *
 * Channels are declared in service-schema's `channels` property; the
 * @moleculer/channels middleware (added in `moleculer.config.ts` when
 * REDIS_URL is set) discovers them at registration time and creates the
 * Redis Streams consumer-groups automatically.
 *
 * The example flow:
 *
 *   1. POST /api/v1/ingest/document → ingest action enqueues BullMQ job
 *   2. BullMQ worker (api-core registered) runs IngestDocumentUseCase
 *   3. On completion, the worker publishes `m9s-example.document.indexed`
 *      via `service.broker.sendToChannel(...)` — see `ingest-chunk.worker.ts`
 *   4. **This service** consumes that channel and reacts (logs / metrics /
 *      cache invalidation / forward to another channel — pick your saga step)
 *
 * Idempotency note:
 *   Channels guarantee at-least-once delivery, NEVER exactly-once. Handlers
 *   may be invoked twice for the same payload (e.g., consumer crash between
 *   business logic and ack). For real systems, the handler MUST be
 *   idempotent — typically by checking a "processed" key in Redis with a
 *   TTL that exceeds the channel's `maxRetries × retry interval`. The
 *   example just logs, so duplicate logs are acceptable.
 */
import type { ServiceSchema, Service } from 'moleculer';

export const DOCUMENT_INDEXED_CHANNEL = 'm9s-example.document.indexed' as const;

export interface DocumentIndexedEvent {
  /** Document identifier echoed from the ingest action */
  docId: string;
  /** Final chunk count produced by the worker */
  chunkCount: number;
  /** User who triggered the ingest (or 'anonymous') */
  userId: string;
  /** ms since epoch when the ingest worker finished */
  indexedAt: number;
  /** Optional: BullMQ job id that produced the event */
  jobId?: string;
}

const DocumentEventsChannelService: ServiceSchema = {
  name: 'channel-document-events',

  channels: {
    /**
     * Subscribe to `m9s-example.document.indexed`.
     *
     * `group: 'document-events-readers'` means multiple instances of
     * THIS service share the load — Redis Streams `XREADGROUP` routes
     * each message to exactly one consumer in the group. Add another
     * group (`'document-events-archivers'`, etc.) to fan-out the event
     * to a parallel consumer that gets EVERY message independently.
     *
     * `maxRetries: 5` + `deadLettering.enabled: true` means a handler
     * that throws will retry up to 5 times before the message is
     * routed to the DLQ for manual inspection.
     */
    [DOCUMENT_INDEXED_CHANNEL]: {
      group: 'document-events-readers',
      maxRetries: 5,
      deadLettering: {
        enabled: true,
        queueName: 'm9s-example:document.indexed:dlq',
      },
      async handler(this: Service, payload: DocumentIndexedEvent) {
        // The handler `this` is bound to the Moleculer service instance,
        // so `logger` and `broker` are available.
        if (!payload || typeof payload.docId !== 'string') {
          // Throwing here → NACK → retry up to maxRetries → DLQ.
          throw new Error(`[document.indexed] invalid payload: ${JSON.stringify(payload)}`);
        }

        const ageMs = Date.now() - (payload.indexedAt ?? Date.now());
        this.logger?.info(
          `[channel:document.indexed] doc=${payload.docId} ` +
            `chunks=${payload.chunkCount} user=${payload.userId} ` +
            `age=${ageMs}ms` +
            (payload.jobId ? ` job=${payload.jobId}` : ''),
        );

        // Real systems would do something here — e.g.:
        //   - publish to a downstream channel (saga next step)
        //   - call `this.broker.call('v1.search.refresh-index', ...)` for incremental rebuild
        //   - bump a metric / write to an audit log
        //   - send a notification webhook
        //
        // For the demo we return cleanly — the message is ACK'd and
        // disappears from the consumer-group pending list.
      },
    },
  },
};

export default DocumentEventsChannelService;
