---
depth: tactical
id: EVID-059
kind: evidence
links:
- target: PRD-041
  relation: informs
status: active
title: Wave 12.D2 — @gertsai/core deep audit (84% un-sampled coverage)
---

## Summary

Comprehensive deep audit of the un-sampled 84% of `@gertsai/core` covering 4 domains: agent runtime (157 LOC), query primitives (1,531 LOC excl. tests), session lifecycle (3,692 LOC), and LLM providers/routing (2,580 LOC). Total 7,960 LOC reviewed. Surfaces **2 CRITICAL**, **11 HIGH**, **14 MEDIUM**, and several LOW-severity findings. Wave 12.D (EVID-051) already closed the obvious base-URL/SSRF surface; this pass uncovers the harder-to-spot issues: cross-tenant state leakage in `AnthropicProvider`, prototype-pollution surface in `BaseLLM.handleToolExecution`, fabricated conversation context in two providers, a logic bug in `createRequestMeta` that silently breaks the `timeout` default, an O1-model heuristic prone to false positives, non-cryptographic config hashing, a global mutable `ModelRouter` singleton, and several inconsistencies between TypeScript types and their Zod/runtime guards.

Biggest themes:
1. **Multi-tenancy hazards from shared mutable state** — instance-level `previousThinkingBlocks` in `AnthropicProvider` and the module-level `defaultRouter` singleton in `llm/routing.ts` both leak across tenants when reused. Combined with the foundation libraries' DI patterns, this is the kind of bug that only surfaces under load.
2. **Validation/type drift in `session/tenant-config.ts`** — runtime Zod schemas, TypeScript types, factory defaults, and type guards disagree on what is "valid". `chunkingStrategy` and `GraphRAGSettings.maxHops` are concrete examples.
3. **LLM-controlled string into bracket index / URL path** — `handleToolExecution` and `GeminiProvider` URL construction both interpolate caller-controlled strings (tool name, model name) into security-sensitive call paths without normalisation.
4. **Silent fabrication of conversational content** — both `AnthropicProvider` and `GeminiProvider` inject a fake `"Hello"` user message when the formatted history is empty or doesn't start with `user`. Auditability concern.

## Structured Fields

- verdict: supports
- congruence_level: CL3
- evidence_type: internal_audit
- linked_artifact: PRD-041
- summary: 2 CRITICAL + 11 HIGH findings across agent/query/session/llm domains; biggest hazards are cross-tenant state leakage in AnthropicProvider and prototype-pollution surface via bracket-indexed tool dispatch.

## Coverage Stats

| Domain | LOC | Files audited | Findings raised |
|---|---|---|---|
| agent/ | 157 | 1 (`agent.ts`) | 0/0/2/1 |
| query/ | 1,531 | 4 (`types.ts`, `executor.ts`, `registry.ts`, `router.ts`) | 0/2/4/2 |
| session/ | 3,692 | 4 (`index.ts`, `session-context.ts`, `types.ts`, `tenant-config.ts`) | 1/4/5/2 |
| llm/providers/ + base + routing | 2,580 | 7 (`base.ts`, `types.ts`, `routing.ts`, `router-types.ts`, 3 providers) | 1/5/3/3 |
| **Total** | **7,960** | **16** | **2/11/14/8** |

## CRITICAL findings

### CRIT-1 — Cross-tenant state leakage via `AnthropicProvider.previousThinkingBlocks`

**File:** `packages/core/src/llm/providers/anthropic.ts:132,215,433-440`

The provider keeps mutable per-instance state (`private previousThinkingBlocks: AnthropicContentBlock[] = []`) that is overwritten on every call (line 215) and then injected verbatim into the next call's assistant message (lines 433-440). If a single `AnthropicProvider` instance is shared across tenants — which is the natural DI/singleton pattern used by `ModelRouter` and by application servers that pool LLM clients — tenant A's chain-of-thought / extended-thinking content is replayed into tenant B's prompt. This both leaks confidential reasoning (CWE-200) and corrupts the next caller's context. The class has no tenant boundary, no per-call reset, no `clearThinking()` method. The same instance is what `createLLM('anthropic/claude-3-5-sonnet')` returns from the module-level singleton router in `routing.ts:600-604`.

**Fix:** Move `previousThinkingBlocks` out of the provider instance entirely — pass thinking blocks via `LLMCallOptions` and let the caller (which knows its tenant scope) manage state. As an interim mitigation, reset `this.previousThinkingBlocks = []` at the end of every `call()` and document that the provider is per-conversation, not per-tenant.

