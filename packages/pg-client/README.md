# @gertsai/pg-client

Agnostic PostgreSQL client interface for the `@gertsai/*` monorepo.

Defines a minimal 3-method `PgClient` shape that any concrete client
(Prisma, Drizzle, raw `pg`, postgres.js, etc.) can satisfy through
structural typing. Consumers of `@gertsai/*` packages depend on this
interface, not on a specific ORM.

> Per ADR-004 (I-3) + ADR-011 (I-1, I-2): this package has **zero**
> runtime dependencies on any specific Postgres driver/ORM. Adapter to
> a concrete client is user responsibility.

## Compatibility

| Requirement     | Version                                                                          |
| --------------- | -------------------------------------------------------------------------------- |
| Node            | ≥22 LTS                                                                          |
| Peer (root)     | (none — pure types/runtime)                                                      |
| Peer (`/storage`) | `@gertsai/storage-core` ≥0.1.0, `@gertsai/query-dsl` ≥0.1.0 (peer-optional)    |

## Install

```bash
pnpm add @gertsai/pg-client
```

## Surface

```ts
export interface PgClient {
  $queryRaw<T = unknown>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]>;
  $executeRaw(strings: TemplateStringsArray, ...values: unknown[]): Promise<number>;
  $disconnect(): Promise<void>;
}
```

The tagged-template-literal shape matches Prisma's `$queryRaw` /
`$executeRaw` so a `PrismaClient` instance is a drop-in `PgClient` via
structural typing. Other clients can wrap their native API to satisfy
the same shape.

## Usage

### Consuming the interface

```ts
import type { PgClient } from '@gertsai/pg-client';

async function findUsers(db: PgClient, role: string) {
  return db.$queryRaw<{ id: string; name: string }>`
    SELECT id, name FROM users WHERE role = ${role}
  `;
}
```

### Testing with the mock fixture

```ts
import { mockPgClient } from '@gertsai/pg-client';

const db = mockPgClient({
  queryResults: [
    { pattern: /FROM users/i, result: [{ id: '1', name: 'Ada' }] },
  ],
  executeResults: [
    { pattern: /UPDATE users/i, result: 1 },
  ],
});

const rows = await findUsers(db, 'admin');
expect(rows).toEqual([{ id: '1', name: 'Ada' }]);
expect(db.recorded).toHaveLength(1);
expect(db.recorded[0]?.kind).toBe('query');

db.reset();
```

### `MockPgClientOpts`

| Field                  | Type                                     | Default | Notes                                                  |
| ---------------------- | ---------------------------------------- | ------- | ------------------------------------------------------ |
| `queryResults`         | `Array<{ pattern: RegExp; result: T[] }>` | `[]`    | First matching pattern wins for `$queryRaw`.           |
| `executeResults`       | `Array<{ pattern: RegExp; result: n }>`  | `[]`    | First matching pattern wins for `$executeRaw`.         |
| `defaultQueryResult`   | `unknown[]`                              | `[]`    | Returned by `$queryRaw` when no pattern matches.       |
| `defaultExecuteResult` | `number`                                 | `0`     | Returned by `$executeRaw` when no pattern matches.     |

`MockPgClient` exposes `recorded: ReadonlyArray<RecordedQuery>` (snapshot
copy on each access) and a `reset()` method to clear it.

## Storage adapter (`/storage` subpath)

`PgStorageProvider` implements `IStorageProvider<Meta>` from
`@gertsai/storage-core` via raw SQL. It is shipped as an **additive**
subpath: the root `@gertsai/pg-client` surface (`PgClient`,
`mockPgClient`) is unchanged. Per ADR-005 (Decision A, I-3) + ADR-011
(I-1, I-2), adopting `/storage` is opt-in and never forces consumers
of the root surface to take on storage-core / query-dsl dependencies.

### Install

```bash
pnpm add @gertsai/pg-client @gertsai/storage-core @gertsai/query-dsl
```

`@gertsai/storage-core` and `@gertsai/query-dsl` are declared as
**peer-optional** — required only if you import from
`@gertsai/pg-client/storage`. If you only use `$queryRaw` / `$executeRaw`
/ `$disconnect`, you can omit them.

### Schema requirement

Each entity collection ("path") must be a Postgres table with the
canonical two-column shape:

```sql
CREATE TABLE users (
  id   text  PRIMARY KEY,
  data jsonb NOT NULL
);
```

The adapter writes the entity body into the `data jsonb` column and
keys it by `id text`. Path → table-name resolution defaults to
identity (a path of `users` maps to a table named `users`); use
`TableMap` to override.

### Quickstart

```typescript
import { PgStorageProvider, type TableMap } from '@gertsai/pg-client/storage';
import type { PgClient } from '@gertsai/pg-client';
import type { StorageMetadata } from '@gertsai/storage-core';
import { whereField } from '@gertsai/query-dsl';

interface UserData {
  readonly name: string;
  readonly email: string;
}
interface UserMeta extends StorageMetadata<UserData, UserData, 'name' | 'email'> {}

declare const pgClient: PgClient; // your PgClient impl (Prisma, postgres.js, ...)

const tableMap: TableMap = { users: 'app_users' }; // optional override
const provider = new PgStorageProvider<UserMeta>({ client: pgClient, tableMap });

await provider.set('users', 'u1', { name: 'Alice', email: 'a@x.com' });

const matches = await provider.getDocs('users', [
  whereField<UserMeta, 'email'>('email', '==', 'a@x.com'),
]);
```

