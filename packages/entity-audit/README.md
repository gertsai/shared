# @gertsai/entity-audit

Audit trail types and builder functions for backend-agnostic entity mutation tracking.

Provides:

- `MutationMarks` — created/updated/deleted timestamps + operator uuid + platform.
- `UpdateAction` + `UpdateActionMap` — extensible (via module augmentation) catalogue
  of business-meaningful update actions with literal-narrowed `type`.
- `buildDataForSet` / `buildDataForUpdate` / `buildDataForDelete` / `buildDataForRestore`
  — pure builder functions stamped with the `Session` operator identity. Every
  mutation builder writes an `update_action` audit-log entry with canonical
  `'create' | 'delete' | 'restore'` lifecycle types or the caller-supplied
  business action.
- `Timestamp` — generic `{ seconds, nanoseconds }` shape (replaces Firelord
  `ServerTimestamp`); pluggable `TimestampProvider` for deterministic tests.

Mirrors Orchestra `orchlab/core/src/{meta,mixins}.ts` patterns 1:1 with all
Firestore / Firelord couplings stripped per ADR-005.

## Install

```sh
pnpm add @gertsai/entity-audit
```

Peer: `@gertsai/session` (provides the `Session` operator identity passed
to every builder).

## Usage

```ts
import { Session } from '@gertsai/session';
import {
  buildDataForSet,
  buildDataForUpdate,
  buildDataForDelete,
  buildDataForRestore,
} from '@gertsai/entity-audit';

// Initial creation (caller owns _uid generation).
const created = buildDataForSet({ name: 'Alice' }, session, { _uid: 'usr_1' });

// Plain partial update (no business action recorded).
const patch = buildDataForUpdate({ name: 'Bob' }, session);

// Update with a business-meaningful audit action (recommended for events
// that should appear in audit reports).
const invited = buildDataForUpdate(
  { invited: true },
  session,
  { action: { type: 'invite_sent', params: { email: 'a@b.com' } } },
);

const tomb = buildDataForDelete(session);   // status -> 'deleted'
const live = buildDataForRestore(session);  // status -> 'created'
```

### Custom timestamp source

```ts
const fixedProvider = () => ({ seconds: 1700000000, nanoseconds: 0 });
const created = buildDataForSet(data, session, {
  _uid: 'x',
  timestampProvider: fixedProvider,
});
```

### Extending the action catalogue

```ts
declare module '@gertsai/entity-audit' {
  interface UpdateActionMap {
    invite_sent: { type: 'invite_sent'; params: { email: string } };
    transfer:    { type: 'transfer';    params: { amount: number } };
  }
}
// `UpdateActionType` now narrows to 'invite_sent' | 'transfer'; opts.action.type
// on buildDataForUpdate is checked against this union.
```

## Migration from Orchestra `orchlab/core/{meta,mixins}`

The extracted package preserves Orchestra's runtime behaviour 1:1. A few
field names and type-level details were aligned with the original
Orchestra schema during the v0.1.x audit pass:

| Concern | Orchestra (`orchlab/core`) | `@gertsai/entity-audit` v0.1.x |
| --- | --- | --- |
| Creator field name | `creator_uuid` | `creator_uuid` (singular noun, kept for DB-schema parity) |
| Platform source | `session.clientPlatform` | `session.clientPlatform` (was `operatorType` in early extraction — corrected) |
| `update_action` on create | `{ type: 'create', params, timestamp }` | same — emitted by `buildDataForSet` |
| `update_action` on update | `{ type, params, timestamp }` | same — recorded when caller passes `opts.action` |
| `update_action` on delete | `{ type: 'delete', params: {}, timestamp }` | same — emitted by `buildDataForDelete` |
| `update_action` on restore | `{ type: 'restore', params: {}, timestamp }` | same — emitted by `buildDataForRestore` |
| `status` on delete | `'deleted'` | `'deleted'` |
| `status` on restore | `'created'` | `'created'` |
| `status` on initial set | `'created'` | `'created'` (override via `opts.status`) |
| `EntityBasicStatus` | open / string-typed | open string union with autocomplete hints (`'active' \| 'created' \| 'archived' \| 'deleted' \| (string & {})`) |
| `UpdateActionType` derivation | `keyof UnionToIntersection<UpdateActionMap[…]>` | indexed access on `UpdateActionMap[K].type` (equivalent semantics, more direct) |

