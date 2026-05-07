---
'@gertsai/storage-core': minor
---

Sprint 3.5 W-4B-1: initial release. Backend-agnostic `IStorageProvider<Meta>` interface per ADR-005 Decision A — abstract storage abstraction with capability flags, runner-pattern transactions/batches, generic `StorageMetadata<Read, Write, Indexed extends keyof Read & string>`, optional listener methods (throw `ListenersNotSupportedError` when `capabilities.listeners=false`), `storageProviderIdentifier` DI token.

Public API:
- `StorageMetadata`, `StorageCapabilities`, `Query<Meta>` types
- `IStorageProvider<Meta>`, `IBatchRunner<Meta>`, `ITransactionRunner<Meta>` interfaces
- `defineStorageMetadata` curried helper preserving literal tuples
- `ListenersNotSupportedError`, `TransactionConflictError` classes
- `storageProviderIdentifier` DI token
