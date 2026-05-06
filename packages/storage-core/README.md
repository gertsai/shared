# @gertsai/storage-core

Backend-agnostic `IStorageProvider<Meta>` abstraction for `@gertsai/*`.
CRUD + listeners + runner-pattern transactions/batches in a single shape;
concrete adapters live in separate packages so this library has zero
runtime dependency on Postgres, Firestore, or any other vendor SDK.

Per [PRD-002](../../.forgeplan/prds/) + [ADR-005 Decision A](../../.forgeplan/adrs/ADR-005-storage-core-architecture-abstract-istorageprovider-pg-client-as-adapter-orchestra-extraction-policy.md):

- **No backend SDK imports** in this package — `StorageMetadata<Read, Write, Indexed>`
  is a pure TypeScript envelope, not a Firestore/Firelord MetaType.
- **Listeners are non-optional** in the interface but capability-gated.
  Adapters that cannot deliver real change events advertise
  `capabilities.listeners = false` and throw `ListenersNotSupportedError`
  from the listener methods.
- **Transactions / batches** use the runner pattern — no magic globals.
- **DI integration**: `storageProviderIdentifier` token registers the
  provider with `@gertsai/di`'s `ServicesRegistry`.

## Install

```sh
pnpm add @gertsai/storage-core @gertsai/di
```

