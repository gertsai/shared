---
depth: standard
id: EVID-070
kind: evidence
last_modified_at: 2026-05-19T22:09:39.833163+00:00
last_modified_by: claude-code/2.1.142
links:
- target: PRD-052
  relation: informs
status: active
title: Wave 15.C — @gertsai/api-pubsub Tier-2 extracted + logger-factory + otel/moleculer adopted (Wave 15 complete)
---

## Summary

Wave 15.C — the FINAL extraction in Wave 15 cycle — extracts Pub/Sub lifecycle into new Tier-2 `@gertsai/api-pubsub@0.1.0` + adopts `@gertsai/logger-factory` + `@gertsai/otel/moleculer` inside `ApiController`. Resolves EVID-067 §Doctor Strange #5 (commented-out `detachSubscription()` was Pub/Sub Lite API — would have thrown at runtime). Solo teammate (`typescript-pro`). Workspace grows 40 → 41 packages. Cumulative Wave 15: `ApiController.class.ts` 1511 → 1178 LOC (-22%).

## Structured Fields

- **verdict**: supports
- **congruence_level**: CL3
- **evidence_type**: refactor_verification
- **linked_artifact**: PRD-052
- **summary**: Wave 15 cycle complete; api-core source -25%+; 3 new packages; 0 break; §Doctor Strange #5 closed.

## Closures (Teammate S)

### New package `@gertsai/api-pubsub@0.1.0` (Tier-2, +922 src+test LOC)

