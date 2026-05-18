# @gertsai/core

## 0.5.0

### Minor Changes

- 7109c49: Wave 13.D+E — close 14 MEDIUM/LOW findings from EVID-059 across tenant-config + session + query + agent domains.

  **Wave 13.D — Teammate O (tenant-config + session polish)**:

  - **FR-D-1** (M, `tenant-config.ts:1492`): Zod `chunkingStrategy` enum now includes `'hierarchical'` matching the TS union 1:1.
  - **FR-D-2** (M, `types.ts:316-321`): `createGraphRAGSettings` factory now clamps `maxHops ∈ [1,5]`, `topK ∈ [1,100]`, `communityLevel ∈ [0,3]` matching `isGraphRAGSettings` ranges. Non-finite inputs fall back to defaults.
  - **FR-D-3** (M, `tenant-config.ts:2478`): Renamed `calculateConfigHash` → `configCacheKey` to disclaim cryptographic intent (FNV-like fold used for cache invalidation only). `calculateConfigHash` preserved as `@deprecated` alias for back-compat.
  - **FR-D-4** (M, `tenant-config.ts:2578`): `sanitizeTenantConfig` rewritten as allowlist via `pickAllowlist(source, KEYS)` helper. Three allowlists (`SAFE_LLM_KEYS`, `SAFE_EMBEDDING_KEYS`, `SAFE_RERANKER_KEYS`) `satisfies ReadonlyArray<keyof Sanitized*Config>` so TS catches type drift. Future sensitive fields excluded by default.
  - **FR-D-5** (L, `tenant-config.ts:2245,2248,2371,2375,2380`): 5 `DEFAULT_TENANT_CONFIG.agentReasoning!` non-null assertions removed. Extracted `DEFAULT_AGENT_REASONING` as top-level export; merge sites use `?? DEFAULT_AGENT_REASONING` fallback.
  - **FR-D-6** (M, `session-context.ts:301`): `throwIfAborted` 3-branch normaliser — Error instances rethrown as-is; undefined/null wrapped in `new Error('Session aborted')`; other non-Error values coerced via `String(reason)`. Downstream `e instanceof Error` always narrows.
  - **FR-D-7** (M, `session-context.ts:365`): `fromJSON` adds new exported `isSerializedSessionContext` guard performing JSON-friendly shape check (avoids `isRequestMeta` which requires Date instance post-`JSON.parse`). Throws typed `TypeError` with clear message on mismatch.

  **Wave 13.E — Teammate P (query + agent type-system tightening)**:

  - **FR-E-1** (M, `executor.ts:328,338,352,362` + `router.ts:203`): Replaced `IQueryExecutor<any, any>` with new exported `AnyQueryExecutor = IQueryExecutor<QueryRequest, unknown, unknown>` alias. Callers who got `any` back now get `unknown` — forces narrowing at use site (desired invariant). No consumer breakage; alias re-exported from `query/index.ts`.
  - **FR-E-2** (M, `types.ts:querySuccess/queryPartial`): `confidence` clamped `[0,1]` via `Math.max(0, Math.min(1, ...))` + `Number.isFinite` guard. `durationMs >= 0` floor. `queryFailure` has no such fields per interface — no-op as designed (flagged in EVID-059 audit as PRD misread).
  - **FR-E-3** (M, `registry.ts:511-516` + 4 sibling factories): Spread-after-literal pattern fixed across `createNLQuery/createGraphQuery/createVectorQuery/createRAGQuery`. `...options` now first; discriminator + required fields second. Hostile caller passing `options.type = 'graph'` to `createNLQuery` now correctly gets `type: 'nl'`.
  - **FR-E-4** (L, `router.ts:101-105`): `LATENCY_ORDER = Object.freeze({fast:0, medium:1, slow:2})` hoisted to module const (avoids per-comparator allocation in routing hot paths).
  - **FR-E-5** (L, `router.ts:386-396`): `asTool()` now returns typed `QueryRouterAsTool { name, description, router }` interface (re-exported from `query/index.ts`). Consumers can `tool.router` / `tool.name` without casts.
  - **FR-E-6** (M+L, `agent.ts:85,153`): `run(input: string | unknown, ...)` → `run(input: unknown, ...)` (decorative `string |` removed). JSDoc on `tools?: readonly ITool[]` explains `readonly` only freezes array shell, not element fields.

  **Tests**: 61 new regression tests across `wave-13-d-fixes.test.ts` (31), `query.test.ts` (28 new), `agent.test.ts` (2 updated). Total: 1244 pass (was 1199 before Wave 13.D+E), 53 skipped, 0 fail.

  **Public API additions** (warrants minor bump): `configCacheKey`, `DEFAULT_AGENT_REASONING`, `isSerializedSessionContext`, `AnyQueryExecutor`, `QueryRouterAsTool`. All additive; no removals.

  **Behaviour break**: `createGraphRAGSettings` now clamps values that previously violated `isGraphRAGSettings` invariants — those outputs were already rejected downstream by the guard, so this tightens correctness without breaking valid use.

  After Wave 13.A+B+C+D+E, EVID-059's 2 CRITs + 11 HIGHs + 6 LLM MED/LOW + 14 query/session/tenant-config/agent MED/LOW = **33 findings closed**.

  Refs: PRD-048, EVID-059, EVID-060/061/065 (13.A/B/C precedents).

