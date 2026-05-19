// SPDX-License-Identifier: Apache-2.0
/**
 * Subscription schema-fragment builder.
 *
 * Pure function extracted from `ApiController._createSubscriberSchema(...)` in
 * Wave 15.C (PRD-052 / EVID-067 §15.C). Returns the runtime
 * subscription fragment for a single registered topic.
 *
 * Error handling is delegated to a consumer-provided `errorTranslator` so
 * this module does not take a hard dependency on `@gertsai/api-core`'s
 * `APIError`. api-core wires the existing scrub semantics back in via the
 * adapter when calling this helper.
 */

import type { Message, Subscription } from '@google-cloud/pubsub';
import type Moleculer from 'moleculer';

import type {
  ApiControllerSubscribedTopics,
  SubscriberHandlerCtx,
  SubscriptionSchemaFragment,
} from './types';

/**
 * Translate an unknown thrown value into the error that should propagate out
 * of the subscriber handler. Used so api-core can keep its `APIError` scrub
 * semantics while `@gertsai/api-pubsub` stays domain-agnostic.
 *
 * Default behaviour: rethrow `Error` instances as-is, wrap unknown shapes
 * into a generic `Error('Unknown subscriber handler error')`.
 */
export type SubscriberErrorTranslator = (err: unknown) => Error;

const defaultErrorTranslator: SubscriberErrorTranslator = (err) => {
  if (err instanceof Error) return err;
  return new Error('Unknown subscriber handler error');
};

export type CreateSubscriberSchemaFragmentOptions = {
  /**
   * Translate thrown values inside the subscriber handler.
   * @default rethrow `Error` instances; wrap others.
   */
  errorTranslator?: SubscriberErrorTranslator;
  /**
   * Whether the configured Pub/Sub client is targeting the emulator.
   * Surfaced into `meta.isEmulator` for downstream handlers (matches the
   * pre-extraction `ApiController._config.pubSub?.isEmulator ?? false`
   * semantics).
   */
  isEmulator?: boolean;
};

/**
 * Build the per-topic schema fragment that `ApiController.generateServiceSchema()`
 * attaches under `schema.subscriptions[<topicName>]`.
 *
 * The wrapped handler:
 *  - resolves `meta` (isEmulator + topic + subscription names),
 *  - invokes the user-registered handler with the live `Subscription` + `Message`,
 *  - delegates thrown values to `errorTranslator` (api-core uses `APIError`
 *    scrub semantics).
 */
export function createSubscriberSchemaFragment(
  // oxlint-disable-next-line @typescript-eslint/no-explicit-any
  subscription: ApiControllerSubscribedTopics<any, any, any>,
  opts: CreateSubscriberSchemaFragmentOptions = {},
): SubscriptionSchemaFragment {
  const translate = opts.errorTranslator ?? defaultErrorTranslator;
  const isEmulator = opts.isEmulator ?? false;

  return {
    ...(subscription.options.name && {
      subscriptionName: subscription.options.name,
    }),
    ...(subscription.options.on && { on: subscription.options.on }),
    handler: async function (
      this: Moleculer.Service,
      sub: Subscription,
      message: Message,
    ): Promise<SubscriberHandlerCtx> {
      try {
        // The user-registered handler returns whatever the consumer wants —
        // api-core type'd this as Promise<SubscriberHandlerCtx>, kept as-is
        // for source compat.
        // oxlint-disable-next-line @typescript-eslint/no-explicit-any
        return await (subscription.options.handler as any).call(this, {
          subscription: sub,
          meta: {
            isEmulator,
            topic_name: subscription.topicName,
            subscription_name: subscription.options.name,
          },
          message,
          // oxlint-disable-next-line @typescript-eslint/no-explicit-any
          addJob: (this as any).addJob,
          // oxlint-disable-next-line @typescript-eslint/no-explicit-any
          getQueue: (this as any).getQueue,
          // oxlint-disable-next-line @typescript-eslint/no-explicit-any
          call: (...args: [string, Record<string, any>]) =>
            // oxlint-disable-next-line @typescript-eslint/no-explicit-any
            this.broker.call(...args).then((res: any) => res.data),
          logger: this.logger,
        });
      } catch (err: unknown) {
        throw translate(err);
      }
    },
  };
}