### Capabilities

| Capability     | Status  | Note                                                                                          |
| -------------- | ------- | --------------------------------------------------------------------------------------------- |
| `listeners`    | `false` | PG `LISTEN/NOTIFY` support deferred (`onDocumentSnapshot` / `onCollectionSnapshot` throw `ListenersNotSupportedError`) |
| `transactions` | `true`  | `BEGIN` / `COMMIT` / `ROLLBACK`; SQLSTATE `40001` (serialization failure) and `40P01` (deadlock) → `TransactionConflictError` |
| `batches`      | `true`  | `runBatch` queues ops in memory and flushes them sequentially via `$executeRaw`               |

### Retry pattern for `TransactionConflictError`

`runTransaction` maps Postgres serialization-failure / deadlock errors
to `TransactionConflictError` (and `ROLLBACK`s the transaction). Wrap
calls in a bounded retry to recover transparently:

```typescript
import { TransactionConflictError } from '@gertsai/storage-core';

async function withRetry<T>(fn: () => Promise<T>, max = 3): Promise<T> {
  for (let attempt = 0; attempt < max; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof TransactionConflictError && attempt < max - 1) continue;
      throw err;
    }
  }
  throw new Error('unreachable');
}

await withRetry(() =>
  provider.runTransaction(async (tx) => {
    const current = await tx.get('users', 'u1');
    tx.set('users', 'u1', { ...(current ?? { name: '', email: '' }), email: 'b@x.com' });
  }),
);
```

### `TableMap` (path → table-name override)

When a path differs from the physical table name (versioning, schema
prefix, multi-tenant naming), pass `tableMap`:

```typescript
const tableMap: TableMap = {
  users:  'app_users_v2',
  orders: 'commerce_orders',
};
const provider = new PgStorageProvider<UserMeta>({ client: pgClient, tableMap });
```

Both keys (paths) and values (table names) must match
`/^[a-zA-Z_][a-zA-Z0-9_]*$/`. Invalid override values throw at
constructor time; invalid paths without overrides throw on first use.

### Migration from existing root-API users

- **You only use `$queryRaw` / `$executeRaw` / `$disconnect`.** Nothing
  changes — root surface is unchanged. Skip `/storage`.
- **You want the `IStorageProvider` adapter.** Add
  `@gertsai/storage-core` and `@gertsai/query-dsl` to your
  `dependencies` and import from `@gertsai/pg-client/storage`. Your
  existing root-surface usage continues to work alongside the adapter.

### Migration from Orchestra Postgres patterns

| Orchestra Postgres pattern | `@gertsai/pg-client/storage` | Notes |
| --- | --- | --- |
| Direct `pg`-driver `Client` wrapped in a Moleculer service | `PgClient` interface + `PgStorageProvider` adapter | Strict zero-ORM / zero-driver imports per ADR-011 I-3. |
| Hardcoded entity table names | `TableMap` path → table override | Path-to-table resolution defaults to identity; override per consumer. |
| Manual SQL string concatenation | `compileToSql` from `@gertsai/query-dsl` | Specification → parameterised SQL via the reference compiler. |
| Direct `pg.serializationFailure` checks | `TransactionConflictError` via SQLSTATE `40001`/`40P01` | Caller-side retry policy; no implicit retries. |

### Future work

PG `LISTEN/NOTIFY`-backed listener support is deferred to a later
sprint. Until then, `onDocumentSnapshot` and `onCollectionSnapshot`
throw `ListenersNotSupportedError`. For listener-backed reactivity
today, use `InMemoryStorageProvider` from `@gertsai/entity-storage`
(capabilities `{ listeners: true }`).

## Troubleshooting / FAQ

- **"My Prisma client doesn't satisfy `PgClient` structurally."** The
  `$queryRaw` / `$executeRaw` shape on Prisma is identical, but legacy
  versions returned `Promise<{ count: number }>` from `$executeRaw`.
  Wrap with `(c) => ({ ...c, $executeRaw: (...args) => c.$executeRaw(...args).then((r) => typeof r === 'number' ? r : r.count) })` if your version diverges.
- **"`PgStorageProvider` throws `'invalid SQL identifier'` on first
  call."** Both `path` (collection name) and `tableMap` values must
  match `^[A-Za-z_][A-Za-z0-9_]*$`. Quoted identifiers and dotted
  schema-prefixed names are not allowed in v0.1 — re-name your table
  or use a view.
- **"`runTransaction` reports `TransactionConflictError` under low
  concurrency."** Postgres reports `40001` / `40P01` from contention on
  shared rows OR from index updates that overlap. Check for missing
  indexes on the `where` columns, then wrap the call in `withRetry`.

## License

[Apache-2.0](./LICENSE) — see [LICENSE](./LICENSE).