### Patch Changes

- 0f71f1d: Wave 13.C — close 6 MEDIUM/LOW LLM findings from EVID-059 in `@gertsai/core`.

  - **FR-001** (M, base.ts:154): `this.stop = config.stop` (when array) was caller-mutable post-construction. Fix: defensive `[...config.stop]` copy.
  - **FR-002** (M, routing.ts:416-417): `bedrock` silently mapped to `'google'` (the existing comment admitted this was wrong). Audited `llm-info` `AI_PROVIDER_TYPE` enum — no `'aws'`/`'bedrock'` value exists. Fix: replaced silent misclassification with explicit `throw new Error('Bedrock provider mapping not yet implemented...')`. Callers passing `provider: 'bedrock'` to `listCandidates`/`selectModel`/`getFallbackModel` now error loudly. Default construction unaffected (`ModelRouter` constructor only iterates openai/anthropic/gemini).
  - **FR-003** (L, routing.ts:152,162): silent `} catch {}` in `createWithFallback` masked all errors. Fix: log at `console.debug` level.
  - **FR-004** (L, anthropic.ts/openai.ts/gemini.ts): error messages interpolated raw `response.text()` content. Fix: per-provider `truncateForError(text, 500)` helper before interpolation.
  - **FR-005** (L, openai.ts:199,210): `response.choices[0]?.message?.content ?? ''` masked "no choices returned" failure as empty content. Fix: explicit check + `throw new Error('OpenAI returned no choices in response')` when missing/empty.

  **4 new regression tests** added in `llm.test.ts`. Total: 1199 pass (was 1195), 53 skipped, 0 fail.

  **Behaviour break (FR-002)**: callers explicitly passing `provider: 'bedrock'` now error instead of receiving silently-misclassified google candidates. This was a latent bug — the previous behaviour was wrong. No known consumer relies on it.

  Refs: PRD-047, EVID-059 (Wave 12.D2 audit), EVID-060 (Wave 13.A precedent), EVID-061 (Wave 13.B precedent).

## 0.4.1

### Patch Changes

