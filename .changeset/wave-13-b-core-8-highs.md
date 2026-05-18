---
'@gertsai/core': minor
---

Wave 13.B — close 8 remaining HIGHs from EVID-059 (query + session + LLM).

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
