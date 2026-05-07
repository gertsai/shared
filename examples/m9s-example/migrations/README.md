# Migrations — m9s-example schema evolution

> Sprint 3.11 introduces a custom raw-SQL migration runner for m9s-example
> per **ADR-011 §Decision E** (locked to **E1 Raw SQL + custom runner** via
> Amendment 1 §A1.4 ADI). The runner lives at `scripts/migrate.ts` and uses
> `@gertsai/pg-client` directly — no Drizzle, no Prisma, no migration ORM.
> Constraints in Amendment 2 §A2.6 / §A2.11 (I-15) — advisory lock,
> hard-coded path, typia-validated argv.

## Why raw SQL + custom runner (E1)?

Three options were on the table; the ADI run on ADR-011 confirmed E1:

- **E1 Raw SQL** ✅ — universal, transparent, ~100 LOC runner. Best for a
  reference example: readers see the actual SQL they'd run, not a tooling
  abstraction.
- **E2 drizzle-kit** ❌ — opinionated TS toolchain; conflicts with the
  minimalist reference goal.
- **E3 Prisma** ❌ — 50 MB engine binaries; opinionated codegen.

The teaching value of m9s-example is **showing how the Wave 5 `@gertsai/*`
packages compose into a real backend**, not how to use a specific migration
ORM. Raw SQL keeps the focus on the schema decisions (HNSW index, tenant_id
columns, FK cascades) rather than tooling syntax.

## File naming convention

```
NNN_<short_name>.up.sql       # forward migration
NNN_<short_name>.down.sql     # paired rollback
```

- `NNN` — zero-padded **version number** starting at `001`. Strictly
  monotonic; **no gaps allowed**. The runner refuses to apply if it detects
  a missing version.
- `<short_name>` — lower-snake-case domain summary, e.g.
  `init_documents_chunks`, `add_tenant_id_to_audit_log`. Typically 2-4
  words; not load-bearing for tooling.
- Both files MUST be paired. Applying `NNN.up.sql` without a matching
  `NNN.down.sql` is rejected by the runner — rollback always remains
  possible.

Current state:

```
migrations/
├── 001_init_documents_chunks.up.sql       # documents + chunks + HNSW + pg_migrations
└── 001_init_documents_chunks.down.sql     # DROP order respects FK
```

## Tracking table — `pg_migrations`

The `001` migration creates a small bookkeeping table that the runner reads
and writes:

```sql
CREATE TABLE IF NOT EXISTS pg_migrations (
  version      int         PRIMARY KEY,
  name         text        NOT NULL,
  applied_at   timestamptz NOT NULL DEFAULT now()
);
```

Each `migrate:up` run inserts one row per applied migration. `migrate:down`
deletes the row. Inspect state with:

```sql
SELECT version, name, applied_at
  FROM pg_migrations
 ORDER BY version;
```

Or via the runner:

```bash
pnpm --filter @gertsai-examples/m9s-example migrate:status
# → 1 applied / 0 pending
#   001 init_documents_chunks   2026-05-07 14:23:11+00
```

## CLI

The runner exposes exactly four commands per ADR-011 I-15 (CLI surface
restricted; argv validated via `typia.assert<MigrateCommand>`):

| Command | Behaviour |
|---|---|
| `pnpm migrate:status` | print applied + pending migrations; exit 0 |
| `pnpm migrate:up` | apply all pending migrations in order; advisory lock held for the run |
| `pnpm migrate:down` | roll back **one** migration (the most recent applied) |
| `pnpm migrate:down --target-version=N` | roll back until `version > N` rows are gone (inclusive of versions > N) |

> **No `--file` / `--dir` overrides** (CWE-22 path traversal mitigation per
> I-15). The migrations directory is hard-coded:
> `path.resolve(__dirname, '../migrations')`. To add a new migration,
> create the file in this directory; do not point the runner at an
> arbitrary path.

`MIGRATIONS_AUTO_APPLY=true` in `.env` causes the broker to invoke the
runner on boot (calls `migrate:up` from the composition root). Convenient
for the demo; **not recommended** for production — coordinate migrations
with deploy windows instead.

## Rollback semantics

- `migrate:down` with no flags → roll back exactly **one** migration (the
  highest-version applied row). Idempotent if there's nothing to roll back
  (exit 0, no-op).
- `migrate:down --target-version=N` → roll back every migration with
  `version > N`, in descending version order, each in its own transaction.
  The argument is validated via `Number.isInteger` AND must satisfy
  `0 ≤ N ≤ max_version`.
- Rolling back the last migration leaves `pg_migrations` empty; the table
  itself is intentionally **not** dropped by `001_init_documents_chunks.down.sql`
  — the runner manages the row lifecycle separately. If you need a truly
  fresh database, drop the database (or use `docker compose down -v`).