- 739b3de: Wave 14.1+14.2 — LRU primitive consolidation per EVID-057.

  **Wave 14.1 — Cross-package consolidation (Teammate K).**

  EVID-057 surfaced 4 packages implementing the same insertion-order Map LRU pattern with identical eviction logic. Consolidated into `@gertsai/utils/lru` subpath:

  - **NEW**: `@gertsai/utils/lru` exports `LruMap<K,V>` (no TTL, `has()` non-touching) + `LruTtlMap<K,V>` (with TTL, `has()` touching — preserves Wave 7.4 auth-openfga semantics). Both classes support back-compat dual constructor signature: positional (`new LruMap(100)` legacy collection-style) OR options object (`new LruMap({ maxSize })`).
  - **NEW**: `LruMap.peek(key)` non-touching get for observability without perturbing eviction order.

  Migrated 4 consumers:

  - `@gertsai/auth-openfga/src/internal/lru-ttl-map.ts` → thin re-export shim from `@gertsai/utils/lru` (-127 LOC, public API preserved)
  - `@gertsai/rest-request-manager/src/circuit-breaker.ts` `hosts: Map<...>` → `LruMap<string, HostState>` (ADR-009 Amendment 1.2.1 `maxHosts: 1000` preserved). Used new `peek()` for `getState()` to avoid perturbing LRU order during observability.
  - `@gertsai/collection/src/utils/memoize.ts` `LRUCache<K,V>` → re-export shim `import { LruMap as LRUCache } from '@gertsai/utils/lru'` (-73 LOC, named export + `instanceof` semantics preserved)
  - `@gertsai/api-rlr/src/adapters/ResilientRedisAdapter.ts` private `LRUCache<K,V>` → consumes `LruMap` directly (-31 LOC, was module-private)

  **Wave 14.2 — Same-package consolidation (Teammate L).**

  - `@gertsai/core/src/deny-ledger/providers/memory.ts MemoryDenyLedger` previously inlined doubly-linked-list LRU logic that exactly duplicated `core/lru-cache.ts`. Refactored to consume the local `LRUCache<DenyEntry>` primitive (-63 LOC).
  - 3 behavioural deltas surfaced + preserved:
    1. Stats granularity kept at ledger level (not per-`get()`-probe level — `isDenied()` probes up to 4 lookup keys/call)
    2. TTL source of truth remains `DenyEntry.expiresAt`; `LRUCache` used without TTL
    3. `byId` secondary index synced via `onEvict` callback with race-guarded `byId.get(id) === entry` check

  **Net LOC**: 188 insertions / 434 deletions = **-246 net** across 6 packages (consumer reductions dominate). Source-only (excluding tests): -227 LOC consumers + ~+333 LOC kernel = +106 net source, but single source of truth means future bug fixes (CWE-770 hardening, etc.) land once.

  **Tests**: +38 new tests for kernel (20 LruMap + 18 LruTtlMap parity port). 1767 tests pass across the 5 packages (no regressions in 1195 core / 524 utils / 145 auth-openfga / 28 rest-rm / 772 collection / 298 api-rlr).

  **No public-API breaks**: utils minor bump (new exports added); 5 consumer packages patch bumps only. `auth-openfga LruTtlMap` import path unchanged via shim; `collection LRUCache` named export preserved; `rest-request-manager CircuitBreaker` external API unchanged; `api-rlr LRUCache` was module-private.

  Refs: PRD-044, EVID-057 (Wave 12.F audit source), ADR-009 Amendment 1.2.1, RFC-007.

## 0.4.0

### Minor Changes

