---
'@gertsai/core': minor
---

Wave 12.D-fix Teammate B — close 4 HIGH findings per PRD-036.

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
