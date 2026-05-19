// SPDX-License-Identifier: Apache-2.0
/**
 * Moleculer service-methods factory for Pub/Sub.
 *
 * Returns the `getSubscription` method that `ApiController.generateServiceSchema()`
 * attaches under `schema.methods`. Bound at runtime to the Moleculer service
 * instance via `this`, so the returned record is a plain `Record<string, Function>`
 * shaped exactly the way Moleculer expects.
 *
 * Wave 15.C — extracted from `ApiController.class.ts` `getSubscription`
 * inline method (PRD-052 / EVID-067 §15.C).
 */

import type { PubSub, Subscription } from '@google-cloud/pubsub';

/**
 * Factory output: empty record when `pubSub` is missing (matches the original
 * `...(ApiController._config.pubSub && { ... })` spread behaviour), otherwise
 * a `{ getSubscription }` record ready to be mixed into the Moleculer service
 * schema's `methods` block.
 */
// oxlint-disable-next-line @typescript-eslint/no-explicit-any
export type PubsubServiceMethods = Record<string, any>;

/**
 * Optional hook the consumer can pass to customize log output. The original
 * inline implementation used `colorts` to colorize topic/subscription names.
 * Keep that wiring as a callback so this package does not pull `colorts`.
 */
export type LogColorizer = {
  topicCreated?: (name: string) => string;
  topicExists?: (name: string) => string;
  subscriptionCreated?: (name: string) => string;
  subscriptionExists?: (name: string) => string;
};

export type CreatePubsubServiceMethodsOptions = {
  /** Pre-resolved `@google-cloud/pubsub` `PubSub` client. */
  pubSub: PubSub;
  /** Optional log formatting hooks (api-core wires `colorts` through these). */
  colorize?: LogColorizer;
};

/**
 * Build the Pub/Sub service methods. Returns an empty object when
 * `pubSub` is not provided (matches api-core's conditional-spread pattern).
 *
 * Methods are intentionally not arrow functions — Moleculer binds `this` to
 * the service instance at registration time, and `this.$subscriptions` is
 * the runtime subscription cache populated in `started()`.
 */
export function createPubsubServiceMethods(
  config: CreatePubsubServiceMethodsOptions | undefined,
): PubsubServiceMethods {
  if (!config) return {};

  const { pubSub, colorize = {} } = config;

  return {
    /**
     * Resolve (or create) a topic + subscription pair. Memoizes the resolved
     * `Subscription` under `service.$subscriptions[subscriptionName]`.
     */
    async getSubscription(
      this: {
        $subscriptions: Record<string, Subscription>;
        // oxlint-disable-next-line @typescript-eslint/no-explicit-any
        logger?: { info?: (...args: any[]) => void };
      },
      subscriptionName: string,
      topicName: string,
    ): Promise<Subscription> {
      const topic = pubSub.topic(topicName);
      const [exists] = await topic.exists();

      if (!exists) {
        await pubSub.createTopic(topicName);
        this.logger?.info?.(
          'Topic created: ',
          colorize.topicCreated ? colorize.topicCreated(topicName) : topicName,
        );
      } else {
        this.logger?.info?.(
          'Topic exists: ',
          colorize.topicExists ? colorize.topicExists(topicName) : topicName,
        );
      }

      let subscription = topic.subscription(subscriptionName);
      const [existsSubs] = await subscription.exists();

      if (!existsSubs) {
        [subscription] = await topic.createSubscription(subscriptionName, {
          enableMessageOrdering: true,
        });
        this.logger?.info?.(
          'Subscription created: ',
          colorize.subscriptionCreated
            ? colorize.subscriptionCreated(subscriptionName)
            : subscriptionName,
        );
      } else {
        this.logger?.info?.(
          'Subscription exists: ',
          colorize.subscriptionExists
            ? colorize.subscriptionExists(subscriptionName)
            : subscriptionName,
        );
      }

      const subscriptions = this.$subscriptions;
      if (!subscriptions[subscriptionName]) {
        subscriptions[subscriptionName] = subscription;
      }
      return subscriptions[subscriptionName];
    },
  };
}