- f0f6f26: Wave 13.A — close 2 CRITICALs + 3 HIGHs from EVID-059 (Wave 12.D2 deep audit).

  **CRIT-1 (cross-tenant state leakage) — BREAKING for multi-turn extended thinking.**
  `AnthropicProvider.previousThinkingBlocks` instance-level mutable state replayed
  one tenant's chain-of-thought into the next tenant's prompt when the provider
  was pooled. `ModelRouter`'s module-level singleton at `routing.ts:600-604`
  actively encouraged pooling, making this a production cross-tenant leak.

  Fix: removed the instance field entirely. Thinking blocks are now caller-
  supplied per call via `options.metadata[ANTHROPIC_PREVIOUS_THINKING_BLOCKS_KEY]`
  (exported `as const` string key). Added a defensive narrowing helper
  `extractPreviousThinkingBlocks(options)` that filters to entries whose `type`
  is exactly `'thinking'` or `'redacted_thinking'`. `formatMessagesForAnthropic`
  now takes `previousThinkingBlocks` as a parameter rather than reading instance
  state.

  **Migration**: callers using multi-turn extended-thinking with Anthropic
  providers MUST thread previous thinking blocks themselves via the metadata
  channel. Single-turn callers are unaffected. The prior auto-cache was the leak —
  removing it is the security fix.

  **CRIT-2 (prototype pollution / unsafe dispatch).** `BaseLLM.handleToolExecution`
  flowed LLM-controlled `toolName` straight to `availableFunctions[toolName]` with
  no `hasOwnProperty` guard (CWE-1321). Fix: 3-prong guard before any dispatch:

  1. `typeof toolName === 'string'` + non-empty
  2. `Object.prototype.hasOwnProperty.call(availableFunctions, toolName)` —
     blocks `__proto__`, `constructor`, `toString`, `hasOwnProperty`
  3. `typeof fn === 'function'` — rejects own-properties holding non-function values

  Both `console.warn`/`console.error` calls converted to structured logging
  (user-controlled `toolName` now a structured field, not part of format string —
  CWE-117 protection).

  **H-9 (Gemini URL path injection).** `GeminiProvider.makeRequest` interpolated
  `this.model` into URL path without `encodeURIComponent`. Model name containing
  `/`, `?`, `#`, `:` could reroute the request + leak API key. Fix: wrap
  `this.model` with `encodeURIComponent` before path interpolation.

  **H-3 (createRequestMeta spread-after-literal).** Replaced
  `timeout: options.timeout ?? DEFAULT_TIMEOUT, ...options` with destructure-then-
  spread pattern so `{ timeout: undefined }` no longer silently overrides the
  default. Scanned `packages/core/src/session/` — only 1 affected factory
  (`createRequestMeta`); 3 other patterns reviewed and confirmed safe.

  **H-5 (`$switchOperator` unauthenticated privilege swap).** Method on
  `GraphRAGSessionContext` mutated `operator.id` + `operator.type` with no tenant
  check, no audit event, no auth gate. `grep` confirmed zero external callers
  across `packages/` + `examples/`. Deleted the method outright per EVID-059
  guidance "Cleanest if no external consumer uses it". Callers needing legitimate
  operator-switching should use `@gertsai/session.Session.$switchOperator` which
  already throws `SessionDestroyedError` and emits `operator-switched` events.

  **Tests**: 10 new tests across `llm.test.ts` (8 covering CRIT-1, CRIT-2, H-9) +
  `session-types.test.ts` (7 covering H-3 regression) + `session-context.test.ts`
  (3 pinning the H-5 removal). 1154 tests pass, 0 fail.

  Refs: PRD-043, EVID-059 (Wave 12.D2 audit), EVID-058 (Wave 12.G aggregate).