### Why `creator_uuid` and not `created_by_uuid`?

The `MutationMarks` interface uses `creator_uuid` (singular noun, no
`_by_` infix) for the creation operator while every other identity field
follows the `{verb}_by_{uuid|platform}` convention. This historical
inconsistency is preserved deliberately so DB migrators and
Orchestra-derived fixtures stay byte-compatible without column renames.

### `clientPlatform` vs `operatorType`

`@gertsai/session` exposes both fields:

- `operatorType` — **who** acts (user category: `'web'`, `'api'`, `'ai'`, `'bot'`, `'system'`, …).
- `clientPlatform` — **what surface** the request comes from (device platform).

Audit fields record `clientPlatform`. The two usually coincide, but a
`'system'` operator can still report `'web'` as the originating UI, so
the distinction matters for compliance reports.

## Soft-delete + restore lifecycle

```
                     buildDataForSet
                          │
                          v
                    ┌───────────┐
                    │ 'created' │ ◄─────────┐
                    └─────┬─────┘           │
                          │                 │
              (domain promotion)            │
                          │                 │
                          v                 │
                    ┌───────────┐           │
                    │  'active' │           │
                    └─────┬─────┘           │
                          │                 │
                  buildDataForDelete         │
                          │                 │
                          v                 │
                    ┌───────────┐           │
                    │ 'deleted' │ ──────────┘
                    └───────────┘  buildDataForRestore
                       (tombstone retained;
                        deleted_* triplet set)
```

`buildDataForDelete` does not erase rows — it stamps the `deleted_*`
triplet and flips `status` to `'deleted'`. `buildDataForRestore` reverses
both: clears `deleted_*` to `null`, flips `status` back to `'created'`,
and bumps `updated_*`.

## Audit log query examples

`update_action` is the canonical audit log on every mutation builder. To
list every soft-delete in a Postgres-backed store:

```sql
SELECT _uid, updated_at, updated_by_uuid, update_action
FROM   entities
WHERE  update_action ->> 'type' = 'delete'
ORDER  BY updated_at DESC;
```

Filter by a business action (after extending `UpdateActionMap`):

```sql
SELECT _uid, update_action -> 'params' ->> 'email' AS invited_email
FROM   users
WHERE  update_action ->> 'type' = 'invite_sent';
```

In code:

```ts
const isDelete = (entity: { update_action?: UpdateAction }): boolean =>
  entity.update_action?.type === 'delete';

const audited = entities.filter(isDelete);
```

## DB schema reference

Every entity persisted through these builders carries the following nine
audit fields plus the lifecycle status and audit log:

| Column | Type | Nullable | Notes |
| --- | --- | --- | --- |
| `_uid` | string | no | Caller-generated unique identifier |
| `created_at` | `Timestamp` (`{ seconds, nanoseconds }`) | no | Stamped on `buildDataForSet`; never updated |
| `creator_uuid` | string | no | `session.operatorUuid` at creation time |
| `created_by_platform` | `ClientPlatform` (string) | no | `session.clientPlatform` at creation time |
| `updated_at` | `Timestamp` | no | Bumped on every mutation builder |
| `updated_by_uuid` | string | no | `session.operatorUuid` of last mutation |
| `updated_by_platform` | `ClientPlatform` | no | `session.clientPlatform` of last mutation |
| `deleted_at` | `Timestamp \| null` | yes | `null` while live; set by `buildDataForDelete` |
| `deleted_by_uuid` | string \| null | yes | `null` while live |
| `deleted_by_platform` | `ClientPlatform \| null` | yes | `null` while live |
| `status` | `EntityBasicStatus` | no | Default `'created'`; flips to `'deleted'` on soft-delete |
| `update_action` | `UpdateAction` | no | Latest audit entry: `{ type, params, timestamp }` |

Storage backends should index `(updated_at)`, `(deleted_at)` (partial
index `WHERE deleted_at IS NULL` for live-row queries), and
`(update_action ->> 'type')` for audit-log scans.

## License

Apache-2.0. See [`LICENSE`](./LICENSE).
