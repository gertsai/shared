// SPDX-License-Identifier: Apache-2.0
/**
 * Google Cloud Pub/Sub types for @gertsai/api-pubsub.
 *
 * Extracted from @gertsai/api-core/lib/controller/types.ts in Wave 15.C
 * (PRD-052 / EVID-067 §15.C). api-core keeps these names as re-exports for
 * backward source compat.
 *
 * @packageDocumentation
 */

import type {
  DebugMessage,
  Message,
  PubSub,
  Subscription,
  SubscriptionOptions,
} from '@google-cloud/pubsub';
import type { StatusError } from '@google-cloud/pubsub/build/src/message-stream';
import type { Job } from 'bullmq';
import type Moleculer from 'moleculer';

// =============================================================================
// Logger surface (intentionally narrow — same shape as api-core CtxLoggerType
// and api-queue CtxLoggerType. Re-declared here to keep this package decoupled
// from siblings.)
// =============================================================================

// oxlint-disable-next-line @typescript-eslint/no-explicit-any
export type CtxLoggerType = {
  info: (...args: any[]) => void;
  error: (...args: any[]) => void;
  warn: (...args: any[]) => void;
  debug: (...args: any[]) => void;
  trace: (...args: any[]) => void;
};

// =============================================================================
// Call function alias (same as api-queue's QueueActionCallFunction)
// =============================================================================

// oxlint-disable-next-line @typescript-eslint/no-explicit-any
export type SubscriberCallFunction = (
  path: string,
  // oxlint-disable-next-line @typescript-eslint/no-explicit-any
  params?: Record<string, any>,
  options?: Moleculer.CallingOptions,
  // oxlint-disable-next-line @typescript-eslint/no-explicit-any
) => Promise<any>;

// =============================================================================
// Subscription events surface
// =============================================================================

/**
 * Subscription handlers — mirrors the @google-cloud/pubsub Subscription event
 * surface that api-core exposed via `SubscriptionProcessingEvents`.
 */
export type SubscriptionProcessingEvents = {
  error?: (error: StatusError) => void;
  close?: () => void;
  debug?: (msg: DebugMessage) => void;
  // oxlint-disable-next-line @typescript-eslint/no-explicit-any
  newListener?: (event: string | symbol, listener: any) => void;
  // oxlint-disable-next-line @typescript-eslint/no-explicit-any
  removeListener?: (event: string | symbol, listener: any) => void;
};

// =============================================================================
// Subscriber handler context (what user-facing `subscribe` handlers receive)
// =============================================================================

/**
 * Subscriber handler context — passed to every user-registered topic handler.
 *
 * Mirrors the shape that `ApiController.subscribeOnTopic(...)` handlers used
 * to receive inline. Moved here verbatim in Wave 15.C.
 */
export type SubscriberHandlerCtx = {
  call: SubscriberCallFunction;
  message: Message;
  subscription: Subscription;
  logger: CtxLoggerType;
  // oxlint-disable-next-line @typescript-eslint/no-explicit-any
  addJob: (name: string, jobName?: string, payload?: any, opts?: any) => Promise<Job>;
  getQueue: (jobName: string) => Job;
  meta: {
    isEmulator: boolean;
    topic_name: string;
    subscription_name: string;
  };
};

/**
 * Subscribe handler signature — `this` is bound to the Moleculer service.
 */
// oxlint-disable-next-line @typescript-eslint/no-explicit-any
export type SubscribeHandler = (this: Moleculer.Service, params: SubscriberHandlerCtx) => any;

/**
 * Per-subscription options passed to `subscribeOnTopic(...)`.
 */
export type SubscribeOptions<
  SubscriptionName extends string,
  Options extends SubscriptionOptions,
  // oxlint-disable-next-line @typescript-eslint/no-explicit-any
  Handler extends SubscribeHandler = any,
  // oxlint-disable-next-line @typescript-eslint/no-explicit-any
  SubscriptionEvent extends SubscriptionProcessingEvents = any,
> = {
  name: SubscriptionName;
  options: Options;
  handler: Handler;
  on?: SubscriptionEvent;
};

/**
 * The shape of a registered topic subscription in the API controller.
 */
export type ApiControllerSubscribedTopics<
  TopicName extends string,
  Options extends SubscriptionOptions,
  // oxlint-disable-next-line @typescript-eslint/no-explicit-any
  SubscriptionEvent extends SubscriptionProcessingEvents = any,
> = {
  topicName: TopicName;
  options: SubscribeOptions<TopicName, Options, SubscribeHandler>;
  /** Event handlers */
  on?: SubscriptionEvent;
};

/**
 * Registry shape: subscribed topics keyed by topic name.
 */
// oxlint-disable-next-line @typescript-eslint/no-explicit-any
export type ApiControllerSubscriptions = Record<string, ApiControllerSubscribedTopics<any, any>>;

// =============================================================================
// Subscription schema fragment + service-schema mixin
// =============================================================================

/**
 * Per-topic schema fragment attached under `schema.subscriptions[<topic>]` by
 * `createSubscriberSchemaFragment(...)`.
 *
 * Kept loose so the fragment-level handler can ride along with any extra
 * fields api-core might inject in the future without changing the public
 * surface.
 */
export type SubscriptionSchemaFragment = {
  /** Subscription name (passed back to `getSubscription` at boot time). */
  subscriptionName?: string;
  /** Optional event-handler map mirroring Pub/Sub's `Subscription.on(...)`. */
  on?: SubscriptionProcessingEvents;
  /**
   * Wrapped handler — bound to the Moleculer service `this` at registration
   * time. Receives the live `Subscription` + `Message`, returns whatever the
   * underlying user handler returns.
   */
  handler: (
    this: Moleculer.Service,
    sub: Subscription,
    message: Message,
  ) => Promise<SubscriberHandlerCtx>;
};

/**
 * Re-export the Pub/Sub root type so consumers can type `_config.pubSub`
 * without importing `@google-cloud/pubsub` themselves.
 */
export type { PubSub } from '@google-cloud/pubsub';