- 7bc148b: Wave 13.B — close 8 remaining HIGHs from EVID-059 (query + session + LLM).

  **Query domain (Teammate G):**

  - **H-1** — `QueryRouter.execute` + `.stream` blindly spread `result.metadata.custom as object`. Caller-controlled value could be a string (→ char-indexed spread `{0:'s',1:'o',...}`) or contain an own `__proto__` key (post `JSON.parse`). Fix: new `safeSpreadCustom(custom)` helper narrows with `typeof === 'object' && !== null` + drops `__proto__`/`constructor`/`prototype` keys. Both call sites swapped.
  - **H-2** — `safeExecute` swallowed all non-`QueryError` exceptions as generic `EXECUTION_FAILED retryable:false`. Programmer errors (`TypeError`/`RangeError`) were indistinguishable from transient network errors. Fix: typed catch branch propagates `cause.name`/`cause.message`, flags `programmerError: true` for TypeError/RangeError/ReferenceError/SyntaxError/URIError/EvalError, translates AbortError → CANCELLED (retryable=false) + TimeoutError → TIMEOUT (retryable=true).

  **Session domain (Teammate G):**

  - **H-4** — `GraphRAGSessionContext.updateSettings` mutated `Readonly<GraphRAGSettings>` private field via `Object.assign`. Callers who captured a reference via the getter saw their "read-only" snapshot change underneath. Fix: drop `readonly` on the field + freeze initial value in constructor + `updateSettings` reassigns brand-new `Object.freeze({...current, ...settings})`. Captured snapshots stay immutable.
  - **H-6** — `mergeTenantConfigWithDefaults` + `applyTenantConfigUpdate` deep-spread caller-controlled config with no key sanitisation. If config came from `JSON.parse` with own `__proto__`, propagated as own property on merged result. `isTenantConfig` only checked 2 keys + would pass arbitrary extras. Fix: new module-private `safeSpread<T>(...sources)` helper drops `__proto__`/`constructor`/`prototype` from every nested section. Both merge functions rewritten to route through `safeSpread`. Preserves `exactOptionalPropertyTypes` discipline.

  **LLM domain (Teammate H):**

  - **H-7** — Module-level `defaultRouter` singleton ignored subsequent config. `getDefaultRouter(config)` only honoured `config` on first call. Multi-tenant servers initialising with tenant-specific event buses lost telemetry routing for all but the first tenant. Fix: cache first `RouterConfig`; subsequent calls with `config !== undefined` deep-compare against cached (provider, costOptimization, eventBus by identity, fallbacks structurally); mismatch throws with guidance pointing to `new ModelRouter(...)`. Added `__resetDefaultRouterForTests` (test-only) for isolation.
  - **H-8** — `OpenAIProvider.isO1Model` used `.includes('o1') || .includes('o3')` substring check. False positives: `gpt-4o-1106`, `gpt-4o-3-mini`, `gpto1-eval` silently lost temperature/tools/stop words. Fix: anchored regex `/^(?:openai\/)?o[13](?:-|$)/` — true positives (`o1`, `o1-mini`, `o1-preview`, `o3`, `o3-mini`, `openai/o1`) classify correctly; false positives no longer match.
  - **H-10** — `JSON.parse(toolCall.function.arguments)` unwrapped in `OpenAIProvider.call` + `AnthropicProvider.call`. Malformed args from model threw `SyntaxError` mid-loop, leaked unparsed args via `error.message`, aborted subsequent tool calls. Fix: try/catch wrap; emit `llm.tool.failed` event; continue with remaining tool calls. Tightened parsed-shape contract — plain object only (null/arrays/primitives rejected with informative message).
  - **H-11** — Both `AnthropicProvider` and `GeminiProvider` silently injected a fabricated `{role:'user', content:'Hello'}` when conversation transformation yielded zero messages or started with non-user role. Caller's audit trail mismatched actual prompt. Fix: replace fabrication with `throw new Error('Empty or assistant-led conversation: caller must supply at least one user message as the first turn')`. Both providers.

  **Tests added: 38 new tests (24 LLM + 14 query/session). Total: 1195 pass, 53 skipped, 0 fail.**

  All 8 Wave 13.A tests (CRIT-1 × 3, CRIT-2 × 3, H-9 × 2) continue passing.

  After Wave 13.A + 13.B, EVID-059's 11 HIGHs are closed (3 in 13.A, 8 in 13.B). 14 MED + 8 LOW deferred to Wave 13.C-E backlog.

  Refs: PRD-043 (Wave 13.A precedent), EVID-059 (audit source), EVID-060 (13.A), EVID-061 (this fix).

## 0.3.0

### Minor Changes

