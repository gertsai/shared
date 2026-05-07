---
"@gertsai/entity-audit": minor
---

Initial release of `@gertsai/entity-audit` — audit trail types (MutationMarks, UpdateAction, UpdateActionMap module-augmentable) + pure builder functions (buildDataForSet/Update/Delete/Restore) with session-aware mutation marks. Generic Timestamp interface (replaces Firelord ServerTimestamp) + injectable TimestampProvider. Mirrors Orchestra orchlab/core meta patterns 1:1 per ADR-005. Per PRD-002 FR-W4-007..009.
