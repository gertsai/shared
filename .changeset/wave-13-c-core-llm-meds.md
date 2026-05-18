---
'@gertsai/core': patch
---

Wave 13.C — close 6 MEDIUM/LOW LLM findings from EVID-059 in `@gertsai/core`.

- **FR-001** (M, base.ts:154): `this.stop = config.stop` (when array) was caller-mutable post-construction. Fix: defensive `[...config.stop]` copy.
- **FR-002** (M, routing.ts:416-417): `bedrock` silently mapped to `'google'` (the existing comment admitted this was wrong). Audited `llm-info` `AI_PROVIDER_TYPE` enum — no `'aws'`/`'bedrock'` value exists. Fix: replaced silent misclassification with explicit `throw new Error('Bedrock provider mapping not yet implemented...')`. Callers passing `provider: 'bedrock'` to `listCandidates`/`selectModel`/`getFallbackModel` now error loudly. Default construction unaffected (`ModelRouter` constructor only iterates openai/anthropic/gemini).
- **FR-003** (L, routing.ts:152,162): silent `} catch {}` in `createWithFallback` masked all errors. Fix: log at `console.debug` level.
- **FR-004** (L, anthropic.ts/openai.ts/gemini.ts): error messages interpolated raw `response.text()` content. Fix: per-provider `truncateForError(text, 500)` helper before interpolation.
- **FR-005** (L, openai.ts:199,210): `response.choices[0]?.message?.content ?? ''` masked "no choices returned" failure as empty content. Fix: explicit check + `throw new Error('OpenAI returned no choices in response')` when missing/empty.

**4 new regression tests** added in `llm.test.ts`. Total: 1199 pass (was 1195), 53 skipped, 0 fail.

**Behaviour break (FR-002)**: callers explicitly passing `provider: 'bedrock'` now error instead of receiving silently-misclassified google candidates. This was a latent bug — the previous behaviour was wrong. No known consumer relies on it.

Refs: PRD-047, EVID-059 (Wave 12.D2 audit), EVID-060 (Wave 13.A precedent), EVID-061 (Wave 13.B precedent).
