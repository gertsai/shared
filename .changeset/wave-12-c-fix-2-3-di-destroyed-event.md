---
'@gertsai/di': minor
---

Wave 12.C-fix-2+3 — close HIGH finding (EVID-048 H-9).

**H-9 — DI memory leak via 'destroy' vs 'destroyed' event-name mismatch**

DI's `ServicesRegistry.register()` subscribed to a `'destroy'` event on the consumer object, but `@gertsai/entity`'s `Model.$destroy()` emits `'destroyed'` (past-tense convention). Result: ServiceDirectory's `$destroy()` never fired for entity-derived consumers → services holding timers / open connections / metric handles leaked silently.

**Fix:** DI now subscribes to `'destroyed'` (matching `@gertsai/entity.Model` contract).

**Migration (soft breaking):** consumer classes that previously emitted `'destroy'` must rename to `'destroyed'`. Inside this monorepo: all DI test fixtures + the README example updated to emit `'destroyed'`. External consumers should verify their consumer-class implementations.

**Tests:** +2 new tests (positive: `'destroyed'` triggers cleanup; negative: legacy `'destroy'` does NOT trigger cleanup, confirming the rename). 115/115 total pass.

Refs: PRD-034, EVID-048 (H-9), entity Model.ts:46 (canonical event emit).