`@gertsai/di` is declared as a peer dependency. Adapters that wrap a
specific backend (e.g., `@gertsai/pg-client/storage`,
`@gertsai/entity-storage`'s `InMemoryStorageProvider`) ship in separate
packages and depend on this one.

## Public API

| Export | Kind | Notes |
|---|---|---|
| `StorageMetadata<Read, Write, Indexed>` | type | Generic envelope. Defaults: `Write = Read`, `Indexed = keyof Read & string`. |
| `defineStorageMetadata<Read>()` | curried fn | Preserves literal tuple narrowing for `indexed`. |
| `StorageCapabilities` | type | Boolean flags: `listeners`, `transactions`, `batches`. |
| `Query<Meta>` | type | Read-only constraint sequence. Concrete shapes ship in `@gertsai/query-dsl`. |
| `IStorageProvider<Meta>` | interface | The storage abstraction. CRUD + listeners + runners. |
| `IBatchRunner<Meta>` | interface | Synchronous queue-and-flush write API. |
| `ITransactionRunner<Meta>` | interface | Async reads + queued writes inside a transaction. |
| `ListenersNotSupportedError` | class | Thrown by listener methods when `capabilities.listeners = false`. |
| `TransactionConflictError` | class | Thrown by `runTransaction` on commit conflict. Callers handle retry. |
| `storageProviderIdentifier` | const | DI token for `ServicesRegistry.register` / `create`. |

## Quickstart

### Define a metadata shape

```ts
import { defineStorageMetadata } from '@gertsai/storage-core';

interface UserRead {
  id: string;
  email: string;
  age: number;
}

// Curried — first call fixes Read; second call infers the indexed tuple.
const userMeta = defineStorageMetadata<UserRead>()({
  indexed: ['id', 'email'] as const,
});
type UserMeta = typeof userMeta;
// → StorageMetadata<UserRead, UserRead, 'id' | 'email'>
```

The `as const` (or readonly tuple) on `indexed` is required to keep the
literal narrowing — without it the inferred type widens to `string[]`.

### Implement an adapter

```ts
import {
  IStorageProvider,
  StorageCapabilities,
  ListenersNotSupportedError,
} from '@gertsai/storage-core';

class MyAdapter<Meta extends StorageMetadata> implements IStorageProvider<Meta> {
  readonly capabilities = {
    listeners: false,    // <-- declare honestly
    transactions: true,
    batches: true,
  } as const satisfies StorageCapabilities;

  // ... CRUD + runners ...

  // Listeners must throw when unsupported — the interface keeps the
  // method present so call sites have a stable shape.
  onDocumentSnapshot(): () => void {
    throw new ListenersNotSupportedError(
      'MyAdapter does not implement document listeners.',
    );
  }
  onCollectionSnapshot(): () => void {
    throw new ListenersNotSupportedError(
      'MyAdapter does not implement collection listeners.',
    );
  }
}
```

### Register with DI

```ts
import { ServicesRegistry } from '@gertsai/di';
import { storageProviderIdentifier } from '@gertsai/storage-core';

const registry = new ServicesRegistry<null>();
registry.register(storageProviderIdentifier, () => new MyAdapter());

// At the consumer boundary, cast back to your specific Meta:
const provider = registry.create(
  storageProviderIdentifier,
  null,
) as unknown as IStorageProvider<UserMeta>;
```

The token resolves to a widened
`IStorageProvider<StorageMetadata<unknown, unknown, string>>` so the
single registry can serve heterogeneous Meta shapes — consumers cast at
their boundary. Apps with multiple providers (one per entity family)
should create additional named identifiers via
`createIdentifier<IStorageProvider<UserMeta>>('UserStorage')`.

### Capability-gated calls

```ts
if (provider.capabilities.listeners) {
  const off = provider.onDocumentSnapshot('users', 'u1', (doc) => {
    // ... real-time updates ...
  });
  // ... later: off();
} else {
  // fall back to polling, or skip entirely
}
```

## Listeners contract

Per [ADR-005 invariant I-4](../../.forgeplan/adrs/ADR-005-storage-core-architecture-abstract-istorageprovider-pg-client-as-adapter-orchestra-extraction-policy.md#invariants),
listener methods are **non-optional** in `IStorageProvider`. The keys are
always present so call sites have a stable shape — but adapters that
cannot deliver real change events MUST:

1. Set `capabilities.listeners` to `false` in their `as const satisfies StorageCapabilities` block.
2. Throw `ListenersNotSupportedError` from `onDocumentSnapshot` and `onCollectionSnapshot`.

This trade-off (mandatory presence, capability-gated semantics) was made
in preference to optional methods because:

- Optional methods leak `undefined` into every call site, even when the
  consumer knows the adapter supports listeners.
- Capability flags double as compile-time branchable literals when
  declared with `as const satisfies` — `if (provider.capabilities.listeners)`
  narrows on the `true`/`false` literal.
- The throw-contract is symmetric with how `transactions` and `batches`
  are handled in adapters that don't support those either.

## Transaction conflicts

`runTransaction` does not specify a retry policy. On conflict, adapters
throw `TransactionConflictError` — callers wrap with their own retry
logic:

```ts
import { TransactionConflictError } from '@gertsai/storage-core';

async function withRetry<R>(
  fn: () => Promise<R>,
  attempts = 3,
): Promise<R> {
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      if (!(err instanceof TransactionConflictError)) throw err;
      if (i === attempts - 1) throw err;
    }
  }
  throw new Error('unreachable');
}

const result = await withRetry(() =>
  provider.runTransaction(async (tx) => {
    const cur = await tx.get('users', 'u1');
    tx.update('users', 'u1', { age: (cur?.age ?? 0) + 1 });
    return cur;
  }),
);
```

Adapter-specific mappings:

| Backend | Conflict signal | Mapped to |
|---|---|---|
| Postgres (`@gertsai/pg-client/storage`) | `SQLSTATE 40001` (`serialization_failure`) | `TransactionConflictError` |
| Firestore (future adapter) | `failed-precondition` | `TransactionConflictError` |
| In-memory (`@gertsai/entity-storage`) | optimistic version mismatch | `TransactionConflictError` |

## Extending: writing a new adapter

1. Implement every method of `IStorageProvider<Meta>` — none are optional.
2. Declare `capabilities` with `as const satisfies StorageCapabilities`
   so the literal flags survive into the consumer's type.
3. For unsupported features:
   - `listeners=false` → throw `ListenersNotSupportedError`.
   - `transactions=false` → throw on `runTransaction`.
   - `batches=false` → throw on `runBatch`.
4. Map backend conflict signals to `TransactionConflictError` so callers
   can use a generic retry policy.
5. **Do not import** any vendor SDK that would defeat the abstraction
   (Firestore, Firebase, Prisma, Drizzle, raw `pg`/`mysql2`). If your
   adapter needs one, it belongs in a separate package — see
   `@gertsai/pg-client/storage` for the canonical pattern.
6. Add an SPDX header on every `.ts`:
   `// SPDX-License-Identifier: Apache-2.0`.

## Compatibility

| Runtime | Minimum |
|---|---|
| Node | **22 LTS recommended** (matches workspace tsconfig `target: ES2022`) |
| TypeScript | **5.0+** (uses `const T extends ...` curry helper, `satisfies`) |

The package itself has no DOM or browser dependency — it is pure types
plus two error classes plus a DI token. Bundles fine for browser
adapters (e.g., a future Firestore Web SDK adapter).

## Migration from Orchestra `orchlab/storage`

| Orchestra | `@gertsai/storage-core` | Notes |
| --- | --- | --- |
| Firelord `MetaType<R, W, KeyofR>` | `StorageMetadata<Read, Write, Indexed>` | Pure TypeScript envelope — no Firelord / Firestore types. |
| `IStorageProvider` (Firestore-tied) | `IStorageProvider<Meta>` | Adds a `capabilities` flag so adapters declare listener / transaction / batch support. |
| `runTransaction(fn)` returns Firestore `Transaction` | `runTransaction(fn)` returns the user value | Conflicts surface as `TransactionConflictError` instead of raw Firestore errors. |
| Listener returns `Promise<() => void>` | Returns `() => void` (sync) | Cleaner DX — no awaiting an unsubscribe. |
| `IStorageDocumentSnapshot { _uid, path, data, metadata }` | `Meta['read']` directly | Caller already knows path / id; the surrogate `_uid` lives inside `data` if needed. |
| `IStorageCollectionSnapshot { added, modified, removed }` | `Meta['read'][]` flat | Documented limitation; downstream diffing belongs to the consumer. |

## Troubleshooting / FAQ

- **"`onDocumentSnapshot` throws `ListenersNotSupportedError`."** The
  adapter declared `capabilities.listeners = false` — branch on
  `provider.capabilities.listeners` before subscribing, or fall back to
  polling. SQL-backed adapters (`@gertsai/pg-client/storage`) currently
  ship with listeners disabled.
- **"`runTransaction` keeps throwing `TransactionConflictError`."** The
  abstraction does not retry — wrap your transaction in a bounded retry
  loop (the README's `withRetry` helper is one option). Postgres
  `SQLSTATE 40001` and `40P01` both map to this error.
- **"My adapter accidentally imported `firebase-admin`."** That defeats
  the abstraction — vendor SDK dependencies must live in adapter
  packages (e.g. `@gertsai/pg-client/storage`), not in the consumer of
  `IStorageProvider<Meta>`. See the "Extending: writing a new adapter"
  section.

## License

[Apache-2.0](./LICENSE) — see [LICENSE](./LICENSE).