- 05258e5: Wave 12.D-fix Teammate B — close 4 HIGH findings per PRD-036.

  **FR-008 (HIGH security CWE-918) — LLM provider baseUrl SSRF validation**

  OpenAI/Anthropic/Gemini provider constructors previously accepted `baseUrl?: string` without validation. Authorization Bearer headers were sent to whatever URL — attacker-controlled `baseUrl` exfiltrated platform API keys.

  Fix: new shared `validateBaseUrl(baseUrl, defaultBaseUrl, providerName)` in `packages/core/src/llm/base-url-validator.ts`. Rejects non-`https://` URLs unless host is `localhost`/`127.0.0.1`/`::1`. Non-default https URLs emit `console.warn` so operators see overrides.

  **FR-015 (HIGH type) — `IAgent.run` signature**

  `run(input: string | any, ...)` collapsed to `any`. Changed to `string | unknown` — caller must narrow via `typeof`.

  **FR-016 (HIGH type) — `AgentFactoryConfig` opaque interfaces**

  Replaced `model: any` + `tools?: any[]` with structural interfaces `IBaseLLM` + `ITool` defined inline in `agent.ts` (avoid circular type imports). Existing concrete LLM/Tool classes satisfy structurally.

  **FR-023 (HIGH logic) — HookExecutor 3-part**

  - Replaced `JSON.parse(JSON.stringify(value))` with `structuredClone(value)` (Node 17+, available on Node 22+). Now preserves Date/Map/Set/RegExp/BigInt; fallback to shallow `{...value}` on cycles.
  - Added `blocking?: boolean` to HookMetadata. `shouldUseBackground()` now: `if (hook.blocking === true) return false;` — blocking hooks NEVER go to background regardless of workflow-level `runInBackground`.
  - `BackgroundQueue.drain()` replaced `setTimeout(check, 10)` polling with `Deferred<void>` resolved when queue + running reach zero.

  **Tests:** +26 new tests (14 baseurl-validator, 5 agent type-tests, 7 HookExecutor FR-023). 1136/1110 pass.

  Refs: PRD-036, EVID-051 (S-3, T-4, T-5, L-7).

## 0.2.0

### Minor Changes

- 0755c6d: Initial OSS release of `@gertsai/*` first-wave packages (v0.1.0).

  Extracted with preserved git history from internal `gertsai_codex` monorepo
  into the public `gertsai/shared` repository, под Apache 2.0. 14 packages
  across 5 tiers per [ADR-009][adr-009] + [ADR-011][adr-011]:

  - **Tier 1** (zero internal deps): `fsm`, `fetch`, `collection`, `llm-costs`,
    `utils`, `m9s-cache`, `ws-rpc`
  - **Tier 2** (depends on Tier 1): `di` (→ utils), `flux` (→ collection)
  - **Tier 3**: `core` (→ llm-costs), `hsm`
  - **Tier 4**: `auth-openfga` (→ core), `api-core` (→ core + auth-openfga)
  - **Tier 5** (per ADR-011): `api-rlr` (→ api-core; database-agnostic
    `PgClient` interface — drop-in compat с Prisma/Drizzle/raw-pg)

  Highlights:

  - **`@gertsai/api-rlr`**: production-grade rate limit middleware для
    Moleculer.js. Sliding-Window + GCRA через Redis Lua scripts; PostgreSQL
    adapter accepts any client structurally compatible с Prisma's
    `$queryRawUnsafe` / `$executeRawUnsafe` / `$transaction` surface.
  - **`@gertsai/api-core`**: unified `APIError`/`ResponseCode` (RFC-053),
    `ApiController`, Moleculer mixins, OpenAPI merge.
  - **`@gertsai/core`**: identity, errors, response envelope, tracing primitives.
  - **`@gertsai/fsm`** / **`@gertsai/hsm`**: zero-dep finite & hierarchical state
    machines.

  See individual package READMEs for install + quickstart.

  [adr-009]: https://github.com/gertsai/shared/blob/main/.forgeplan/adrs/ADR-009-trivexdev-as-single-oss-umbrella-for-shared-packages-and-fluxis.md
  [adr-011]: https://github.com/gertsai/shared/blob/main/.forgeplan/adrs/ADR-011-first-wave-extension-to-14-packages-add-api-rlr-refines-adr-009.md

