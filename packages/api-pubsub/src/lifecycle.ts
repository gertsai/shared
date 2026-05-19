// SPDX-License-Identifier: Apache-2.0
/**
 * Pub/Sub topic-subscription lifecycle for `@gertsai/api-core` services.
 *
 * Encapsulates subscription boot (resolve topic → resolve subscription →
 * attach `message` + optional event listeners) and teardown (drop the cache
 * entry). Extracted from `ApiController.generateServiceSchema()`
 * started/stopped blocks in Wave 15.C.
 *
 * ## EVID-067 §Doctor Strange #5 resolution — `detachSubscription()`
 *
 * The pre-Wave-15.C `stopped()` block contained ~17 lines of commented-out
 * code that called `subscription.detached()` + `pubSub.detachSubscription(name)`.
 * **That code was speculatively added against an API that does not exist on the
 * standard `@google-cloud/pubsub` SDK** — `detachSubscription` is a Pub/Sub
 * Lite concept; the regular `PubSub` class has no such method. Calling it
 * unguarded would have raised `TypeError: pubSub.detachSubscription is not a
 * function` at shutdown.
 *
 * Decision (PRD-052 FR-005): **delete the dead code.**
 *
 * Rationale:
 *  - Pub/Sub subscriptions in the standard SDK are server-owned; client
 *    "detach" is not a thing in the streaming-pull model. The `Subscription`
 *    object on the client is a long-lived consumer handle; closing the
 *    `MessageStream` (which happens implicitly on process exit) is the only
 *    client-side cleanup required.
 *  - The original commented code referenced a Pub/Sub Lite operation
 *    (`projects.locations.subscriptions.detach`); migrating to Pub/Sub Lite
 *    would require swapping out the entire client and is out of scope.
 *  - The actual cleanup the controller needs — dropping the cached
 *    `Subscription` instance from `$subscriptions` so a subsequent
 *    `started()` re-resolves cleanly — is preserved verbatim below.
 *
 * If a future caller needs an explicit detach hook (e.g. for unit-tests that
 * spin up an emulator-backed broker repeatedly), it can be added as an
 * optional callback on `stopPubsubSubscriptions(service, { onDetach })`.
 */

import type { Message, Subscription } from '@google-cloud/pubsub';
import _forIn from 'lodash.forin';
import type Moleculer from 'moleculer';

import type { SubscriptionSchemaFragment } from './types';

/**
 * The shape `bootPubsubSubscriptions` expects from the Moleculer service `this`
 * argument. We type only what we touch — keeps the package decoupled from
 * api-core's `CoreServiceSchema`.
 */
export type PubsubAwareService = Moleculer.Service & {
  schema: { subscriptions?: Record<string, SubscriptionSchemaFragment | unknown> };
  $subscriptions: Record<string, Subscription>;
  getSubscription: (subscriptionName: string, topicName: string) => Promise<Subscription>;
};

/**
 * Boot every registered Pub/Sub topic subscription on this service.
 *
 * For each `schema.subscriptions[<topic>]` entry, this:
 *  1. resolves the subscription via `service.getSubscription(subName, topic)`
 *     (which is provided by `createPubsubServiceMethods` mixed into the same
 *     service schema), and
 *  2. attaches the wrapped handler to `subscription.on('message', ...)`, and
 *  3. attaches any additional event handlers from the fragment's `on` block.
 *
 * Pure side-effect function — populates `service.$subscriptions` indirectly
 * via `getSubscription`.
 *
 * Mirrors the inline `_forIn(this.schema.subscriptions, ...)` block in the
 * pre-Wave-15.C `started()` handler.
 */
export function bootPubsubSubscriptions(service: PubsubAwareService): void {
  if (!service.schema.subscriptions) return;

  _forIn(service.schema.subscriptions, async (fn: unknown, name: string) => {
    const fragment = fn as SubscriptionSchemaFragment;

    const subscription: Subscription = await service.getSubscription(
      fragment.subscriptionName ?? '',
      name,
    );

    subscription.on('message', (message: Message) =>
      fragment.handler.call(service, subscription, message),
    );

    if (fragment.on) {
      Object.entries(fragment.on).forEach(([event, handler]) => {
        if (event !== 'message' && handler) {
          // @google-cloud/pubsub Subscription emits a fixed set of named events
          // (error / close / debug / newListener / removeListener); the runtime
          // is permissive, so we cast through `any` to preserve the original
          // calling convention.
          // oxlint-disable-next-line @typescript-eslint/no-explicit-any
          subscription.on(event as any, (args: unknown) =>
            // oxlint-disable-next-line @typescript-eslint/no-explicit-any
            (handler as (...a: any[]) => unknown).call(service, args),
          );
        }
      });
    }
  });
}

/**
 * Teardown all Pub/Sub topic subscriptions attached to this service.
 *
 * Drops every entry from `service.$subscriptions`. See the module-level
 * JSDoc above for why the (previously commented-out) `detachSubscription`
 * call path was deleted rather than implemented.
 */
export async function stopPubsubSubscriptions(service: PubsubAwareService): Promise<void> {
  if (!service.$subscriptions) return;

  const subss = Object.entries(service.$subscriptions);
  await Promise.all(
    subss.map(([name, subscription]) => {
      if (subscription) {
        delete service.$subscriptions[name];
      }
      // Return resolved promise to keep this awaitable + parallel-safe.
      return Promise.resolve();
    }),
  );
}
