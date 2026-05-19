// SPDX-License-Identifier: Apache-2.0
/**
 * @gertsai/api-pubsub — Google Cloud Pub/Sub topic-subscription lifecycle for
 * @gertsai/api-core.
 *
 * Tier-2 package extracted from `@gertsai/api-core/lib/controller/ApiController.class.ts`
 * in Wave 15.C (PRD-052 / EVID-067 §15.C).
 *
 * Surfaces three concerns:
 *  - **types** — `ApiControllerSubscribedTopics`, `ApiControllerSubscriptions`,
 *    `SubscribeOptions`, `SubscribeHandler`, `SubscriberHandlerCtx`,
 *    `SubscriptionProcessingEvents`, `SubscriptionSchemaFragment`.
 *  - **schema fragment** — `createSubscriberSchemaFragment(...)` builds the
 *    Moleculer-service subscription block (handler + error translator).
 *  - **service methods + lifecycle** — `createPubsubServiceMethods(...)`,
 *    `bootPubsubSubscriptions(...)`, `stopPubsubSubscriptions(...)`.
 *
 * Per PRD-052 FR-005, the previously-commented `detachSubscription` cleanup
 * code from `ApiController.stopped()` is intentionally **not** ported — see
 * `lifecycle.ts` module JSDoc for the full rationale.
 *
 * @packageDocumentation
 */

// --- Types ---
export type {
  ApiControllerSubscribedTopics,
  ApiControllerSubscriptions,
  CtxLoggerType,
  PubSub,
  SubscribeHandler,
  SubscribeOptions,
  SubscriberCallFunction,
  SubscriberHandlerCtx,
  SubscriptionProcessingEvents,
  SubscriptionSchemaFragment,
} from './types';

// --- Schema fragment builder ---
export {
  createSubscriberSchemaFragment,
  type CreateSubscriberSchemaFragmentOptions,
  type SubscriberErrorTranslator,
} from './schema';

// --- Service methods factory ---
export {
  createPubsubServiceMethods,
  type CreatePubsubServiceMethodsOptions,
  type LogColorizer,
  type PubsubServiceMethods,
} from './methods';

// --- Subscription lifecycle ---
export {
  bootPubsubSubscriptions,
  stopPubsubSubscriptions,
  type PubsubAwareService,
} from './lifecycle';