- 1d1e833: Sprint 2 — api-core decomposition Phase A (per ADR-003 + SPEC-002).

  **`@gertsai/api-core` v0.2.0** — three subpath exports без breaking changes:

  - `@gertsai/api-core/contracts` — pure types (APIError, ResponseCode, response envelope, OpenAPI helpers). Zero runtime side effects, zero peer deps на Moleculer/BullMQ/dotenv/GCP. Safe для browser, FastAPI clients, Rust ts-types.
  - `@gertsai/api-core/moleculer` — Moleculer-specific runtime (ApiController, queues, channels, OAuth, gateway, **workflows experimental stub**). Lazy-init.
  - `@gertsai/api-core/runtime/node` — Node.js-specific factories (`loadConfig`, `createGcpLoggerStream`). Opt-in side effects.

  Root `@gertsai/api-core` остаётся backward-compatible через deprecated reexports с JSDoc warnings — но **больше не экспортирует `loadConfig`** (move на `/runtime/node`).

  **`@gertsai/core` v0.2.0** — language-neutral workflow contracts:

  - `WorkflowDefinition`, `WorkflowRun`, `WorkflowSignal`, `WorkflowState`, `WorkflowStepResult`, `EventEnvelope` — single source of truth для всех runtime adapters (Moleculer сейчас, FastAPI/Go/Rust позже).

  **`@gertsai/api-rlr` v0.2.0** — migrated к `@gertsai/api-core/contracts` subpath. Per-package tsconfig override на ESNext+Bundler для resolver compatibility.

  **Migration guide для consumers**:

  ```typescript
  // BEFORE (v0.1.x)
  import { APIError, ResponseCode } from "@gertsai/api-core";
  import { ApiController } from "@gertsai/api-core";
  import { loadConfig } from "@gertsai/api-core"; // ← removed

  // AFTER (v0.2.x)
  import { APIError, ResponseCode } from "@gertsai/api-core/contracts";
  import { ApiController } from "@gertsai/api-core/moleculer";
  import { loadConfig } from "@gertsai/api-core/runtime/node";
  ```

  Root imports continue to work для `APIError`/`ApiController`/etc., но triggers JSDoc deprecation warning. `loadConfig` requires explicit subpath migration.

  **Breaking surface only**: `loadConfig` no longer reexported from root. Workaround — explicit subpath. All other v0.1.x APIs preserved через root reexports.

  Refs: PRD-001, ADR-003 (Platform Runtime Boundaries), SPEC-002 (Sprint 2 checklist), EVID-002 (smoke), EVID-003 (Sprint 2 evidence).

- 155d0c0: Sprint 3.0.1 — pre-publish hardening (audit-pre-sprint-3-2 convergent fixes)

  **`@gertsai/core`** (minor — additive):

  - `WorkflowDefinition.params` is now `Readonly<Record<string, unknown>>` (was
    `object`), better representing fastestValidator-style schema literals
    (audit F-T-2).
  - `WorkflowSignal.meta?: WorkflowSignalMeta` — additive optional field with
    `tenantId`, `userId`, `correlationId`. Forestalls Sprint 3.2 forced minor
    bump for tenant context propagation (audit F-S-1).
  - `typesVersions` map added so `@gertsai/core/rag` and `@gertsai/core/llm`
    resolve cleanly under Node10/legacy `moduleResolution: "node"` consumers
    (audit F-T-4 + F-P-1).

  **`@gertsai/api-core`** (patch — internal refactor + additive):

  - `setWorkflows` is now generic `<M extends WorkflowRegistration>` so
    consumers' precise per-workflow `WorkflowDefinition<I, O>` types are
    preserved (audit F-T-3).
  - The internal registration hook is now keyed by a `Symbol.for(...)` Symbol
    instead of a public underscore-prefixed method, so it does not surface in
    emitted `.d.ts` (audit F-T-1, the original critical leak).
  - `ApiController` formally `implements ApiControllerInternalHook`; consumers
    no longer need `as unknown as Parameters<typeof setWorkflows>[0]` casts.
  - `MoleculerWorkflowSchema.params` tightened to `Readonly<Record<string, unknown>>`.
  - `adapter.ts` reads `WorkflowSignal.meta` from `ctx.meta` defensively and
    attaches it only when at least one string field is present.
  - `as unknown as ServiceSchema` casts in `_attachWorkflowsToServices` and
    `generateServiceSchema` removed — `CoreServiceSchema` now declares optional
    `workflows?: Record<string, MoleculerWorkflowSchema>` (audit F-T-5).
  - `typesVersions` map added so `@gertsai/api-core/contracts`,
    `@gertsai/api-core/moleculer`, and `@gertsai/api-core/runtime/node` resolve
    cleanly under Node10/legacy consumers (audit F-T-4 + F-P-1).
  - `attw` exits clean across all subpaths (was 💀 Resolution failed in Sprint
    3.0).

  **Repo-wide**:

  - TypeScript pinned to `5.9.3` workspace-wide (single root devDep; per-package
    pins removed). Single resolved version verified via `pnpm why typescript`
    (audit F-CR-4).
  - All 14 packages now have uniform `package.json` scripts: `build`, `clean`,
    `test`, `typecheck`, `lint`. `pnpm -r --parallel run typecheck` now covers
    15/15 workspaces (was silently skipping 5+) (audit F-CR-5).
  - Legacy `.eslintrc.cjs` deleted (canonical config is the flat
    `eslint.config.mjs` since Sprint 3.0) (audit F-CR-1).
  - `.forgeplan-web/` added to ESLint ignores to silence unrelated build-output
    warnings.
  - m9s-example workflow registration: documentation explicitly notes that
    module-load registration is required (workflow attach happens during
    `controller.Start({services})` — `addStartedHandler` callbacks fire too
    late). Comment cites EVID-005 + audit F-CR-3 + RFC-001 amendment 2026-05-05.

  **Out of scope**: Sprint 3.2 scope redesign (architect NO-GO findings F-A-1
  observe→otel rename, F-A-2 database→pg-client, F-A-3 drop auth-moleculer)
  will land as PRD-001 amendment + ADR-012 in a follow-up commit. v0.2.0 npm
  publish remains gated on user approval after this hardening.

  Refs: SPEC-005 (active), audit-pre-sprint-3-2 (5 reviewers, 6 convergent
  findings + 3 architect scope critical, all addressed or routed).