### CRIT-2 — Prototype-pollution / unsafe dispatch in `BaseLLM.handleToolExecution`

**File:** `packages/core/src/llm/base.ts:425-449`

`handleToolExecution(toolName, toolArgs, availableFunctions)` dereferences a fully model-controlled string via `availableFunctions[toolName]` with no validation that `toolName` is an own enumerable property of `availableFunctions`. Tool names like `"__proto__"`, `"constructor"`, `"hasOwnProperty"`, `"toString"` all resolve to inherited values (the empty Object.prototype function or the object literal's prototype). Most resolve to non-callables → `fn(toolArgs)` throws, which is caught and logged as a tool failure — but the failure mode is information-leaking (the model learns it hit a prototype slot) and, more importantly, in any deployment that has previously polluted `Object.prototype` (e.g. via `lodash <4.17.20` merge, or a JSON.parse → spread upstream — see also the `mergeTenantConfigWithDefaults` shallow spreads at `tenant-config.ts:2168-2258`), this becomes arbitrary function dispatch. The console.error at line 446 then echoes `toolName` unfiltered into logs (CWE-117 log injection).

**Fix:** Guard with `Object.prototype.hasOwnProperty.call(availableFunctions, toolName) && typeof availableFunctions[toolName] === 'function'` before dispatch. Sanitise `toolName` for logging (`JSON.stringify` or a printable-ASCII whitelist). For defence-in-depth, use a `Map<string, Function>` rather than an object as the function registry.

## HIGH findings (per domain)

### Agent runtime

(No HIGH findings — `agent.ts` is a thin interface surface. Two MEDIUM findings consolidated below.)

### Query primitives

- **H-1 — `QueryRouter.execute` blindly spreads `result.metadata.custom as object`** — `packages/core/src/query/router.ts:319-320,367-368` — `custom` is typed `unknown` and is cast to `object`. If an executor returns `custom: "some-string"`, the spread produces `{0:'s',1:'o',...}` rather than failing; if it returns a value with an own `__proto__` property (possible after JSON.parse + spread upstream), the property is copied as own onto the merged metadata. Should narrow `custom` with `typeof === 'object' && custom !== null` before spreading.
- **H-2 — `safeExecute` swallows all non-`QueryError` exceptions as `EXECUTION_FAILED` with `retryable: false`** — `packages/core/src/query/executor.ts:236-252` — A `RangeError`/`TypeError` from a programming bug returns the same `QueryFailure` shape as a transient network error; callers cannot distinguish "retry won't help" from "this is a programmer error, fail loud". Add `cause`/`name` propagation, or special-case `AbortError`/`TimeoutError`.

### Session lifecycle

- **H-3 — `createRequestMeta` spreads `...options` AFTER explicit defaults, defeating `??` fallback** — `packages/core/src/session/types.ts:202-210` — `startedAt: options.startedAt ?? new Date(), timeout: options.timeout ?? DEFAULT_TIMEOUT, ...options` — when caller passes `{ timeout: undefined }`, the trailing spread overwrites the defaulted `timeout` with `undefined`, producing `timeout: undefined` in the result. Same for `startedAt`. Downstream code in `session-context.ts:136` does `if (this._requestMeta.timeout > 0)` which silently no-ops the timeout setup when timeout is undefined. Auth/abort semantics break invisibly. Fix: spread `...options` first, then override with defaults.
- **H-4 — `GraphRAGSessionContext.updateSettings` mutates a `Readonly<GraphRAGSettings>` private field via `Object.assign`** — `packages/core/src/session/session-context.ts:266-268` — `this._graphRagSettings` is typed as `Readonly` to its consumers via the getter (`get graphRagSettings(): Readonly<GraphRAGSettings>`), but `updateSettings` calls `Object.assign(this._graphRagSettings, settings)` which mutates in-place. Any caller that captured a reference via the getter sees its "read-only" snapshot change underneath. Should produce a new frozen object: `this._graphRagSettings = Object.freeze({ ...this._graphRagSettings, ...settings })` and drop the `private readonly` mark.
- **H-5 — `$switchOperator` is an unauthenticated privilege swap with no tenant check** — `packages/core/src/session/session-context.ts:282-285` — Casts away `Readonly` and overwrites `operator.id` + `operator.type` with no caller check. There is no `tenantId` validation, no audit trail update, and the prior operator's identity is silently lost. If exposed (the `$` prefix suggests "internal" but it's a public method on the exported class), a misbehaving plugin / interceptor can promote a `USER` to `ADMIN` mid-session. At minimum: emit an audit event, validate the new operator id is non-empty, and require an explicit `force: true` flag.
- **H-6 — `mergeTenantConfigWithDefaults` and `applyTenantConfigUpdate` deep-spread caller-controlled config with no key sanitisation** — `packages/core/src/session/tenant-config.ts:2165-2259, 2268-2470` — Each nested section uses raw `{...DEFAULT, ...config.section}` spreads. If `config.section` came from a JSON.parse that included an own `__proto__` key, the spread propagates it as an own property on the merged result; callers later doing `merged.something` won't see prototype pollution per se but the parsed config carries an unexpected own `__proto__` slot. The `isTenantConfig` guard at line 1824-1830 only checks `tenantId`/`llm`/`embedding` and would pass a config with arbitrary extra fields including `__proto__`. Combine with the lack of an allowlist in `sanitizeTenantConfig` (line 2578-2603, blocklist of `apiKeyRef`+`baseUrl` only) and unexpected fields propagate end-to-end into `ctx.meta`.

