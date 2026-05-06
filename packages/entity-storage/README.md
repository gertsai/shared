# @gertsai/entity-storage

Session-aware audit-stamped CRUD wrapper around `IStorageProvider` from
`@gertsai/storage-core`, plus a fully-featured `InMemoryStorageProvider`
test fixture. Backend-agnostic.

Mirrors Orchestra `orchlab/storage`'s `BaseEntityStorageService` patterns
with the following dependencies stripped per **ADR-005 Decision B**:

- No `@orchlab/firelord` / Firestore types — provider is the
  backend-agnostic `IStorageProvider<Meta>` from
  [`@gertsai/storage-core`](../storage-core).
- No DI container lookup — `provider` and `session` are constructor args.
- No nested-collection tuple — `path` is a single string.
- Audit builders come from
  [`@gertsai/entity-audit`](../entity-audit) (backend-agnostic
  `Timestamp` interface, no `serverTimestamp()`).

## Install

```sh
pnpm add @gertsai/entity-storage @gertsai/storage-core @gertsai/entity-audit @gertsai/session
```

## Quickstart

```ts
import { Session } from '@gertsai/session';
import {
  BaseEntityStorageService,
  InMemoryStorageProvider,
  STORAGE_EVENTS,
  type IStorageProvider,
  type StorageMetadata,
} from '@gertsai/entity-storage';

interface UserData {
  name: string;
  email: string;
}
type UserMeta = StorageMetadata<UserData, UserData, 'name' | 'email'>;

class UsersStorage extends BaseEntityStorageService<UserMeta> {
  constructor(provider: IStorageProvider<UserMeta>, session: Session) {
    super({ provider, session, path: 'users' });
  }
}

const provider = new InMemoryStorageProvider<UserMeta>();
const session = new Session({
  operatorUuid: 'op-1',
  operatorType: 'web',
  tokenGetter: async () => 'tok',
  dialog: { confirm: async () => true, alert: () => {}, error: () => {} },
  clientPlatform: 'web',
  clientVersion: '1.0.0',
});

const users = new UsersStorage(provider, session);
users.on(STORAGE_EVENTS.ENTITY_CREATED, ({ id }) => console.log('created', id));

const { id } = await users.set({ name: 'Alice', email: 'a@example.com' });
await users.update(id, { name: 'Alice B.' });
await users.delete(id);   // soft-delete
await users.restore(id);  // un-delete
```

## API surface

| Export | Kind | Notes |
|---|---|---|
| `BaseEntityStorageService<Meta, UpdateActionTypes>` | abstract class | `EventEmitter` + `IDestroyable`. Wraps `IStorageProvider<Meta>` with audit-stamped CRUD + soft-delete + listener wrappers. |
| `InMemoryStorageProvider<Meta>` | class | Map-backed test fixture. Full listener / batch / transaction support. |
| `STORAGE_EVENTS` | const | `entity-created`, `entity-updated`, `entity-deleted`, `entity-restored`, `entity-destroyed`, `destroyed`. |
| `StorageLogger` (re-export) | interface | Pluggable logger (`debug`/`info`/`warn`/`error`) accepted via `BaseEntityStorageServiceOpts.logger`. Default `noopStorageLogger`. |
| `MutationRoutingOpts<Meta>` | interface | Per-method `{ batch?, transaction? }` knob — route a mutation onto a caller-supplied audited runner instead of committing immediately. |
| `ListenersNotSupportedError` | class | Thrown by listener wrappers when provider reports `capabilities.listeners === false`. |
| `TransactionConflictError` | class | Thrown by `runTransaction` on optimistic-concurrency violation. |

(Until Wave 4B Phase B lands, the storage-core types
(`IStorageProvider`, `StorageMetadata`, etc.) are temporarily re-exported
from a local stub. The public surface is unchanged.)

## Events

| Event | Payload | Notes |
|---|---|---|
| `entity-created` | `{ path, id, data }` | Emitted after `set(...)` succeeds. |
| `entity-updated` | `{ path, id, data }` | Emitted after `update(...)` succeeds. The payload `data` is the partial **with audit triplet** that was forwarded to the provider. |
| `entity-deleted` | `{ path, id, data }` | Emitted after a soft-`delete(...)` succeeds. The record is **not removed** from storage — `status` flips to `'deleted'` and the `deleted_*` triplet is stamped. |
| `entity-restored` | `{ path, id }` | Emitted after `restore(...)` reverses a soft-delete. |
| `entity-destroyed` | `{ path, id }` | Emitted after `destroy(...)` hard-deletes the row via `provider.delete(...)`. Distinct from `entity-deleted` (soft). |
| `destroyed` | — | Emitted once on first `$destroy()` call (idempotent). Service-lifecycle event, not entity. |

