# @gertsai/query-dsl

## 0.1.0

Initial release. Type-safe query constraint factories
(`whereField`/`orderBy`/`limit`/`startAt`/`startAfter`/`endAt`/`endBefore`)
compile-validated against `Meta['indexed']`, runtime `validateQuery`, and a
reference Postgres `compileToSql` exposed at the `./sql` subpath.
