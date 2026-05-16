---
'@gertsai/pg-client': minor
---

Wave 12.B-fix-2 — close HIGH data-integrity finding (EVID-044).

**Problem:** `PgBatchRunner._apply` iterated queued ops sequentially
without `BEGIN`/`COMMIT`. A failure on the Nth op left ops 0..N-1
committed in the database; ops N+1..M never ran. The
`capabilities.batches: true` flag was effectively false-positive
about atomicity.

**Fix:** `_apply()` now wraps all ops in `BEGIN ... COMMIT;` with
`ROLLBACK` on any failure. Empty batches short-circuit early (no
spurious `BEGIN`/`COMMIT` round-trip). When `ROLLBACK` itself fails
(connection torn down), the rollback error is attached to the
thrown error as `rollbackError` for diagnostic purposes.

`capabilities.batches: true` is now honest — atomic.

`runTransaction` is untouched and uses an independent `_flush` code
path — there is no risk of nested `BEGIN`.

**Tests:** existing "queues ops" test updated to assert `BEGIN`/
`COMMIT` envelope; +2 new tests (empty-batch no-op, failure-mid-batch
→ ROLLBACK + rethrow). 37/37 total pass.

**Consumer impact:** `runBatch` return type unchanged. Thrown errors
may now carry an additive `rollbackError` field if ROLLBACK fails.
Callers reading `err.message` continue to work; callers wanting
rollback diagnostics can read `(err as { rollbackError?: unknown })
.rollbackError`.

Refs: PRD-030, RFC-021, EVID-044.