## Failure handling

Each migration runs inside a **single transaction** wrapped by a
**session-scoped advisory lock** (`pg_advisory_xact_lock(<key>)`):

```
BEGIN;
  SELECT pg_advisory_xact_lock(<lock-key>);
  -- migration SQL here
  INSERT INTO pg_migrations (version, name) VALUES (...);
COMMIT;
```

This guarantees:

1. **Concurrent runs serialise.** If two `migrate:up` invocations race
   (CI + dev machine, two pods, ...), the second waits for the first
   transaction to commit/rollback before acquiring the lock. No
   double-application, no torn state.
2. **Mid-migration failure → full rollback of that migration.** Postgres
   aborts the transaction on any error inside the block; the migration's
   DDL changes AND the `pg_migrations` row insert are rolled back together.
   The next `migrate:up` retries the same version.
3. **The advisory lock is released on commit/rollback automatically**
   (it's `xact_lock`, not `pg_advisory_lock`). No manual cleanup needed
   even if the process crashes mid-transaction — Postgres releases the
   lock when the connection drops.

Manual cleanup, if you ever need it:

```sql
-- Inspect held advisory locks
SELECT * FROM pg_locks WHERE locktype = 'advisory';

-- Force-release a stuck connection (use psql to its pid)
SELECT pg_terminate_backend(<pid>);
```

## Idempotency contract (ADR-011 I-3)

Every migration **MUST** be idempotent:

- All `CREATE TABLE` use `IF NOT EXISTS`.
- All `CREATE INDEX` use `IF NOT EXISTS`.
- All `CREATE EXTENSION` use `IF NOT EXISTS`.
- Any `INSERT` that seeds reference data uses `ON CONFLICT DO NOTHING` (or
  equivalent).
- Any `ALTER TABLE ... ADD COLUMN` uses `IF NOT EXISTS` (Postgres 9.6+).
- Any function/view definition uses `CREATE OR REPLACE`.

Re-running `migrate:up` on an already-applied migration MUST be a no-op
in side effects — the `pg_migrations` lookup short-circuits the runner
before executing the SQL, but the SQL itself MUST tolerate being run
twice as a defence-in-depth check (W-3-11-26 verifies this).

### Rollback idempotency

- `DROP INDEX IF EXISTS`, `DROP TABLE IF EXISTS`, `DROP EXTENSION IF EXISTS`
  in `down.sql`.
- DROP order respects FK cascades — child tables before parents (see
  `001_init_documents_chunks.down.sql`: `chunks` before `documents`).

## Adding a new migration

1. Pick the next version number — `002` (no gaps).
2. Create the paired files:
   ```bash
   touch migrations/002_<short_name>.up.sql
   touch migrations/002_<short_name>.down.sql
   ```
3. Write the SQL. Idempotent guards on every CREATE / DROP. Include the
   SPDX header (per ADR-011 I-9):
   ```sql
   -- SPDX-License-Identifier: Apache-2.0
   -- Sprint 3.X W-X-X-X: <one-line summary>.
   ```
4. Test forward + back locally:
   ```bash
   pnpm migrate:up
   pnpm migrate:status      # → 2 applied
   pnpm migrate:down
   pnpm migrate:status      # → 1 applied (002 rolled back)
   pnpm migrate:up          # → 2 applied (002 re-applied)
   pnpm migrate:up          # → 2 applied (no-op idempotency check)
   ```
5. Open a PR; CI runs `migrate:up` against an ephemeral Postgres in the
   real-infra job.

## References

- `scripts/migrate.ts` — the runner implementation (~100 LOC, TypeScript +
  `@gertsai/pg-client` raw + `typia.assert`).
- `001_init_documents_chunks.up.sql` — initial schema (documents + chunks
  + HNSW + pg_migrations).
- `001_init_documents_chunks.down.sql` — paired rollback.
- **ADR-011 §Decision E** — locked to E1 Raw SQL via Amendment 1 §A1.4
  ADI. Alternatives (E2 drizzle-kit, E3 Prisma) explicitly rejected.
- **ADR-011 Amendment 2 §A2.6** — pg@^8.13 thin wrapper
  (`pg-client.adapter.ts`) for the runner's PgClient binding.
- **ADR-011 I-3** — migration idempotency invariant.
- **ADR-011 I-15** — runner constraints (advisory lock, hard-coded path,
  typia argv, no `--file`/`--dir` overrides — CWE-22 mitigation).
- **EVID-019** — Sprint 3.11 evidence pack documenting idempotency
  verification (W-3-11-26).

## License

Apache-2.0. Same as the rest of `gertsai/shared`.
