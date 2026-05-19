// SPDX-License-Identifier: Apache-2.0
/**
 * Queue schema-fragment builder.
 *
 * Pure function extracted from `ApiController._createQueueSchema(...)` in
 * Wave 15.B (PRD-051 / EVID-067 §15.B). Returns the runtime queue/worker
 * fragment for a single registered queue, including the tracing-aware
 * wrapper handler that BullMQ Worker calls invoke at job time.
 *
 * Error handling is delegated to a consumer-provided `errorTranslator`
 * so this module does not take a hard dependency on `@gertsai/api-core`'s
 * `APIError`. api-core wires the existing scrub semantics back in.
 */

import type { Job } from 'bullmq';
import type Moleculer from 'moleculer';

import type {
  ApiControllerRegisteredQueue,
  JobDataWithTraceContext,
  QueueHandler,
  QueueSchemaFragment,
  QueueTraceContext,
} from './types';

/**
 * Translate an unknown thrown value into the error that should propagate out
 * of the BullMQ handler. Used so api-core can keep its `APIError` scrub
 * semantics while `@gertsai/api-queue` stays domain-agnostic.
 *
 * Default behaviour: rethrow `Error` instances as-is, wrap unknown shapes
 * into a generic `Error('Unknown queue handler error')`.
 */
export type QueueErrorTranslator = (err: unknown) => Error;

const defaultErrorTranslator: QueueErrorTranslator = (err) => {
  if (err instanceof Error) return err;
  return new Error('Unknown queue handler error');
};

export type CreateQueueSchemaFragmentOptions = {
  /**
   * Translate thrown values inside the queue handler.
   * @default rethrow `Error` instances; wrap others.
   */
  errorTranslator?: QueueErrorTranslator;
};

/**
 * Build the per-queue schema fragment that `ApiController.generateServiceSchema()`
 * attaches under `schema.queues[<queueName>]`.
 *
 * Each handler in the fragment is wrapped to:
 * - extract `_traceContext` from job data,
 * - open a child tracing span when sampled,
 * - call the user-registered handler with a typed context object,
 * - close the span (or attach the error to it) afterwards.
 */
export function createQueueSchemaFragment(
  queue: ApiControllerRegisteredQueue<string, number>,
  opts: CreateQueueSchemaFragmentOptions = {},
): QueueSchemaFragment {
  const translate = opts.errorTranslator ?? defaultErrorTranslator;

  return {
    ...(queue.name && { name: queue.name }),
    ...(queue.on && { on: queue.on }),
    handlers: queue.handlers.map((handler) => {
      return {
        ...(handler.name && { name: handler.name }),
        ...(handler.concurrency && { concurrency: handler.concurrency }),
        // Store original handler for BullMQ Worker to call with proper context
        _originalHandler: handler.handler as QueueHandler,
        handler: async function (this: Moleculer.Service, job: Job): Promise<unknown> {
          // Extract trace context from job data (propagated from parent request)
          const jobData = (job.data || {}) as JobDataWithTraceContext;
          const traceContext: QueueTraceContext | undefined = jobData._traceContext;

          // Create span for queue job processing (links to parent trace)
          const tracer = this.broker.tracer;
          const span =
            traceContext?.sampled && tracer
              ? tracer.startSpan(
                  `queue.${queue.name || 'unknown'}.${handler.name || job.name}`,
                  {
                    parentID: traceContext.parentId,
                    traceID: traceContext.traceId,
                    sampled: traceContext.sampled,
                    tags: {
                      'queue.name': queue.name || 'unknown',
                      'queue.job.id': job.id,
                      'queue.job.name': job.name,
                      'queue.handler': handler.name || 'anonymous',
                    },
                  },
                )
              : null;

          try {
            // The fragment-level wrapper omits getQueue/addJob because the
            // schema-fragment caller only invokes this from `_createQueueSchema`
            // (i.e. the pre-Wave-15.B inline path). The worker-boot path (which
            // wires getQueue/addJob) lives in `lifecycle.ts` and constructs
            // the full QueueHandlerCtx itself. Cast through `any` to keep the
            // original calling convention; consumers receive the full typed
            // ctx via the worker-boot path.
            // oxlint-disable-next-line @typescript-eslint/no-explicit-any
            const result = await (handler.handler as any).call(this, {
              job,
              /**
               * Call function with trace context propagation.
               * Automatically passes trace context in meta for downstream services.
               *
               * Note: cast through `unknown` keeps the public `QueueActionCallFunction`
               * shape (which infers per-action params/response from the consumer's
               * `RegisteredActions` declaration-merge target) while letting the
               * tracing wrapper use a simpler structural signature internally.
               */
              call: ((
                // oxlint-disable-next-line @typescript-eslint/no-explicit-any
                action: string,
                // oxlint-disable-next-line @typescript-eslint/no-explicit-any
                params?: Record<string, any>,
                // oxlint-disable-next-line @typescript-eslint/no-explicit-any
                options?: Record<string, any>,
              ) => {
                const opts = options ?? {};
                // Propagate trace context via meta for downstream calls
                const existingMeta = (opts as { meta?: Record<string, unknown> })?.meta ?? {};
                const callOpts = traceContext
                  ? {
                      ...opts,
                      parentSpan: span || undefined,
                      meta: {
                        ...existingMeta,
                        $traceContext: traceContext,
                      },
                    }
                  : opts;
                return this.broker
                  .call(action, params, callOpts)
                  .then((res: unknown) => (res as { data: unknown }).data);
                // oxlint-disable-next-line @typescript-eslint/no-explicit-any
              }) as any,
              logger: this.logger,
              traceContext,
            });

            // Mark span as successful
            span?.finish();
            return result;
          } catch (err: unknown) {
            // Mark span with error
            if (err instanceof Error) {
              span?.setError(err);
            }
            span?.finish();

            // Delegate to consumer-provided translator (api-core wires APIError
            // scrub semantics; default translator just rethrows Errors).
            throw translate(err);
          }
        },
      };
    }),
  };
}
