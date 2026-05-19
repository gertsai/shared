# @gertsai/api-pubsub

Tier-2 Google Cloud Pub/Sub topic-subscription lifecycle for `@gertsai/api-core` services.

Extracted from `@gertsai/api-core/lib/controller/ApiController.class.ts` in
Wave 15.C (PRD-052 / EVID-067 §15.C).

## What's inside

- **Types** — `ApiControllerSubscribedTopics`, `ApiControllerSubscriptions`,
  `SubscribeOptions`, `SubscribeHandler`, `SubscriberHandlerCtx`,
  `SubscriptionProcessingEvents`, `SubscriptionSchemaFragment`,
  `CtxLoggerType`, `SubscriberCallFunction`.
- **`createSubscriberSchemaFragment(subscription, opts)`** — pure function
  that builds the Moleculer service-schema subscription block (wrapped
  handler with error translator). Accepts an `errorTranslator` so api-core
  can wire its `APIError` scrub semantics back in.
- **`createPubsubServiceMethods(config)`** — returns the `getSubscription`
  method that Moleculer mixes into the service instance. Only emits a method
  when `config.pubSub` is supplied. Optional `colorize` hooks let api-core
  keep its `colorts` formatting without this package taking the dep.
- **`bootPubsubSubscriptions(service)`** — iterates `service.schema.subscriptions`,
  resolves each topic + subscription via `service.getSubscription(...)`,
  attaches the wrapped `message` handler + any extra event handlers.
- **`stopPubsubSubscriptions(service)`** — drops every entry from
  `service.$subscriptions`. See **EVID-067 §Doctor Strange #5** below.

## EVID-067 §Doctor Strange #5 — disabled `detachSubscription()` resolution

Pre-extraction `ApiController.stopped()` carried ~17 lines of commented-out
code that called `subscription.detached()` + `pubSub.detachSubscription(name)`.

**That code referenced an API that does not exist on the standard
`@google-cloud/pubsub` client** — `detachSubscription` is a Pub/Sub **Lite**
operation; the regular `PubSub` class does not expose it. If the lines had
ever been un-commented, shutdown would have thrown `TypeError:
pubSub.detachSubscription is not a function`.

**Decision (PRD-052 FR-005): the dead code is deleted, not ported.**

Why:
- Standard Pub/Sub subscriptions are server-owned; the client has no
  explicit "detach" — closing the streaming-pull connection (which happens
  automatically when the process exits) is the only client-side cleanup.
- The original snippet was a stale Pub/Sub Lite vestige; migrating to
  Pub/Sub Lite is a multi-package change out of scope here.
- The required behaviour — dropping the cached `Subscription` so a
  subsequent `started()` resolves cleanly — is preserved in
  `stopPubsubSubscriptions(...)`.

If a future caller needs an explicit detach hook (e.g. for emulator-backed
integration tests that recycle subscriptions), it can be added as an opt-in
callback on `stopPubsubSubscriptions(service, { onDetach })` without
breaking the public API.

## Origin

Extracted from `@gertsai/api-core` in Wave 15.C.
`@gertsai/api-core` keeps a back-compat re-export shim at
`lib/controller/types.ts` for the type surface.

## License

Apache-2.0
