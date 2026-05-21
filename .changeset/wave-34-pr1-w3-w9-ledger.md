---
'@gertsai/api-core': minor
---

Wave 34 PR-1 — W3 setStageOverride extension API + W9 wrapResponse XSS docs + ledger cosmetic.

ADI reasoning (Gemini-3-Flash-Preview via forgeplan_reason): H2 (Additive-First Phasing) high-confidence — ship W3+W9+ledger first (additive only), W2 surface-breaking rename follows in PR-2.

**Phase A — W3 setStageOverride extension API (additive)**:

Three new public methods on `ApiController` for richer pipeline composition (closes EVID-083 W3 — was deferred as "design decision, future RFC needed"):

- `addStageBefore(anchor, stage)` — inject custom stage BEFORE named default; multiple calls compose in insertion order (first-pushed runs first)
- `addStageAfter(anchor, stage)` — inject AFTER; same composition semantics
- `wrapStage(anchor, wrapper)` — around-advice; multiple wrappers compose onion-style (last-pushed = outermost, post-code runs last)

All three methods emit `logger.warn` when targeting sensitive stages (`establishAuthSession`/`validateRequest`/`validateResponse`/`injectTenantId`) per Wave 32.D pattern.

Snapshot isolation matches `setStageOverride` semantics: inserts captured at schema-build time, already-registered actions retain their original pipeline.

`_createActionSchema` resolves effective stages by composing: `slot.before[] → wrappers(override-or-default) → slot.after[]` per anchor.

**Phase B — W9 wrapResponse XSS hardening (docs-only)**:

Added security note to `wrap-response.ts` JSDoc + `ActionOptions.responseMessage` field JSDoc clarifying that `responseMessage` is server-controlled. Pipeline does NOT sanitize at runtime — fail-loud design contract over silent corruption. Closes EVID-083 W9 ("XSS risk from responseMessage") which was deferred as not-an-issue but documenting the contract makes it explicit.

**Phase C — Ledger cosmetic**:

PRD-016 advisory phase advanced `shape → done` via `forgeplan_phase_advance`. Wave 10 actually shipped per EVID-038 (linked Wave 33 Phase A); phase metadata now reflects reality. Closes 1 advisory phase mismatch in `forgeplan health`.

**Tests**: +6 new in `apiController-stage-override.test.ts` (AC-A1..A6 — insertion order, around composition, onion order, sensitive-stage warn). All 399 api-core tests passing (393 + 6).

**Bump rationale**: `@gertsai/api-core` MINOR — new public extension methods are additive. Existing `setStageOverride` signature unchanged; all consumers binary-compatible.

**Deferred to Wave 34 PR-2**: W2 workspace-wide `_uid → uuid` rename across `@gertsai/entity` + `@gertsai/core` — surface-breaking minor bump, isolated for clean revert if downstream breaks.

Refs: PRD-068, EVID-083 W3 + W9, ADI reasoning H2, Wave 32 PRD-066 (`setStageOverride` baseline)
