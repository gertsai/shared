# @gertsai/pg-client

Agnostic PostgreSQL client interface for the `@gertsai/*` monorepo.

Defines a minimal 3-method `PgClient` shape that any concrete client
(Prisma, Drizzle, raw `pg`, postgres.js, etc.) can satisfy through
structural typing. Consumers of `@gertsai/*` packages depend on this
interface, not on a specific ORM.

> Per ADR-004 (I-3) + ADR-011 (I-1, I-2): this package has **zero**
> runtime dependencies on any specific Postgres driver/ORM. Adapter to
> a concrete client is user responsibility.

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

## License

Apache-2.0
