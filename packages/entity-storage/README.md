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
| `STORAGE_EVENTS` | const | `entity-created`, `entity-updated`, `entity-deleted`, `entity-restored`, `destroyed`. |
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
| `entity-restored` | `{ path, id, data }` | Emitted after `restore(...)` reverses a soft-delete. |
| `destroyed` | — | Emitted once on first `$destroy()` call (idempotent). |

## Capabilities + listener wrappers

`BaseEntityStorageService.onDocumentSnapshot()` /
`onCollectionSnapshot()` throw `ListenersNotSupportedError` when the
underlying provider reports `capabilities.listeners === false` (e.g. SQL
adapters). Consumers can branch on `service.capabilities.listeners`
before subscribing.

`InMemoryStorageProvider` reports
`{ listeners: true, transactions: true, batches: true }` so it covers
every test path.

## Soft-delete semantics

`delete(uid)` calls `provider.update(...)` (NOT `provider.delete`) with
the `buildDataForDelete()` audit fields. The record stays on disk,
`status` becomes `'deleted'`, and `deleted_*` is stamped. `restore(uid)`
clears the triplet and flips `status` back to `'created'`.

To **hard-delete** at the storage layer, call `provider.delete(...)`
directly — `BaseEntityStorageService` intentionally does not expose this
to keep audit-trail invariants intact.

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

## License

Apache 2.0
