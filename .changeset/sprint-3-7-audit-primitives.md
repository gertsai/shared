---
'@gertsai/audit-primitives': minor
---

Initial release. Pure data layer for backend-agnostic audit primitives.

- `Timestamp` interface ({ seconds, nanoseconds }) — backend-agnostic structure shared with entity-audit.
- `AuditMarks` interface — generic mutation marks (created_at / updated_at / deleted_at) WITHOUT session-bound builders.
- `TimestampProvider` type alias = `() => Timestamp` (call-signature, matches existing entity-audit shape per ADR-007 Amendment 1.1.3).
- 2 default providers: `dateTimestampProvider` (uses `Date.now()`), `fixedTimestampProvider(ts)` (test fixture returns same ts on every call).
- 4 conversion helpers: `timestampToMillis`, `timestampFromDate`, `timestampFromMillis`, `timestampCompare`.

Zero internal `@gertsai/*` peer-deps (per ADR-007 I-7) — pure utility + interface layer.
