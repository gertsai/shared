---
"@gertsai/storage-core": minor
"@gertsai/entity-storage": minor
---

Optimistic concurrency (`update_version`/ETag) + gate-denial observability:

- `storage-core`: `VersionConflictError` — the caller-visible 409-class error carrying `{path, id, expected, actual}`; distinct from `TransactionConflictError` (engine-level serialization) and `WriteRuleDenied` (authorization).
- `storage-core`: `WriteConcurrencyOpts` — `update()` on `IStorageProvider`, `IBatchRunner`, and `ITransactionRunner` accept an optional `expectedVersion` precondition.
- `entity-storage`: create stamping seeds `update_version: 1`; every stamped update/delete carries the version bump and the CAS precondition through to the provider, which owns the atomic increment.
- `entity-storage`: `assertWriteAllowed`/`assertPendingWrites` evaluate `expectedVersion` against committed state — a stale ETag fails semantically at the gate AND atomically at the write (`WHERE update_version = $n`), closing the read→write race.
- `entity-storage`: `WriteDenialObserver` + `onDenied` gate option — every denial (`WriteRuleDenied` or `VersionConflictError`) is reported once with `{path, verb, actionType}` context for metrics; observer failures are swallowed (fire-and-forget, instrumentation can never break the gate).
- `entity-storage`: `update_version` joins the protected-field set — callers cannot stamp or smuggle it; the provider owns the counter.
