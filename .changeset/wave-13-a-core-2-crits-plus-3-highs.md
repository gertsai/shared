---
'@gertsai/core': minor
---

Wave 13.A — close 2 CRITICALs + 3 HIGHs from EVID-059 (Wave 12.D2 deep audit).

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
