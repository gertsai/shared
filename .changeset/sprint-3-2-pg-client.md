---
"@gertsai/pg-client": minor
---

Initial release of `@gertsai/pg-client` — agnostic 3-method PostgreSQL client interface (`$queryRaw` / `$executeRaw` / `$disconnect`) + `mockPgClient()` test fixture. Zero dependencies on any specific Postgres driver/ORM (per ADR-004 I-3 + ADR-011 I-1/I-2). Replaces previously planned `@gertsai/database` per ADR-004 F-A-2.