- e830ae6: Sprint 3.1 — workflows full implementation + ESLint hex-layer enforcement

  **`@gertsai/core`** — additive `WorkflowDefinition.params?: object` field for
  runtime adapter input validation (e.g. fastestValidator schemas in
  `@moleculer/workflows`). Non-breaking; older definitions remain valid.

  **`@gertsai/api-core`** — `controller.setWorkflows({...})` is now a
  production-ready 4th surface alongside `actions`, `queues`, `channels`:

  - `setWorkflows(controller, registration)` adapts language-neutral
    `WorkflowDefinition`s into Moleculer-flavoured workflow schemas via the new
    `adaptWorkflowDefinition()` helper, then registers them through an internal
    `_registerWorkflow` hook on `ApiController`.
  - `ApiController._attachWorkflowsToServices` is invoked at synthesized-schema
    build time (per RFC-001 amendment 2026-05-05, Option (a)) so workflows are
    visible to the `@moleculer/workflows` middleware before broker start.
  - `createMoleculerConfig({ workflows: { ... } })` now lazy-requires
    `@moleculer/workflows` and pushes its middleware. Lazy require keeps the
    peer-dep optional for consumers who do not need workflows.

  **Repo** — `eslint-plugin-boundaries` config (flat) added for
  `examples/m9s-example/src/**`, mirroring `.dependency-cruiser.cjs` rules with
  deny-by-default semantics. Provides IDE-side feedback complementing the
  existing CI dep-cruiser gate. 0 violations baseline.

  **`examples/m9s-example`** migrated from a hand-rolled `IngestWorkflowService`
  ServiceSchema to a pure `WorkflowDefinition` (`application/IngestProcessWorkflow.ts`)
  registered through `controller.setWorkflows({ 'ingest.process': ... })`. The
  runtime workflow name moved from `wf-ingest.ingest.process` →
  `v1.ingest.process` (synthesized as `<svc.fullName>.<wf.name>`).

  Refs: RFC-001 (active), SPEC-003, ADR-002, ADR-003.

### Patch Changes

- Updated dependencies [0755c6d]
  - @gertsai/llm-costs@0.2.0