### LLM providers

- **H-7 — Module-level `defaultRouter` singleton ignores subsequent config** — `packages/core/src/llm/routing.ts:594-604` — `getDefaultRouter(config)` only honours `config` on the first call; later callers silently get the stale instance with a possibly-different `eventBus`/`fallbacks`. Multi-tenant servers initialising the router with tenant-specific event buses lose telemetry routing for all but the first tenant. Either fail-loud on mismatched second-call config, or remove the singleton and make `createLLM` take an explicit router.
- **H-8 — `OpenAIProvider.isO1Model` uses `.includes('o1') || .includes('o3')` substring check on lowercased model** — `packages/core/src/llm/providers/openai.ts:161` — Matches any model name containing `o1`/`o3` substring (CWE-697). False positives: `gpt-4o-1106`, `gpt-4o-3-mini`, custom `gpto1-eval`. False match silently disables temperature / tools / stop words for those models. Use a precise regex anchored to model-family prefixes: `/^o[13](-|$)/`.
- **H-9 — `GeminiProvider` interpolates `this.model` into the URL path without encoding** — `packages/core/src/llm/providers/gemini.ts:328` — `\`${this.getBaseUrl()}/models/${this.model}:generateContent\``. A model name containing `/`, `?`, `#`, or `:` reroutes the request (e.g., `"foo:streamGenerateContent?key="` would hit a different endpoint and could leak the API key as a query parameter on a logging proxy). Tenant configs flow into model name (`session/tenant-config.ts:46-47`), so this is reachable. Use `encodeURIComponent(this.model)`.
- **H-10 — `OpenAIProvider.call` does not try/catch `JSON.parse(toolCall.function.arguments)`** — `packages/core/src/llm/providers/openai.ts:230` (analogous problem in `anthropic.ts:249`) — A malformed argument string from the model throws `SyntaxError` mid-loop, leaks the unparsed args into the error message via `error.message`, and aborts subsequent tool calls in the same response. Wrap with `try { JSON.parse(...) } catch { /* emit toolFailed; continue */ }`.
- **H-11 — Both `AnthropicProvider` and `GeminiProvider` silently inject a fabricated `"Hello"` user message** — `anthropic.ts:448-453, gemini.ts:258-260` — When the conversation transformation yields zero messages or starts with non-user, the provider unilaterally inserts `{role:'user', content:'Hello'}`. The LLM sees content the caller never supplied. For regulated/audited domains this is unacceptable — at minimum throw a clear error (`Empty or assistant-led conversation`) instead of forging input.

## MEDIUM/LOW findings (consolidated)

