# @gertsai/entity-audit

## 0.1.1

### Patch Changes

- @gertsai/session@2.0.0

## 0.1.0

### Minor Changes

- c19e12a: Initial release of `@gertsai/entity-audit` — audit trail types (MutationMarks, UpdateAction, UpdateActionMap module-augmentable) + pure builder functions (buildDataForSet/Update/Delete/Restore) with session-aware mutation marks. Generic Timestamp interface (replaces Firelord ServerTimestamp) + injectable TimestampProvider. Mirrors Orchestra orchlab/core meta patterns 1:1 per ADR-005. Per PRD-002 FR-W4-007..009.

### Patch Changes

- 121cb7b: Sprint 3.7 E+ refactor (per ADR-007 Amendment 1.1.4): re-export Timestamp / TimestampProvider / timestampToMillis / timestampFromDate / dateTimestampProvider from new `@gertsai/audit-primitives` package.

  **Strictly additive backward-compat** — entity-audit's existing exports preserved:

  - `Timestamp` interface unchanged shape; canonical home moved upstream to audit-primitives, re-exported here.
  - `TimestampProvider` type unchanged signature; canonical home moved upstream, re-exported here.
  - `timestampToMillis` and `timestampFromDate` re-exported from audit-primitives (own implementations removed; same behavior).
  - `defaultTimestampProvider` retained as deprecated alias (`@deprecated`) for `dateTimestampProvider` from audit-primitives.

  Consumers MAY migrate to direct `@gertsai/audit-primitives` import for Timestamp utilities; entity-audit continues as the Entity-augmented audit layer (session-bound `MutationMarks` + `buildDataFor*` builders).

  New dependency: `@gertsai/audit-primitives: workspace:^`.

- Updated dependencies [782a3e0]
- Updated dependencies [c19e12a]
- Updated dependencies [6debc97]
- Updated dependencies [121cb7b]
  - @gertsai/session@1.0.0
  - @gertsai/audit-primitives@0.2.0

## 0.0.0

Initial scaffold (unreleased).
