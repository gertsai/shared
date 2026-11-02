# @gertsai/storage-core CHANGELOG

## 3.0.0

### Major Changes

- 3c6a4b7: Repair write readiness and the original write-rules changes: `storage-core` updates the write contract, `entity-storage` corrects shallow literal-key patches and same-service audited routing, and `pg-client` advances its version/CAS semantics and `SetWriteOpts` contract. `query-dsl` adds qualified identifier support. Also stabilize single-write `get`/`getAfter` reads and reuse stamped lifecycle payloads across evaluation and persistence. `entity-storage` now owns deep snapshots of claims and mutation payloads and closes audited mutation runners when their user callbacks settle, before deferred policy checks.
  
  Resolve PostgreSQL query fields from JSONB payloads with collision-free positional parameters. Correct `array-contains-any` for string, numeric, and null candidates while preserving flat-column compiler consumers.
  
  Keep the original authorization action and optimistic-concurrency precondition across asynchronous reads and policy evaluation, so caller mutations cannot change the authorized journal or remove a stale-write guard. Resolve only explicitly owned action and wildcard predicates; inherited object methods cannot authorize writes.
  
  **Breaking default:** provider `set(path, id, data, opts?)`, including raw batch and transaction runners, now merges with an existing document by default instead of overwriting it. Pass `{ merge: false }` on those provider/runner APIs to retain overwrite semantics. `BaseEntityStorageService.set` follows the provider default and does not expose a merge option; raw provider runners bypass service audit stamping and write rules.

### Minor Changes

- c8a19b9: Optimistic concurrency (`update_version`/ETag) + gate-denial observability:
  
  - `storage-core`: `VersionConflictError` — the caller-visible 409-class error carrying `{path, id, expected, actual}`; distinct from `TransactionConflictError` (engine-level serialization) and `WriteRuleDenied` (authorization).
  - `storage-core`: `WriteConcurrencyOpts` — `update()` on `IStorageProvider`, `IBatchRunner`, and `ITransactionRunner` accept an optional `expectedVersion` precondition.
  - `entity-storage`: create stamping seeds `update_version: 1`; every stamped update/delete carries the version bump and the CAS precondition through to the provider, which owns the atomic increment.
  - `entity-storage`: `assertWriteAllowed`/`assertPendingWrites` evaluate `expectedVersion` against committed state — a stale ETag fails semantically at the gate AND atomically at the write (`WHERE update_version = $n`), closing the read→write race.
  - `entity-storage`: `WriteDenialObserver` + `onDenied` gate option — every denial (`WriteRuleDenied` or `VersionConflictError`) is reported once with `{path, verb, actionType}` context for metrics; observer failures are swallowed (fire-and-forget, instrumentation can never break the gate).
  - `entity-storage`: `update_version` joins the protected-field set — callers cannot stamp or smuggle it; the provider owns the counter.

## 2.0.0

### Patch Changes

- Updated dependencies [f662fa5]
  - @gertsai/di@0.3.0

## 1.0.0

### Minor Changes

- d295ee8: Sprint 3.5 W-4B-1: initial release. Backend-agnostic `IStorageProvider<Meta>` interface per ADR-005 Decision A — abstract storage abstraction with capability flags, runner-pattern transactions/batches, generic `StorageMetadata<Read, Write, Indexed extends keyof Read & string>`, optional listener methods (throw `ListenersNotSupportedError` when `capabilities.listeners=false`), `storageProviderIdentifier` DI token.

  Public API:

  - `StorageMetadata`, `StorageCapabilities`, `Query<Meta>` types
  - `IStorageProvider<Meta>`, `IBatchRunner<Meta>`, `ITransactionRunner<Meta>` interfaces
  - `defineStorageMetadata` curried helper preserving literal tuples
  - `ListenersNotSupportedError`, `TransactionConflictError` classes
  - `storageProviderIdentifier` DI token

### Patch Changes

- Updated dependencies [0755c6d]
- Updated dependencies [c19e12a]
  - @gertsai/di@0.2.0

## 0.1.0 (Unreleased)

- Initial release: IStorageProvider abstraction per ADR-005.
