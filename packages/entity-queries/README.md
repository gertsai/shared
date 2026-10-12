<div align="center">

# @gertsai/entity-queries

### Validated entity read-path over `IStorageProvider<Meta>`

`loadOne` / `loadPage` / `loadUids` / `loadCount` — one choke point that
applies **guard → safe-query policy → soft-delete lifecycle → provider
→ strip**, so REST, WS, and queue consumers cannot drift apart in what
they authorize or expose.

[![License](https://img.shields.io/badge/license-Apache--2.0-blue?style=flat-square)](#license)

</div>

---

## Why

Port of Orchestra's `sdk-admin/entityQueries`. In Orchestra every read
that crosses a trust boundary goes through `loadEntitiesPage`: scope
resolution, per-document access assertions, `buildSafeQuery`
(operator whitelist, pinned `space_uid`, `MAX_LIMIT` cap), and a
projection that strips internal fields (`update_action`, embeddings)
before rows reach the wire.

The pieces already existed but were scattered: `validateQuery` +
`QueryCapabilities` live in `@gertsai/query-dsl`, the tombstone rule in
`@gertsai/entity-audit`, and every app rewrote the glue ad hoc — which
is exactly how embeddings once leaked through a path that skipped the
provider. This package is the glue, once.

## Usage

```ts
import {
  loadPage,
  loadOne,
  loadCount,
  SCALAR_WHERE_OPS,
  DEFAULT_SERVER_FIELDS,
} from '@gertsai/entity-queries';

const page = await loadPage({
  reader: cardsProvider,            // any IStorageProvider<Meta>
  path: 'cards',
  constraints: clientQuery,          // untrusted input — sanitized
  policy: {
    allowedOps: SCALAR_WHERE_OPS,    // no 'in'/'array-contains-*' for clients
    allowedFields: new Set(['board_id', 'list_id', 'position']),
    pinnedFields: { board_id: scope.boardId }, // server-owned scope pin
    maxLimit: 200,
  },
  strip: DEFAULT_SERVER_FIELDS,      // 'update_action' never leaves
  guard: ({ path, constraints }) => assertCanRead(session, path, constraints),
});
```

Pipeline order (each stage runs for every call):

1. **guard** — authz hook, throws to deny; sees path + caller's
   constraints (+ `id` for `loadOne`), runs before storage is touched.
2. **sanitizeConstraints** — `validateQuery` shape check, then
   `allowedOps` / `allowedFields` whitelists (throws `TypeError` naming
   the rejected constraint index). `limit` is clamped to `maxLimit`
   (default 1000) or injected when absent.
3. **pinnedFields** — appended as `where field == value` AFTER
   validation; the client cannot remove them, and a conflicting pin
   yields zero rows rather than widened access.
4. **lifecycle** — `entity_status != 'deleted'` prepended unless
   `lifecycle: false` (restore flows, admin views).
5. **stripFields** — rows are copied, never mutated (providers may
   return references into an internal cache).

## Exports

| Export                   | Purpose                                             |
| ------------------------ | --------------------------------------------------- |
| `loadOne`                | `getDoc` + lifecycle + strip (+ guard `id`)         |
| `loadPage`               | `getDocs` with the full pipeline                    |
| `loadUids`               | `loadPage` projected to string ids                  |
| `loadCount`              | `count` with the same query (`RowCounter` readers)  |
| `getLive` / `listLive`   | Lifecycle-filtered low-level reads                  |
| `liveConstraint`         | The tombstone predicate as a query-dsl `where`      |
| `isLive`                 | Row-level tombstone check                           |
| `sanitizeConstraints`    | Policy validation standalone                        |
| `SafeQueryPolicy`        | `allowedOps`/`allowedFields`/`pinnedFields`/`maxLimit` |
| `SCALAR_WHERE_OPS`       | `==` `!=` `<` `<=` `>` `>=` — untrusted default     |
| `ALL_WHERE_OPS`          | Every op the DSL defines                            |
| `DEFAULT_SERVER_FIELDS`  | `['update_action']`                                 |
| `stripFields`/`stripRows`| Projection helpers (copy, never mutate)             |
| `RowReader`/`RowCounter` | Minimal structural provider contracts               |
| `ReadGuard`              | `(ctx) => void \| Promise<void>` authz hook         |

## Design notes

- `RowReader` is deliberately structural (`getDoc`/`getDocs`) — any
  `IStorageProvider<Meta>` satisfies it by method bivariance, keeping
  the loaders Meta-agnostic with no adapter casts.
- The policy layer is a *trust* boundary, orthogonal to
  `QueryCapabilities` (a *backend* boundary): pass both — capabilities
  to `validateQuery` where backend parity matters, `SafeQueryPolicy`
  here for authorization.
- `lifecycle: false` is the deliberate escape hatch — the tombstone
  filter is the default, not a wall.
