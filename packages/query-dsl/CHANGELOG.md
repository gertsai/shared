# @gertsai/query-dsl

## 1.0.0

### Minor Changes

- d295ee8: Sprint 3.5 W-4B-3: initial release. Type-safe query constraint factories compile-validated against `Meta['indexed']`:

  - Root export: `whereField` (4 typed overloads partitioning `WhereOp` by value shape per audit fix F-T-1), `orderBy`, `limit`, `startAt`, `startAfter`, `endAt`, `endBefore`, `validateQuery`.
  - `./sql` subpath: `compileToSql<Meta>(query, table)` reference compiler — **dialect = Postgres** (positional `$1`/`$2` parameter style, `<>` rendering, jsonb `@>`/`?|` operators). Cursor constraints (`startAt`/`startAfter`/`endAt`/`endBefore`) are validated but emit no SQL in v0.1 (documented in README).

  Per ADR-005 Decision A: `noUncheckedIndexedAccess: true`; consumes `@gertsai/storage-core` workspace peer.

### Patch Changes

- Updated dependencies [d295ee8]
  - @gertsai/storage-core@1.0.0

## 0.1.0

Initial release. Type-safe query constraint factories
(`whereField`/`orderBy`/`limit`/`startAt`/`startAfter`/`endAt`/`endBefore`)
compile-validated against `Meta['indexed']`, runtime `validateQuery`, and a
reference Postgres `compileToSql` exposed at the `./sql` subpath.
