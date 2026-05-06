---
'@gertsai/entity-audit': patch
---

Sprint 3.7 E+ refactor (per ADR-007 Amendment 1.1.4): re-export Timestamp / TimestampProvider / timestampToMillis / timestampFromDate / dateTimestampProvider from new `@gertsai/audit-primitives` package.

**Strictly additive backward-compat** — entity-audit's existing exports preserved:
- `Timestamp` interface unchanged shape; canonical home moved upstream to audit-primitives, re-exported here.
- `TimestampProvider` type unchanged signature; canonical home moved upstream, re-exported here.
- `timestampToMillis` and `timestampFromDate` re-exported from audit-primitives (own implementations removed; same behavior).
- `defaultTimestampProvider` retained as deprecated alias (`@deprecated`) for `dateTimestampProvider` from audit-primitives.

Consumers MAY migrate to direct `@gertsai/audit-primitives` import for Timestamp utilities; entity-audit continues as the Entity-augmented audit layer (session-bound `MutationMarks` + `buildDataFor*` builders).

New dependency: `@gertsai/audit-primitives: workspace:^`.