| Sev | Domain | File:line | Issue |
|---|---|---|---|
| M | agent | `agent.ts:85` | `run(input: string \| unknown, …)` — `string \| unknown` collapses to `unknown` (TS unions); the `string \| ` is decorative and misleading. |
| M | agent | `agent.ts:153` | `tools?: readonly ITool[]` — `readonly` enforces only the array shell; `ITool` itself has no `readonly` on fields, so element mutation remains. |
| L | agent | `agent.ts:62-91` | `IAgent` exposes 3 getter methods (`getId`, `getRole`, `getGoal`) where readonly properties would be more idiomatic; trivial. |
| M | query | `executor.ts:328,338,352,362` | 4 helpers typed with `IQueryExecutor<any, any>` — defeats the discriminated union enforcement of the registry. Use `IQueryExecutor<QueryRequest, unknown, unknown>` (still permissive) or a properly-generic helper. |
| M | query | `router.ts:203` | `private executors = new Map<string, IQueryExecutor<any, any>>()` — same `any` leak; combined with `register()` accepting generic params, the map stores untyped executors and `getExecutor(name)` returns `IQueryExecutor<any, any>` to callers. |
| M | query | `types.ts:330` | `queryPartial` clamps `progress` to [0,1] but `querySuccess`/`queryFailure` don't validate the corresponding fields (`durationMs ≥ 0`, `confidence ∈ [0,1]`). Inconsistent input hygiene. |
| M | query | `registry.ts:511-516` and 4 sibling factories | Spread `...options` after literal `type`/`tenantId` — at runtime if the caller passes `options` containing `type: 'something_else'` (which TS prevents but JS doesn't), the literal type is overwritten. Use `Object.assign({type, tenantId, …}, options)` with explicit ordering. |
| L | query | `router.ts:101-105` | `latencyOrder = { fast: 0, medium: 1, slow: 2 }` recreated on every sort comparator call. Hoist to module constant. |
| L | query | `router.ts:386-396` | `asTool()` returns `unknown` typed as `{ name, description, router }` — consumers cast freely. A typed `AgentTool` interface in `agent.ts` would help. |
| M | session | `session-context.ts:301` | `throw this._abortController.signal.reason \|\| new Error('Session aborted')` — `signal.reason` is `unknown` in the standard library; throwing arbitrary values is legal but bypasses error-instance handling. Wrap non-Error values: `throw signal.reason instanceof Error ? signal.reason : new Error(String(signal.reason))`. |
| M | session | `session-context.ts:365` | `GraphRAGSessionContext.fromJSON` calls `JSON.parse(json)` then passes the result straight to `deserialize` with no schema check. A malformed payload (missing `tenantId`, wrong `version`) crashes inside the constructor. Use `isRequestMeta`/`isOperator` first or a wrapper schema. |
| M | session | `types.ts:285-310` | `isGraphRAGSettings` enforces `maxHops ∈ [1,5]`, `topK ∈ [1,100]`, but `createGraphRAGSettings` (line 316-321) does no clamping. Factory can produce values the type guard then rejects. |
| M | session | `tenant-config.ts:1492` | Zod `chunkingStrategy` enum lacks `'hierarchical'` though TS type `ChunkingStrategy` at line 1419-1423 includes it. Runtime/type drift. |
| M | session | `tenant-config.ts:2478-2488` | `calculateConfigHash` uses 32-bit FNV-like hash on `JSON.stringify(config)`. Key-order-dependent (canonicalisation missing) → false cache misses on logically-equal configs; collision-prone at ~65 K configs. If used only for cache key it's tolerable; rename to `configCacheKey` to disclaim cryptographic intent. |
| L | session | `tenant-config.ts:2245, 2248, 2371, 2375, 2380` | Non-null assertions `DEFAULT_TENANT_CONFIG.agentReasoning!` — if a refactor removes `agentReasoning` from defaults, runtime crash with no TS warning. Replace with `?? DEFAULT_AGENT_REASONING`. |
| M | session | `tenant-config.ts:2580-2603` | `sanitizeTenantConfig` is a *blocklist* (`apiKeyRef`+`baseUrl`). New sensitive fields (e.g. `bearerToken`, `clientSecret`) added later will leak. Switch to *allowlist* via `Pick`. |
| M | llm | `base.ts:154` | `this.stop = config.stop` (when array) — caller can mutate the array post-construction, changing provider behaviour mid-flight. Defensive copy: `this.stop = [...config.stop]`. |
| M | llm | `routing.ts:416-417` | `bedrock` maps to `'google'` AI provider — comment admits this is wrong; cost estimation for Bedrock customers will use Google pricing. Either gate Bedrock behind a "not implemented" error or fix the mapping. |
| L | llm | `routing.ts:152,162` | Silent `} catch {}` in `createWithFallback` masks all errors (including programmer errors) during chain traversal. At minimum log the first error. |
| L | llm | `anthropic.ts:312-313, openai.ts:276, gemini.ts:350-352` | Error messages interpolate raw `response.text()` content. A hostile `baseUrl` (validated against scheme/host but not against response payload) could echo back attacker-controlled blobs. Truncate to N bytes. |
| L | llm | `openai.ts:199,210` | `response.choices[0]?.message?.content ?? ''` masks a real "no choices returned" failure as empty response. Distinguish missing choices vs empty content. |

## Cross-cutting observations

1. **Spread-after-literal pattern is repeated in 6+ factory functions** (`createRequestMeta`, the four `query/registry.ts` factories, `mergeTenantConfigWithDefaults` partial sections). The pattern silently breaks defaults when callers pass `undefined`. A single helper `withDefaults<T>(defaults, override)` that filters undefined would close all of these uniformly.
2. **`any` leak in `IQueryExecutor<any, any>` (5+ sites)** undermines the otherwise-careful discriminated-union design of `QueryTypeRegistry`. The type system's promise that `nl` queries get `NLQueryData` results is silently broken at the registry boundary.
3. **Blocklist sanitisation in two places** (`sanitizeTenantConfig` blocks 2 sensitive fields; `isSanitizedTenantConfig` only checks the same 2) doesn't scale. New sensitive fields require updating both. Pick<allowlist> is structurally safer.
4. **No tenant-id propagation through LLM provider stack.** Providers know `model`, `apiKey`, `baseUrl` but never see `tenantId`. Cross-tenant telemetry, rate-limiting, and the CRIT-1 leak all derive from this. Consider threading `tenantId` through `LLMCallOptions` (already has `metadata: Record<string, unknown>` — formalise the slot).
5. **Fabricated content as "robustness".** Both Anthropic and Gemini providers silently insert `"Hello"` to satisfy API constraints. For regulated workloads (legal/healthcare/finance per the very ontology bindings the tenant config exposes at `tenant-config.ts:184-209`) this fabricates audit-trail content. Should fail-fast.

## Suggested follow-up wave

Prioritised by impact-over-effort:

1. **Wave 13.A (CRITICAL, ~3 PRs)** — Close CRIT-1 (Anthropic thinking-block leak) and CRIT-2 (tool-name bracket dispatch). Both are surgical changes; CRIT-2 may need adoption-impact review for any caller relying on inherited properties (unlikely).
2. **Wave 13.B (HIGH session, ~2 PRs)** — Fix H-3 (`createRequestMeta` spread order), H-4 (`updateSettings` mutation), H-5 (`$switchOperator` audit), and consolidate to a single `withDefaults` helper applied across the 6 spread-after-literal sites.
3. **Wave 13.C (HIGH llm, ~2 PRs)** — Remove module-level `defaultRouter` singleton OR fail-loud on mismatched config (H-7); fix `isO1Model` regex (H-8); add `encodeURIComponent` to Gemini model path (H-9); wrap `JSON.parse(toolCall.arguments)` in both providers (H-10); replace fabricated "Hello" with an explicit error (H-11).
4. **Wave 13.D (MED tenant-config consistency, ~2 PRs)** — Reconcile `chunkingStrategy` Zod/TS drift; reconcile `GraphRAGSettings` factory ↔ type-guard ranges; rename `calculateConfigHash` to `configCacheKey`; switch `sanitizeTenantConfig` to allowlist; remove `DEFAULT_TENANT_CONFIG.agentReasoning!` non-null assertions.
5. **Wave 13.E (MED query type-system, 1 PR)** — Replace `IQueryExecutor<any, any>` with `IQueryExecutor<QueryRequest, unknown>` across `executor.ts` helpers and `router.ts` storage; tighten `asTool()` return type.

## Methodology

- Read-only audit, no source modifications, no commits.
- Files audited (16): `agent.ts`, `query/{index,types,executor,registry,router}.ts`, `session/{index,session-context,types,tenant-config}.ts`, `llm/{base,types,routing,router-types,index}.ts`, `llm/providers/{openai,anthropic,gemini}.ts`.
- Each file read end-to-end at least once; cross-domain findings (e.g. CRIT-1 + H-7 interaction) verified by inspecting both call sites.
- Tools: `Read`, `grep`, `wc`. No `forgeplan reason` LLM call used.
- Limitations:
  - Test files (`*.test.ts`) were not deeply audited for security parity, only used to gauge coverage breadth (agent.test: 2 cases, query.test: 106, llm.test: 81, session/tests: 58).
  - `llm/model-registry.ts`, `llm/structured-output.ts`, `llm/base-url-validator.ts` were outside the scope (covered by EVID-051 Wave 12.D); `llm/index.ts` only inspected for re-export surface.
  - Did not run `pnpm typecheck` / `pnpm test` — verified findings statically.
  - Dynamic / runtime concerns (e.g., exact AbortController GC behaviour, real provider response shapes vs. typed shapes) noted but not exercised.

## Refs

- PRD-041 (target audit scope)
- EVID-051 (Wave 12.D precedent — the 16% sample covering `model-registry`, `structured-output`, `base-url-validator`)
- ADR-002 (hex layer enforcement — `@gertsai/core` confirmed flat utility, no domain→infrastructure violations found in audited files)
- ADR-003 (platform runtime boundaries — subpath exports clean)


