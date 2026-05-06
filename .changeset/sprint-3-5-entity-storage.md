---
'@gertsai/entity-storage': minor
---

Sprint 3.5 W-4B-2: initial release. abstract `BaseEntityStorageService<Meta, UpdateActionTypes>` wraps `IStorageProvider` from `@gertsai/storage-core` with session-aware audit-stamped CRUD + soft-delete + restore. EventEmitter integration (`STORAGE_EVENTS` const-object: ENTITY_CREATED/UPDATED/DELETED/RESTORED/DESTROYED). Implements `IDestroyable` from `@gertsai/di`.

Ships `InMemoryStorageProvider<Meta>` test fixture: Map-backed store supporting full listeners, batch atomicity (clone-on-throw), transaction conflict detection (per-doc version counter → `TransactionConflictError`).

Per ADR-005 Decision A: backend-agnostic; consumes `@gertsai/{storage-core,entity,entity-audit,session,di}` as workspace peers; zero concrete backend SDK imports.