| File | LOC | Role |
|---|---|---|
| `package.json` | — | Optional peer: `@google-cloud/pubsub` + `bullmq` + `moleculer` (lazy-required) |
| Scaffold (tsconfig, tsup, vitest, README, LICENSE) | — | Mirror Wave 15.B api-queue |
| `src/types.ts` | 171 | SubscriberHandlerCtx, SubscribeHandler, SubscribeOptions, ApiControllerSubscribedTopics, SubscriptionProcessingEvents, PubSub re-export |
| `src/schema.ts` | 110 | `createSubscriberSchemaFragment` with `errorTranslator` injection |
| `src/methods.ts` | 118 | `createPubsubServiceMethods` + optional `colorize` callbacks |
| `src/lifecycle.ts` | 126 | `bootPubsubSubscriptions` + `stopPubsubSubscriptions` |
| `src/methods.test.ts` | — | 4 tests |
| `src/lifecycle.test.ts` | — | 3 tests (includes §Doctor Strange #5 closure assertion) |

### §Doctor Strange #5 resolved — DELETE + document

Per EVID-067, `stopped()` had 17 lines of commented-out `pubSub.detachSubscription(name)` code. Investigation revealed:

1. `detachSubscription` is **Pub/Sub Lite** API, NOT standard `@google-cloud/pubsub`
2. If un-commented at runtime: `TypeError: pubSub.detachSubscription is not a function`
3. Standard Pub/Sub subscriptions are server-owned; client only closes streaming-pull
4. Required behaviour (drop cached `Subscription` from `$subscriptions`) preserved verbatim in `stopPubsubSubscriptions`

**Action**: deleted dead code. Rationale documented in `packages/api-pubsub/src/lifecycle.ts` module JSDoc + README. Dedicated test asserts `$subscriptions` emptied after stop.

Future opt-in hook (emulator-recycle in tests) can be added as `stopPubsubSubscriptions(service, { onDetach })` callback without breaking public API.

### api-core changes

- `ApiController.class.ts`: **1241 → 1178 LOC** (-63 this PR). 
  - Adopted `bootPubsubSubscriptions`/`stopPubsubSubscriptions`/`createPubsubServiceMethods`/`createSubscriberSchemaFragment` from api-pubsub
  - Replaced inline traceparent IIFE (~22 LOC) with `buildTraceparent` from `@gertsai/otel/moleculer`
  - Replaced `createSimpleFallbackLogger` with `@gertsai/logger-factory.createLogger` adapter (**default-on redaction now active**)
  - Removed `_forIn` import + inline `colorts` body
  - Deleted 17 lines of commented-out §Doctor Strange #5 code
- `controller/types.ts`: **-106 LOC**. 6 Pub/Sub type body definitions removed; re-exported from `@gertsai/api-pubsub` for source-level back-compat
- `package.json`: `+@gertsai/api-pubsub`, `+@gertsai/logger-factory`, `+@gertsai/otel` deps

### `@gertsai/otel` enhancement (minor bump)

Added `buildTraceparent(input: BuildTraceparentInput): BuiltTraceparent | undefined` (~90 LOC) to `moleculer` subpath. Centralises W3C trace-header assembly previously inlined in api-core. Structural input shape (`{ requestID, id, parentID, tracing }`) — non-Moleculer hosts can use it.

+4 unit tests covering: undefined-on-falsy-tracing, W3C assembly, non-zero enforcement, dash-stripping/right-padding.

## Acceptance verification (all PASS)

| Scope | Build | Typecheck | Tests |
|---|---|---|---|
| `@gertsai/api-pubsub` (new) | ✅ ESM 4.38KB + CJS 4.68KB + DTS 11.88KB | ✅ 0 | ✅ **7/7 pass** |
| `@gertsai/otel` | ✅ buildTraceparent added | ✅ 0 | ✅ **13/13 pass** (was 9, +4 new) |
| `@gertsai/api-core` | ✅ all 4 subpaths | ✅ 0 | ✅ **284/284 pass** |
| Workspace (41 pkgs + 3 examples) | ✅ 123 successful subbuilds | ✅ **0 errors** | — |

## Surfacing barrier (resolved additively)

`@gertsai/otel/moleculer` was missing the per-action traceparent helper (pre-Wave-15.C only exported broker-level `withMoleculerTracing`). Resolved by adding `buildTraceparent` to otel — small additive change, preserves all existing behaviour, 4 new tests, both ESM+CJS+DTS outputs verified.

## Wave 15 cumulative result

| Stage | api-core LOC | ApiController.class.ts | Workspace pkgs |
|---|---|---|---|
| Pre-Wave-15 | 9,772 | 1,511 | 38 |
| Post 15.A (envelope) | ~7,800 (~-20%) | 1,511 | 39 |
| Post 15.B (queue) | ~7,300 (~-25%) | 1,241 (-18%) | 40 |
| Post 15.C (pubsub + adopt) | **~7,100** (~-27%) | **1,178** (**-22%**) | **41** |

EVID-067 target was 33% via 15.A+B+C; achieved ~27% (verbose audit-trail comments at each delegation site contribute a few hundred LOC vs the gross extracted code, preserving traceability per CLAUDE.md conventions).

## No public-API breaks

- `@gertsai/api-pubsub`: new package
- `@gertsai/otel`: minor (additive `buildTraceparent`)
- `@gertsai/api-core`: patch (back-compat preserved via re-exports + delegation)
- All ~30 api-core consumers unaffected

## Default-on redaction win

`createSimpleFallbackLogger` adoption of `@gertsai/logger-factory.createLogger` means fallback log path now benefits from default-on REDACTION_KEYS per Sprint 3.9 W-3-9-17 (ADR-009 I-17). Previously inline `console.*` had no redaction.

## Closing Wave 15

EVID-067 plan delivered:
- ✅ 15.A — Envelope extraction (EVID-068, PR #66)
- ✅ 15.B — Queue extraction + SPEC-020 (EVID-069, PR #68)
- ✅ 15.C — Pub/Sub extraction + logger-factory + otel/moleculer adoption + §Doctor Strange #5 closed (EVID-070, this PR)

3 of 5 EVID-067 §Doctor Strange observations addressed (DSO #2 = SPEC-020; DSO #5 = this PR; DSO #1 dual error-helper deferred to v1.0.0; DSO #3 runtime/node env-var leak; DSO #4 OAuth removal). DSO #3 + #4 are Wave 16+ candidates.

## Refs

- PRD-052 (target)
- EVID-067 (Wave 15 audit — §15.C + §Doctor Strange #5)
- EVID-068 (Wave 15.A precedent)
- EVID-069 (Wave 15.B precedent)
- SPEC-020 (Wave 15.B selective worker-mode contract)