## Capabilities + listener wrappers

`BaseEntityStorageService.onDocumentSnapshot()` /
`onCollectionSnapshot()` throw `ListenersNotSupportedError` when the
underlying provider reports `capabilities.listeners === false` (e.g. SQL
adapters). Consumers can branch on `service.capabilities.listeners`
before subscribing.

`InMemoryStorageProvider` reports
`{ listeners: true, transactions: true, batches: true }` so it covers
every test path.

## Soft-delete vs. hard-delete

Two distinct mutation methods, audit semantics differ:

| Method | Provider call | Audit | Event | Reversible |
|---|---|---|---|---|
| `delete(uid)` | `provider.update(...)` | `deleted_*` triplet + `status='deleted'` | `entity-deleted` | yes — via `restore(uid)` |
| `destroy(uid)` | `provider.delete(...)` | none — row is gone | `entity-destroyed` | no |

```ts
await users.delete(id);   // soft-delete: row stays, status flips
await users.restore(id);  // un-delete works
await users.destroy(id);  // hard-delete: row physically removed, no audit trail
```

`destroy(uid)` after `destroy(uid)` (or any provider that already
removed the row) silently no-ops at the InMemory provider — concrete
adapters MAY raise their own backend-level "row not found" errors;
behaviour is provider-defined.

## Transactions

`InMemoryStorageProvider.runTransaction(fn)` tracks the `_version`
counter of every doc read inside the transaction. On commit it re-checks
the live versions; mismatch throws `TransactionConflictError` and the
transaction's writes are dropped. This mirrors Firestore's optimistic
concurrency.

```ts
await provider.runTransaction(async (tx) => {
  const cur = await tx.get('users', 'u1');  // version observed
  tx.update('users', 'u1', { age: (cur?.age ?? 0) + 1 });
});
```

If another caller mutates `users/u1` between the `tx.get` and the
implicit commit, `runTransaction` throws.

## Compatibility

| Runtime | Minimum | Notes |
|---|---|---|
| Node | **22 LTS recommended** | Uses `globalThis.crypto.randomUUID()` for default uid generation. |
| `@gertsai/session` | `workspace:^` | Session identity used by audit builders. |
| `@gertsai/entity-audit` | `workspace:^` | Builder functions for audit fields. |
| `@gertsai/storage-core` | `workspace:^` (peer, optional during Wave 4B Phase A) | Real package lands in Phase B; types are stubbed locally until then. |
| `@gertsai/di` | `workspace:^` | `IDestroyable` contract. |

## Migration from Orchestra `orchlab/storage`

| Orchestra | `@gertsai/entity-storage` | Notes |
| --- | --- | --- |
| `BaseEntityStorageService<Meta>` | `BaseEntityStorageService<Meta, UpdateActionTypes?>` | Constructor takes `provider` + `session` explicitly — no DI lookup. |
| Nested-collection tuple path | Single-string `path` | Subclass sets `path = 'users'` once; nested collections expressed in the path itself. |
| `diContainer.$sd.get(storageProviderIdentifier)` | `constructor.provider` | Explicit dependency-passing per ADR-005 Decision B. |
| `serverTimestamp()` | Generic `Timestamp` interface | `TimestampProvider` is injectable so the package stays backend-agnostic. |
| `EventEmitter` declared but never emits | Real `STORAGE_EVENTS` emit on every CRUD | Five domain events plus the lifecycle `destroyed` event. |
| `destroy(uid)` hard-deleted by default | Soft-delete is the default via `delete()`; `destroy(uid)` is the explicit hard-delete | Audit semantics differ — see "Soft-delete vs. hard-delete". |

## Troubleshooting / FAQ

- **"`update(uid, ...)` throws `Cannot update an already-deleted row`."**
  Soft-deleted rows refuse audit-stamped `update` to keep the audit trail
  consistent — call `restore(uid)` first, or use `destroy(uid)` if the row
  should be gone for good.
- **"Snapshot listener never fires."** Check
  `service.capabilities.listeners` — SQL-backed providers report
  `false` and the listener wrappers throw `ListenersNotSupportedError`.
  Use `InMemoryStorageProvider` for tests that need real-time events.
- **"`runTransaction` keeps retrying without progress."** The wrapper
  does not retry by default — wrap your call in a bounded `withRetry`
  helper and surface non-conflict errors so they don't get masked.

## License

[Apache-2.0](./LICENSE) — see [LICENSE](./LICENSE).
