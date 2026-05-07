<div align="center">

# @gertsai/query-dsl

### Type-safe query constraint DSL for `IStorageProvider<Meta>`

Compile-validated `whereField` / `orderBy` / `limit` / cursor factories
that narrow `field` against `Meta['indexed']`, plus a
**reference Postgres** `compileToSql` exposed at the `./sql` subpath.

[![Tier](https://img.shields.io/badge/tier-2-orange?style=flat-square)](#status)
[![Build](https://img.shields.io/badge/build-tsup-blue?style=flat-square)](#status)
[![Status](https://img.shields.io/badge/status-initial-yellow?style=flat-square)](#status)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue?style=flat-square)](#license)

</div>

---

## Status

`@gertsai/query-dsl` v0.1.0 ships nine constraint factories required by
`IStorageProvider<Meta>` (`@gertsai/storage-core`) plus a reference SQL
compiler. The compiler targets **PostgreSQL** specifically — see
[Reference SQL compiler](#reference-sql-compiler-dialect--postgres) below.

The factories are: `whereField`, `orderBy`, `limit`, `limitToLast`,
`offset`, `startAt`, `startAfter`, `endAt`, `endBefore` (plus the runtime
`validateQuery` and the curried `defineQueryConstraints` helper).

Per **PRD-002 + ADR-005** the package is backend-agnostic at the type
level: `WhereConstraint<Meta, F>`, `OrderByConstraint<Meta, F>`, etc.
carry no runtime dependency on Postgres or any other backend. The
`./sql` subpath is opt-in — consumers who only build queries (and ship
them to a Firestore-like adapter, an in-memory provider, etc.) never
load the SQL string-builder code.

## Install

```bash
pnpm add @gertsai/query-dsl @gertsai/storage-core
```

`@gertsai/storage-core` is declared as a peer dependency: it provides the
`StorageMetadata<Read, Write, Indexed>` type that every constraint
factory is generic over.

## Usage

### Defining a meta type

```ts
import type { StorageMetadata } from '@gertsai/storage-core';

interface UserRead {
  uid: string;
  name: string;
  age: number;
  tags: string[];
  bio: string;
}

// `indexed` declares the literal-string subset of read-side fields the
// underlying storage promises to index. Only these fields are
// addressable by `whereField` / `orderBy` / cursor factories.
type UserMeta = StorageMetadata<
  UserRead,
  UserRead,
  'uid' | 'name' | 'age' | 'tags'
>;
```

### Building a type-safe query

Two ergonomically-equivalent forms — pick whichever reads cleanest in
your code.

#### Curried form (recommended)

`defineQueryConstraints<Meta>()` returns a bundle whose methods carry
`Meta` implicitly, so you only annotate the field literal at the call
site (and TypeScript still rejects unindexed fields):

```ts
import {
  defineQueryConstraints,
  type Query,
} from '@gertsai/query-dsl';

const q = defineQueryConstraints<UserMeta>();

const query: Query<UserMeta> = [
  q.where('name', '==', 'alice'),
  q.where('age', '>=', 18),
  q.where('tags', 'array-contains-any', ['admin', 'editor']),
  q.orderBy('age', 'desc'),
  q.startAt(100),
  q.limit(50),
];

// Compile-time errors:
q.where('bio', '==', 'hi');
//      ^^^^^ Type '"bio"' is not assignable to type '"uid" | "name" | "age" | "tags"'.

q.where('name', 'in', 'oops');
//                     ^^^^^ Argument of type 'string' is not assignable
//                           to parameter of type 'readonly unknown[]'.
```

#### Standalone factory form

If you'd rather not bind `Meta` ahead of time (or want a one-off
constraint), the original factories accept the metadata generic on every
call:

```ts
import {
  whereField,
  orderBy,
  limit,
  startAt,
  type Query,
} from '@gertsai/query-dsl';

const q: Query<UserMeta> = [
  whereField<UserMeta, 'name'>('name', '==', 'alice'),
  whereField<UserMeta, 'age'>('age', '>=', 18),
  whereField<UserMeta, 'tags'>('tags', 'array-contains-any', ['admin', 'editor']),
  orderBy<UserMeta, 'age'>('age', 'desc'),
  startAt<UserMeta>(100),
  limit<UserMeta>(50),
];
```

### Runtime validation

```ts
import { validateQuery } from '@gertsai/query-dsl';

validateQuery(q);
//   throws TypeError on:
//     - empty query
//     - unknown WhereOp
//     - `in`/`not-in`/`array-contains-any` paired with a non-array value
//     - negative or non-integer limit
//     - empty cursor `values`
```

### `value` is `unknown` by design

The constraint factories use `value: unknown` rather than
`Meta['read'][F]`. This is **intentional** — see the JSDoc on
`whereField` and `WhereConstraint`:

> *value type intentionally unknown to avoid PathValue blowup; runtime
> validateQuery + DB-side enforcement.*

Indexed-access resolution on deeply nested `Read` shapes scales poorly
with TypeScript's instantiation budget; opening up `value` keeps the
package usable for `Meta['read'] = unknown` and avoids exponential
slowdown in larger consumer codebases.

## Reference SQL compiler — dialect = Postgres

The `./sql` subpath ships a reference compiler from `Query<Meta>` to a
parameterised SQL string. It is **not generic** across SQL dialects:

```ts
import { compileToSql } from '@gertsai/query-dsl/sql';

const { sql, params } = compileToSql(q, 'users');
// sql:
//   SELECT * FROM users
//     WHERE name = $1 AND age >= $2 AND tags ?| (SELECT array_agg(value::text)
//                                                  FROM jsonb_array_elements($3::jsonb))
//     ORDER BY age DESC
//     LIMIT $4
//
// params:
//   ['alice', 18, '["admin","editor"]', 50]
```

**Compiler notes** (Postgres specifics):

| Concern | Behaviour |
| --- | --- |
| Parameter style | `$1`, `$2`, ... (Postgres / `pg`-driver style — NOT `?`) |
| `!=` rendering | Emitted as `<>` to match canonical Postgres output |
| `array-contains` | jsonb `@>` containment against a singleton-array literal |
| `array-contains-any` | jsonb `?\|` against an array key list |
| Cursor constraints | `startAt` / `startAfter` / `endAt` / `endBefore` are accepted by `validateQuery` but emit no SQL in the v0.1 reference compiler — fall back to client-side slicing or layer your own paginator |
| Identifier safety | Both the table name and every constraint `field` MUST match `^[A-Za-z_][A-Za-z0-9_]*$`; otherwise `TypeError` is thrown to prevent SQL injection (table / column names are not parameterisable in standard SQL) |
| Isolation | The compiler emits no `BEGIN` / `COMMIT`; callers wrapping the SQL in a `SERIALIZABLE` transaction must handle `40001 serialization_failure` retry themselves |

The compiler targets the schema produced by the v0.1
`@gertsai/pg-client/storage` `PgStorageProvider`. A future MySQL / SQLite
backend should ship its own subpath compiler
(`@gertsai/query-dsl/sql-mysql`, etc.) rather than retrofitting
parameter-style switches into this one.

## API surface

| Export | Source | Purpose |
| --- | --- | --- |
| `whereField<Meta, F>(field, op, value)` | root | Equality / range / `in` / array constraint factory (4 overloads partition `WhereOp` by value shape). |
| `orderBy<Meta, F>(field, dir?)` | root | Sort by an indexed field; defaults to `'asc'`. |
| `limit<Meta>(n)` | root | Cap the number of returned rows. |
| `limitToLast<Meta>(n)` | root | Take the last `n` rows of the ordered set; `compileToSql` rejects this — see Limitations. |
| `offset<Meta>(n)` | root | Skip the first `n` rows of the ordered set; rendered as Postgres `OFFSET $N`. |
| `startAt<Meta>(...values)` / `startAfter<Meta>` | root | Inclusive / exclusive lower-bound cursors. |
| `endAt<Meta>(...values)` / `endBefore<Meta>` | root | Inclusive / exclusive upper-bound cursors. |
| `validateQuery<Meta>(query)` | root | Runtime sanity check; throws `TypeError` on malformed queries. |
| `defineQueryConstraints<Meta>()` | root | Curried bundle that captures `Meta` once and exposes `where` / `orderBy` / `limit` / `limitToLast` / `offset` / cursor methods. |
| `BoundQueryConstraints<Meta>` | root | Return type of `defineQueryConstraints`. |
| `WhereOp`, `Direction`, `WhereConstraint`, `OrderByConstraint`, `LimitConstraint`, `LimitToLastConstraint`, `OffsetConstraint`, `StartAtConstraint`, `StartAfterConstraint`, `EndAtConstraint`, `EndBeforeConstraint`, `QueryConstraint`, `Query` | root | Public type surface. |
| `compileToSql<Meta>(query, table)` | `./sql` | Reference Postgres SQL compiler — returns `{ sql, params }`. |
| `CompiledSql` | `./sql` | Output type of `compileToSql`. |

## Design notes

- **Single type variable in unions** (SPEC-008 F-T-6). The discriminated
  union `QueryConstraint<Meta>` keeps `Meta['indexed']` as a single
  `F` parameter inside each variant, preventing the union from
  distributing into one branch per indexed-field literal — which would
  otherwise blow up the type-checker's instantiation budget.
- **Subpath split for SQL** (SPEC-008 F-A-4). The Postgres compiler
  lives at `./sql` so consumers without a SQL backend (Firestore,
  in-memory, custom adapter) never carry the string-builder code in
  their bundle. `tsup` produces independent `dist/index.{js,cjs,d.ts}`
  and `dist/sql.{js,cjs,d.ts}` chunks.
- **`noUncheckedIndexedAccess`** (SPEC-008 F-T-9). The package's
  `tsconfig.json` enables this flag — relevant when iterating the
  positional `params: unknown[]` array; we never read by index without a
  prior `push`.

## Limitations

- **AND-only composition.** Constraints in a `Query<Meta>` are joined with
  `AND` semantics — there is no `or()` / `not()` factory in v0.1. If you
  need disjunction, run multiple queries client-side and merge, or extend
  the union via module-augmentation in your downstream package.
- **Cursor SQL no-op for `compileToSql`.** `startAt` / `startAfter` /
  `endAt` / `endBefore` validate at runtime but the reference Postgres
  compiler emits no SQL for them — fall back to `orderBy` + `offset` +
  `limit` for paging, or layer your own cursor compiler on top.
- **`limitToLast` unsupported by `compileToSql`.** The reference Postgres
  compiler **throws** when it encounters `limitToLast`. Reverse the
  leading `orderBy` direction and use `limit(n)` instead, or emit it
  only against backends that handle it natively.
- **Indexed values are typed `unknown`.** Per F-T-1, `value` on
  `whereField` is `unknown` (not `Meta['read'][F]`) to keep type-checking
  budget under control on deep `Read` shapes. Validate at runtime via
  `validateQuery` and lean on DB-side enforcement for shape correctness.

## Migration from Orchestra `orchlab/storage/queryConstraints`

| Orchestra | `@gertsai/query-dsl` | Notes |
| --- | --- | --- |
| `where(field, op, value)` | `whereField(field, op, value)` | Renamed for clarity — `where` was reserved for the curried bundle method. |
| `QueryConstraint.type` | `QueryConstraint.kind` | Matches the standard TS discriminated-union convention. |
| `Meta['compare'][F]`-typed `value` | `unknown` (per F-T-1) | Avoids `PathValue`-style instantiation blowup on deep shapes. |
| `ValidQueryConstraints` (Firestore type rules) | `validateQuery()` runtime | Type-level rule encoding not ported; runtime validation covers the same surface. |
| `[]` auto-fix UUID sentinel for `in` / `not-in` | strict `[]` rejected | Cleaner contract — empty arrays now throw at compile time and runtime. |
| `limitToLast(n)` | `limitToLast(n)` *(NEW Sprint 3.5.1)* | Validates at runtime; `compileToSql` rejects — reverse `orderBy` + use `limit`. |
| `offset(n)` | `offset(n)` *(NEW Sprint 3.5.1)* | Validates at runtime; `compileToSql` emits `OFFSET $N`. |
| `and()` / `or()` composite | not yet supported | Future enhancement — see Limitations. |

## Compatibility

| Runtime | Minimum | Notes |
| --- | --- | --- |
| Node | **22 LTS** | Workspace-wide standard; `crypto.randomUUID` not used here, but lockfile-locked to Node 22+. |
| TypeScript | **5.0+** | Uses `satisfies`, `const T extends ...` curry helper, discriminated-union narrowing on `kind`. |
| Peer `@gertsai/storage-core` | `^0.1.0` | Provides `StorageMetadata` — required at type level only. |

## Troubleshooting / FAQ

- **"`whereField` rejects my literal field name."** Make sure it appears
  in `Meta['indexed']` — the third generic argument to `StorageMetadata`.
  Non-indexed fields are intentionally compile-blocked to mirror the
  underlying storage's index promise.
- **"`compileToSql` throws on `limitToLast`."** That is the documented
  contract — see Limitations. Reverse the leading `orderBy` direction
  and use `limit(n)` to express the same intent against Postgres.
- **"`validateQuery` accepts my query but the SQL output looks wrong."**
  `validateQuery` enforces *shape* (op-vs-value matching, integer
  ranges, non-empty cursor arrays) but not *semantics* (e.g. cursor
  constraints not emitted as SQL). Cross-check against the Limitations
  list and inspect the `params` array.

## Related

- **PRD-002** + **ADR-005** — Wave 4B storage layer architecture.
- **`@gertsai/storage-core`** — provides `StorageMetadata<Read, Write, Indexed>`.
- **`@gertsai/pg-client/storage`** (Wave 4B Phase B) — consumes
  `compileToSql` to back `PgStorageProvider`.
- **Orchestra `orchlab/storage/src/operations/queryConstraints/*`** — source mirror.

## License

[Apache-2.0](./LICENSE) — see [LICENSE](./LICENSE).
