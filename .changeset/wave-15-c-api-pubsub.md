---
'@gertsai/api-pubsub': minor
'@gertsai/api-core': patch
'@gertsai/otel': minor
---

Wave 15.C — Extract Pub/Sub lifecycle to new Tier-2 + adopt logger-factory + otel/moleculer. **Completes Wave 15 cycle** per EVID-067 §15.C.

**Final Wave 15 cumulative result**: `ApiController.class.ts` shrinks **1511 → 1178 LOC** (-333, -22% from baseline). api-core source down ~25-30% overall after 15.A+B+C. Workspace **38 → 41 packages**.

**New package** `@gertsai/api-pubsub@0.1.0` (Tier-2):
- Optional peer: `@google-cloud/pubsub` + `bullmq` (lazy-required)
- 4 src files + 2 test files (+922 total LOC):
  - `types.ts` (171) — SubscriberHandlerCtx, SubscribeHandler, SubscribeOptions, ApiControllerSubscribedTopics, SubscriptionProcessingEvents
  - `schema.ts` (110) — `createSubscriberSchemaFragment` with `errorTranslator` injection (preserves api-core APIError-scrub semantics outside this package)
  - `methods.ts` (118) — `createPubsubServiceMethods` with optional `colorize` callbacks (keeps colorts in api-core)
  - `lifecycle.ts` (126) — `bootPubsubSubscriptions` + `stopPubsubSubscriptions`; module JSDoc documents §Doctor Strange #5 resolution
- 7 tests pass (4 methods + 3 lifecycle including §Doctor Strange #5 closure assertion)

**§Doctor Strange #5 resolved — DELETE + document**:

Per EVID-067 §Doctor Strange #5, `stopped()` had 17 lines of commented-out `pubSub.detachSubscription(name)` code. Investigation revealed:
- `detachSubscription` is **Pub/Sub Lite** API, NOT standard `@google-cloud/pubsub`
- If un-commented at runtime: `TypeError: pubSub.detachSubscription is not a function`
- Standard Pub/Sub subscriptions are server-owned; client only closes streaming-pull
- Required behaviour (drop cached `Subscription` from `$subscriptions`) preserved in `stopPubsubSubscriptions`

Deleted the dead code. Future opt-in hook (e.g. emulator-recycle) can be added as `stopPubsubSubscriptions(service, { onDetach })` callback without breaking the public API. Closure rationale documented verbatim in `packages/api-pubsub/src/lifecycle.ts` module JSDoc + README. Dedicated `lifecycle.test.ts` test asserts `$subscriptions` is emptied.

**api-core changes**:
- `ApiController.class.ts`: 1241 → **1178 LOC** (-63 this PR). Adopted `bootPubsubSubscriptions`/`stopPubsubSubscriptions`/`createPubsubServiceMethods`/`createSubscriberSchemaFragment` from api-pubsub. Replaced inline traceparent IIFE (~22 LOC) with `buildTraceparent` from `@gertsai/otel/moleculer`. Replaced `createSimpleFallbackLogger` with `@gertsai/logger-factory.createLogger` adapter (**default-on redaction now active for fallback logs**). Removed `_forIn` import + inline `colorts` body. Deleted 17 lines of commented-out detached-subscription code per §Doctor Strange #5.
- `controller/types.ts`: **-106 LOC**. Removed 6 Pub/Sub type body definitions; re-exported from `@gertsai/api-pubsub` for source-level back-compat.
- `package.json`: `+@gertsai/api-pubsub`, `+@gertsai/logger-factory`, `+@gertsai/otel` deps.

**`@gertsai/otel` enhancement** (minor bump):
- Added `buildTraceparent(input: BuildTraceparentInput): BuiltTraceparent | undefined` to `moleculer` subpath (~90 LOC). Centralises W3C trace-header assembly. Structural input shape (`{ requestID, id, parentID, tracing }`) — non-Moleculer hosts can use it too.
- +4 unit tests (undefined-on-falsy-tracing, W3C assembly, non-zero enforcement, dash-stripping/right-padding).

**Behaviour**: zero change for users not using Pub/Sub. All existing `ApiController.subscribePubsub()` / topic registration / `stopped()` lifecycle hook work identically.

**Tests**: 284/284 api-core pass + 7 new api-pubsub tests + 13/13 otel pass (was 9, +4 new for buildTraceparent). Workspace typecheck 0 errors across 41 packages + 3 example apps (svelte-check 1080 files / 0 errors).

**Workspace size**: 40 packages + 3 examples → **41 packages + 3 examples**.

**Surfacing barrier**: `@gertsai/otel/moleculer` was missing the per-action traceparent helper (pre-Wave-15.C only exported broker-level `withMoleculerTracing`). Resolved additively by adding `buildTraceparent` to otel — small, fully tested, preserves all existing behaviour.

**After Wave 15.A+B+C**: api-core surfaces cleaned, three new packages give consumers granular dependency control. v1.0.0 prep stronger. Total ~5.5d effort delivered.

Refs: PRD-052, EVID-067 (Wave 15 audit), EVID-068 (15.A), EVID-069 (15.B), SPEC-020 (selective worker-mode from 15.B).
